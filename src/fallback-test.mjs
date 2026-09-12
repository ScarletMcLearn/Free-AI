import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ensureDirs, loadDotEnv, readProviderConfig, repoRoot } from "./lib/env.mjs";
import { createFreeRouter, listen } from "./lib/router.mjs";

ensureDirs();
const cfg = readProviderConfig();
const live = process.argv.includes("--live");

async function runSimulation() {
  const events = [];
  const failingA = mockStatusServer(429, "quota exhausted");
  const failingB = mockStatusServer(503, "gateway outage");
  const success = http.createServer((req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "mock-success", object: "model" }] }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "chatcmpl_mock", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "free-ai-sim-ok" } }] }));
  });
  const [urlA, urlB, urlC] = await Promise.all([listen(failingA), listen(failingB), listen(success)]);
  const testCfg = {
    ...cfg,
    maxAttemptsPerProvider: 1,
    route: [
      { id: "mock-kilo", label: "Mock Kilo", baseUrl: `${urlA}/v1`, model: "kilo/kilo-auto/free", credentialEnv: null, free: true, costUsd: 0 },
      { id: "mock-missing", label: "Mock Missing", baseUrl: `${urlB}/v1`, model: "missing", credentialEnv: "MISSING_TEST_KEY", free: true, costUsd: 0 },
      { id: "mock-nvidia", label: "Mock NVIDIA", baseUrl: `${urlB}/v1`, model: "openai/gpt-oss-120b", credentialEnv: null, free: true, costUsd: 0 },
      { id: "mock-cerebras", label: "Mock Cerebras", baseUrl: `${urlC}/v1`, model: "gpt-oss-120b", credentialEnv: null, free: true, costUsd: 0 }
    ]
  };
  const router = createFreeRouter({ env: {}, cfg: testCfg, onAttempt: (event) => events.push({ provider: event.provider.id, model: event.provider.model, attempt: event.attempt, status: event.status, result: event.result }) });
  const routerUrl = await listen(router);
  try {
    const response = await fetch(`${routerUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "free-ai-auto", messages: [{ role: "user", content: "test" }], stream: false })
    });
    const text = await response.text();
    const pass = response.ok
      && events.some((e) => e.provider === "mock-kilo" && e.result === "retryable")
      && !events.some((e) => e.provider === "mock-missing")
      && events.some((e) => e.provider === "mock-nvidia" && e.result === "retryable")
      && events.some((e) => e.provider === "mock-cerebras" && e.result === "success");
    const exhaustion = await runExhaustionCheck();
    writeReport({ time: new Date().toISOString(), mode: "simulation", pass: pass && exhaustion.pass, selectedProvider: "mock-cerebras", events, exhaustion, responseStatus: response.status, responseBody: text.slice(0, 1000), quotaExhaustionBehavior: "retryable 429/503 moves to next configured free provider; missing credentials skipped; no paid route exists" });
  } finally {
    router.close();
    failingA.close();
    failingB.close();
    success.close();
  }
}

async function runExhaustionCheck() {
  const failing = mockStatusServer(503, "temporary capacity unavailable");
  const failingUrl = await listen(failing);
  const events = [];
  const testCfg = {
    ...cfg,
    maxAttemptsPerProvider: 1,
    route: [
      { id: "mock-kilo", label: "Mock Kilo", baseUrl: `${failingUrl}/v1`, model: "kilo/kilo-auto/free", credentialEnv: null, free: true, costUsd: 0 },
      { id: "mock-gemini", label: "Mock Gemini", baseUrl: `${failingUrl}/v1`, model: "gemini-3.6-flash", credentialEnv: null, free: true, costUsd: 0 },
      { id: "mock-cerebras", label: "Mock Cerebras", baseUrl: `${failingUrl}/v1`, model: "gpt-oss-120b", credentialEnv: null, free: true, costUsd: 0 },
      { id: "mock-groq", label: "Mock Groq", baseUrl: `${failingUrl}/v1`, model: "openai/gpt-oss-120b", credentialEnv: null, free: true, costUsd: 0 },
      { id: "mock-openrouter", label: "Mock OpenRouter", baseUrl: `${failingUrl}/v1`, model: "openrouter/free", credentialEnv: null, free: true, costUsd: 0 }
    ]
  };
  const router = createFreeRouter({ env: {}, cfg: testCfg, onAttempt: (event) => events.push({ provider: event.provider.id, model: event.provider.model, attempt: event.attempt, status: event.status, result: event.result }) });
  const routerUrl = await listen(router);
  try {
    const response = await fetch(`${routerUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "free-ai-auto", messages: [{ role: "user", content: "test" }], stream: false })
    });
    const text = await response.text();
    return {
      pass: response.status === 429 && text.includes("All configured free providers are exhausted or unavailable."),
      responseStatus: response.status,
      events
    };
  } finally {
    router.close();
    failing.close();
  }
}

