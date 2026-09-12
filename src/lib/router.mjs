import http from "node:http";
import { randomUUID } from "node:crypto";
import { loadDotEnv, readProviderConfig } from "./env.mjs";

export function classifyProviderError(status, bodyText, cfg = readProviderConfig()) {
  const text = String(bodyText || "").toLowerCase();
  if (cfg.retryableStatusCodes.includes(Number(status))) return "retryable";
  if (["400", "401", "402", "403"].includes(String(status))) return "configuration";
  if (cfg.retryableText.some((needle) => text.includes(needle))) return "retryable";
  return "fatal";
}

export function runtimeRoute(env = loadDotEnv(), includeUnconfigured = false, cfg = readProviderConfig()) {
  const forcedProvider = env.FREE_AI_FORCE_PROVIDER || "";
  return cfg.route
    .filter((provider) => provider.free === true && provider.costUsd === 0)
    .filter((provider) => !forcedProvider || provider.id === forcedProvider)
    .map((provider) => ({
      ...provider,
      configured: requiredEnv(provider).every((name) => Boolean(env[name]))
    }))
    .filter((provider) => includeUnconfigured || provider.configured);
}

export function requiredEnv(provider) {
  if (Array.isArray(provider.credentialEnvs)) return provider.credentialEnvs;
  return provider.credentialEnv ? [provider.credentialEnv] : [];
}

function providerBaseUrl(provider, env) {
  const raw = provider.baseUrl || "";
  return raw.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => encodeURIComponent(env[name] || ""));
}

function providerRequestBody(provider, payload) {
  const body = { ...payload, model: provider.model };
  if (provider.id === "openrouter") {
    body.model = "openrouter/free";
    body.provider = {
      ...(body.provider || {}),
      max_price: { prompt: 0, completion: 0, request: 0, image: 0 }
    };
  }
  return body;
}

function shouldCooldown(status, kind, bodyText) {
  const text = String(bodyText || "").toLowerCase();
  return kind === "configuration"
    || Number(status) === 429
    || text.includes("quota exhausted")
    || text.includes("rate limited")
    || text.includes("rate-limit")
    || text.includes("no available free model")
    || text.includes("temporary capacity");
}

function retryAfterMs(response) {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function cooldownKey(provider) {
  return provider.quotaPool || provider.id;
}

function cooldownUntil(status, kind, response = null) {
  if (kind === "configuration") return Infinity;
  if (Number(status) === 429) return Date.now() + (response ? retryAfterMs(response) ?? 60000 : 60000);
  return Date.now() + 60000;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function callProvider(provider, payload, env, signal) {
  const body = providerRequestBody(provider, payload);
  const credentialName = requiredEnv(provider)[0];
  const response = await fetch(`${providerBaseUrl(provider, env).replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env[credentialName] || ""}`,
      "http-referer": "https://local.free-ai.invalid",
      "x-title": "free-ai"
    },
    body: JSON.stringify(body),
    signal
  });
  const text = await response.text();
  return { response, text };
}

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

export function createFreeRouter({ env = loadDotEnv(), onAttempt = () => {}, cfg = readProviderConfig() } = {}) {
  const unavailable = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        writeJson(res, 200, { ok: true, route: runtimeRoute(env, false, cfg).map((p) => p.id) });
        return;
      }
      if (req.method === "GET" && req.url === "/v1/models") {
        writeJson(res, 200, {
          object: "list",
          data: [{ id: cfg.agent.model.split("/")[1], object: "model", owned_by: "free-ai" }]
        });
        return;
      }
      if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
        writeJson(res, 404, { error: { message: "Not found" } });
        return;
      }

      const payload = await readJson(req);
      const route = runtimeRoute(env, false, cfg);
      const failures = [];
      for (const provider of route) {
        const key = cooldownKey(provider);
        if (unavailable.has(key)) {
          const reason = unavailable.get(key);
          if (reason.until !== Infinity && reason.until <= Date.now()) {
            unavailable.delete(key);
          } else {
            failures.push({ provider: provider.id, model: provider.model, status: "skipped", kind: reason.kind, body: reason.body });
            onAttempt({ provider, attempt: 0, status: "skipped", result: reason.kind });
            continue;
          }
        }
        for (let attempt = 1; attempt <= cfg.maxAttemptsPerProvider; attempt += 1) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
          try {
            onAttempt({ provider, attempt, status: "start" });
            const { response, text } = await callProvider(provider, payload, env, controller.signal);
            clearTimeout(timeout);
            if (response.ok) {
              onAttempt({ provider, attempt, status: response.status, result: "success" });
              res.writeHead(response.status, {
                "content-type": response.headers.get("content-type") || "application/json",
                "x-free-ai-provider": provider.id,
                "x-free-ai-model": provider.model
              });
              res.end(text);
              return;
            }
            const kind = classifyProviderError(response.status, text, cfg);
            failures.push({ provider: provider.id, model: provider.model, status: response.status, kind, body: text.slice(0, 500) });
            onAttempt({ provider, attempt, status: response.status, result: kind });
            if (shouldCooldown(response.status, kind, text)) unavailable.set(key, { kind, body: text.slice(0, 200), until: cooldownUntil(response.status, kind, response) });
            if (kind !== "retryable") break;
          } catch (error) {
            clearTimeout(timeout);
            const kind = error.name === "AbortError" ? "retryable" : classifyProviderError(503, error.message, cfg);
            failures.push({ provider: provider.id, model: provider.model, status: error.name || "error", kind, body: error.message });
            onAttempt({ provider, attempt, status: error.name || "error", result: kind });
            if (shouldCooldown(503, kind, error.message)) unavailable.set(key, { kind, body: error.message.slice(0, 200), until: cooldownUntil(503, kind) });
            if (kind !== "retryable") break;
          }
        }
      }
      writeJson(res, 429, {
        error: {
          message: "All configured free providers are exhausted or unavailable.",
          type: "free_ai_exhausted",
          failures
        }
      });
    } catch (error) {
      writeJson(res, 500, { error: { message: error.message, type: "free_ai_router_error", id: randomUUID() } });
    }
  });
  return server;
}

export function listen(server, host = "127.0.0.1", port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      resolve(`http://${address.address}:${address.port}`);
    });
  });
}
