import fs from "node:fs";
import path from "node:path";
import { ensureDirs, loadDotEnv, mask, readProviderConfig, repoRoot, sanitizedEnvironment } from "./lib/env.mjs";

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

const report = {
  time: new Date().toISOString(),
  repoRoot,
  agentReady: fs.existsSync(kiloBin),
  workspaceRuntimeInsideRepo: [env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.XDG_DATA_HOME, env.XDG_STATE_HOME, env.HOME].every((p) => path.resolve(p).startsWith(repoRoot)),
  model: env.FREE_AI_MODEL,
  maxCostUsd: env.MAX_COST_USD,
  paidProvidersDisabled: paidStillPresent.length === 0,
  paidVarsStillPresent: paidStillPresent,
  route: cfg.route.map((p) => ({
    id: p.id,
    label: p.label,
    model: p.model || null,
    status: p.credentialEnv ? (dotEnv[p.credentialEnv] ? "CONFIGURED" : "NOT CONFIGURED") : "READY",
    credentialEnv: p.credentialEnv || null,
    credential: p.credentialEnv ? mask(dotEnv[p.credentialEnv]) : null,
    costUsd: p.costUsd
  }))
};

const kiloConfig = JSON.parse(env.KILO_CONFIG_CONTENT);
report.kiloConfigFreeOnly = kiloConfig.model === "kilo/kilo-auto/free"
  && kiloConfig.small_model === "kilo/kilo-auto/free"
  && ["anthropic", "openai", "azure"].every((p) => kiloConfig.disabled_providers.includes(p));

const badRoute = cfg.route.filter((p) => p.free !== true || p.costUsd !== 0);
const routeText = JSON.stringify(cfg.route);
const badHost = cfg.blockedHosts.some((host) => routeText.includes(host));
report.freeOnlyConfigValid = badRoute.length === 0 && !badHost && Number(cfg.maxCostUsd) === 0;

const outPath = path.join(repoRoot, "artifacts", "doctor", `doctor-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("FREE AI STATUS\n");
console.log(`Agent                     ${report.agentReady ? "READY" : "MISSING: run pnpm install"}`);
for (const p of report.route) console.log(`${p.label.padEnd(26)} ${p.status}`);
console.log(`\nPaid providers             ${report.paidProvidersDisabled ? "DISABLED" : "LEAKED: " + report.paidVarsStillPresent.join(", ")}`);
console.log(`Free-only config           ${report.freeOnlyConfigValid ? "PASS" : "FAIL"}`);
console.log(`Kilo config guard          ${report.kiloConfigFreeOnly ? "PASS" : "FAIL"}`);
console.log(`Runtime inside repo        ${report.workspaceRuntimeInsideRepo ? "PASS" : "FAIL"}`);
console.log(`Current preferred route    ${report.route.map((p) => p.label).join(" -> ")}`);
console.log(`Report                     ${outPath}`);

if (!report.agentReady || !report.paidProvidersDisabled || !report.freeOnlyConfigValid || !report.kiloConfigFreeOnly || !report.workspaceRuntimeInsideRepo) process.exit(1);