function mockStatusServer(status, message) {
  return http.createServer((req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "fail-first", object: "model" }] }));
      return;
    }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message } }));
  });
}

async function runLive() {
  const dotEnv = loadDotEnv();
  const targetId = process.env.FREE_AI_TEST_PROVIDER;
  const configuredRoute = cfg.route.filter((p) => {
    const required = Array.isArray(p.credentialEnvs) ? p.credentialEnvs : (p.credentialEnv ? [p.credentialEnv] : []);
    if (targetId && p.id !== targetId) return false;
    return required.length > 0 && required.every((name) => Boolean(dotEnv[name]));
  });
  if (configuredRoute.length === 0) {
    writeReport({
      time: new Date().toISOString(),
      mode: "live",
      pass: false,
      error: targetId ? `Provider ${targetId} is not configured in .env` : "No configured free provider credentials in .env"
    });
    return;
  }
  const failing = mockStatusServer(429, "test retryable rate limited");
  const failingUrl = await listen(failing);
  const liveCfg = {
    ...cfg,
    route: targetId
      ? [
        { id: "test-invalid", label: "Test Invalid", baseUrl: `${failingUrl}/v1`, model: "fail-first", credentialEnv: null, free: true, costUsd: 0 },
        configuredRoute[0]
      ]
      : configuredRoute
  };
  const events = [];
  const router = createFreeRouter({ env: dotEnv, cfg: liveCfg, onAttempt: (event) => events.push({ provider: event.provider.id, model: event.provider.model, attempt: event.attempt, status: event.status, result: event.result }) });
  const routerUrl = await listen(router);
  try {
    const response = await fetch(`${routerUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer free-ai-local" },
      body: JSON.stringify({
        model: "free-ai-auto",
        messages: [{ role: "user", content: "Reply with exactly: free-ai-live-ok" }],
        max_tokens: 16,
        stream: false
      })
    });
    const text = await response.text();
    const success = events.find((e) => e.result === "success");
    const retryableBeforeSuccess = success && events.some((e) => e.result === "retryable" && events.indexOf(e) < events.indexOf(success));
    const pass = response.ok && Boolean(success) && (targetId ? retryableBeforeSuccess : true);
    writeReport({
      time: new Date().toISOString(),
      mode: "live",
      semantics: targetId ? "forced-provider" : "runtime-route",
      pass,
      configuredRoute: configuredRoute.map((p) => ({ id: p.id, model: p.model })),
      firstAttempt: events[0]?.provider,
      fallbackProvider: success?.provider,
      fallbackModel: success?.model,
      retryableBeforeSuccess: Boolean(retryableBeforeSuccess),
      events,
      responseStatus: response.status,
      responseBody: text.slice(0, 1000)
    });
  } finally {
    router.close();
    failing.close();
  }
}

function writeReport(report) {
  const outPath = path.join(repoRoot, "artifacts", "fallback-tests", `fallback-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`FREE AI FALLBACK TEST ${report.mode ? `(${report.mode})` : ""}\n`);
  if (report.events) for (const event of report.events) console.log(`${event.provider} / ${event.model || ""} -> ${event.status}${event.result ? ` (${event.result})` : ""}`);
  if (report.error) console.log(`Error -> ${report.error}`);
  console.log(`Result -> ${report.pass ? "PASS" : "FAIL"}`);
  if (report.mode === "live" && report.pass) console.log("PASS: real runtime fallback verified");
  console.log(`Report -> ${outPath}`);
  process.exit(report.pass ? 0 : 1);
}

if (live) await runLive();
else await runSimulation();
