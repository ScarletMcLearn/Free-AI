import fs from "node:fs";
import path from "node:path";
import { ensureDirs, loadDotEnv, mask, readProviderConfig, repoRoot, sanitizedEnvironment, buildKiloConfig } from "./lib/env.mjs";
import { requiredEnv, runtimeRoute } from "./lib/router.mjs";

ensureDirs();
const cfg = readProviderConfig();
const dotEnv = loadDotEnv();
const env = sanitizedEnvironment();
const kiloBin = process.platform === "win32"
  ? path.join(repoRoot, "node_modules", ".bin", "kilo.cmd")
  : path.join(repoRoot, "node_modules", ".bin", "kilo");

const paidStillPresent = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "CLAUDE_API_KEY",
  ...Object.keys(process.env).filter((k) => k.startsWith("CLAUDE_CODE_") || k.startsWith("CODEX_"))
].filter((k) => Object.hasOwn(env, k));

async function liveStatus(provider) {
  if (!requiredEnv(provider).every((name) => Boolean(dotEnv[name]))) return "-";
  if (!provider.baseUrl) return "UNKNOWN";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const body = {
      model: provider.id === "openrouter" ? "openrouter/free" : provider.model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 4,
      stream: false
    };
    if (provider.id === "openrouter") {
      body.provider = { max_price: { prompt: 0, completion: 0, request: 0, image: 0 } };
    }
    const baseUrl = provider.baseUrl.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => encodeURIComponent(dotEnv[name] || ""));
    const credentialName = requiredEnv(provider)[0];
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${dotEnv[credentialName] || ""}`,
        "http-referer": "https://local.free-ai.invalid",
        "x-title": "free-ai"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (response.ok) return "YES";
    if (response.status === 429) return "RATE LIMITED";
    if ([401, 403].includes(response.status)) return `AUTH ${response.status}`;
    if ([500, 502, 503, 504].includes(response.status)) return `UNAVAILABLE ${response.status}`;
    return `HTTP ${response.status}`;
  } catch (error) {
    clearTimeout(timeout);
    return error.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE";
  }
}

const routeRows = [];
for (const p of cfg.route) {
  routeRows.push({
    id: p.id,
    label: p.label,
    model: p.model || null,
    supported: p.free === true && p.costUsd === 0 && Boolean(p.baseUrl),
    configured: requiredEnv(p).every((name) => Boolean(dotEnv[name])),
    live: p.id === "nvidia" && !dotEnv[p.credentialEnv] ? "SKIPPED" : await liveStatus(p),
    credentialEnv: p.credentialEnv || null,
    credentialEnvs: requiredEnv(p),
    credential: requiredEnv(p).map((name) => `${name}=${mask(dotEnv[name]) || ""}`),
    costUsd: p.costUsd
  });
}

const report = {
  time: new Date().toISOString(),
  repoRoot,
  agentReady: fs.existsSync(kiloBin),
  workspaceRuntimeInsideRepo: [env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.XDG_DATA_HOME, env.XDG_STATE_HOME, env.HOME].every((p) => path.resolve(p).startsWith(repoRoot)),
  model: env.FREE_AI_MODEL,
  primaryModel: env.FREE_AI_PRIMARY_MODEL,
  maxCostUsd: env.MAX_COST_USD,
  paidProvidersDisabled: paidStillPresent.length === 0,
  paidVarsStillPresent: paidStillPresent,
  route: routeRows,
  configuredRuntimeRoute: runtimeRoute(dotEnv).map((p) => ({ id: p.id, label: p.label, model: p.model })),
  currentlyHealthyRoute: routeRows
    .filter((p) => p.supported && p.configured && p.live === "YES")
    .map((p) => ({ id: p.id, label: p.label, model: p.model }))
};

const kiloConfig = buildKiloConfig("http://127.0.0.1:1");
report.kiloConfigFreeOnly = kiloConfig.model === cfg.agent.model
  && kiloConfig.small_model === cfg.agent.model
  && kiloConfig.provider["free-ai-router"].options.baseURL === "http://127.0.0.1:1/v1"
  && ["anthropic", "openai", "azure"].every((p) => kiloConfig.disabled_providers.includes(p));

const badRoute = cfg.route.filter((p) => p.free !== true || p.costUsd !== 0);
const routeText = JSON.stringify(cfg.route);
const badHost = cfg.blockedHosts.some((host) => routeText.includes(host));
const unsafeOpenRouter = cfg.route.some((p) => p.id === "openrouter" && p.model !== "openrouter/free");
report.freeOnlyConfigValid = badRoute.length === 0 && !badHost && !unsafeOpenRouter && Number(cfg.maxCostUsd) === 0;

const outPath = path.join(repoRoot, "artifacts", "doctor", `doctor-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("FREE AI STATUS\n");
console.log(`Agent                     ${report.agentReady ? "READY" : "MISSING: run pnpm install"}`);
console.log("Provider                  Supported   Configured   Live             Model");
console.log("----------------------------------------------------------------------------");
for (const p of report.route) {
  console.log(`${p.label.padEnd(25)} ${(p.supported ? "YES" : "NO").padEnd(11)} ${(p.configured ? "YES" : "NO").padEnd(12)} ${String(p.live).padEnd(16)} ${p.model || "-"}`);
}
console.log(`\nPaid providers             ${report.paidProvidersDisabled ? "DISABLED" : "LEAKED: " + report.paidVarsStillPresent.join(", ")}`);
console.log(`Free-only config           ${report.freeOnlyConfigValid ? "PASS" : "FAIL"}`);
console.log(`Kilo config guard          ${report.kiloConfigFreeOnly ? "PASS" : "FAIL"}`);
console.log(`Runtime inside repo        ${report.workspaceRuntimeInsideRepo ? "PASS" : "FAIL"}`);
console.log("Configured route");
report.configuredRuntimeRoute.forEach((p, i) => console.log(`${i + 1}. ${p.label} / ${p.model}`));
console.log("Currently healthy route");
if (report.currentlyHealthyRoute.length === 0) console.log("-");
report.currentlyHealthyRoute.forEach((p, i) => console.log(`${i + 1}. ${p.label} / ${p.model}`));
console.log(`Report                     ${outPath}`);

if (!report.agentReady || !report.paidProvidersDisabled || !report.freeOnlyConfigValid || !report.kiloConfigFreeOnly || !report.workspaceRuntimeInsideRepo) process.exit(1);
