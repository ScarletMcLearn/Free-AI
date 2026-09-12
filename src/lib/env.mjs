import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadDotEnv(file = path.join(repoRoot, ".env")) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function readProviderConfig() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "free-providers.json"), "utf8"));
}

export function ensureDirs() {
  for (const dir of [
    "artifacts/logs",
    "artifacts/doctor",
    "artifacts/fallback-tests",
    ".runtime/appdata",
    ".runtime/localappdata",
    ".runtime/home",
    ".runtime/xdg-config",
    ".runtime/xdg-cache",
    ".runtime/xdg-data",
    ".runtime/xdg-state"
  ]) {
    fs.mkdirSync(path.join(repoRoot, dir), { recursive: true });
  }
}

export function configuredProviders(env = loadDotEnv()) {
  const cfg = readProviderConfig();
  return cfg.route.filter((provider) => {
    if (provider.free !== true || provider.costUsd !== 0) return false;
    return !provider.credentialEnv || Boolean(env[provider.credentialEnv]);
  });
}

export function buildKiloConfig(routerUrl = null) {
  const cfg = readProviderConfig();
  const model = routerUrl ? cfg.agent.model : cfg.agent.primaryModel;
  const config = {
    $schema: "https://app.kilo.ai/config.json",
    model,
    small_model: model,
    disabled_providers: [
      "anthropic",
      "openai",
      "openai-chat",
      "openai-responses",
      "azure",
      "amazon-bedrock",
      "google-vertex",
      "xai"
    ],
    permission: "ask"
  };
  if (routerUrl) {
    config.provider = {
      "free-ai-router": {
        options: {
          apiKey: "free-ai-local",
          baseURL: `${routerUrl}/v1`,
          timeout: cfg.requestTimeoutMs
        },
        models: {
          "free-ai-auto": {
            name: "Free-AI Runtime Router",
            tool_call: true,
            reasoning: true,
            limit: {
              context: 131072,
              output: 32768
            }
          }
        }
      }
    };
  }
  return config;
}

export function sanitizedEnvironment(extra = {}) {
  const cfg = readProviderConfig();
  const env = { ...process.env };
  Object.assign(env, loadDotEnv(), extra);
  for (const key of Object.keys(env)) {
    if (cfg.blockedEnvironmentNames.includes(key)) delete env[key];
    if (cfg.blockedEnvironmentPrefixes.some((prefix) => key.startsWith(prefix))) delete env[key];
  }
  env.MAX_COST_USD = "0";
  env.FREE_AI_REPO = repoRoot;
  env.APPDATA = path.join(repoRoot, ".runtime", "appdata");
  env.LOCALAPPDATA = path.join(repoRoot, ".runtime", "localappdata");
  env.XDG_CONFIG_HOME = path.join(repoRoot, ".runtime", "xdg-config");
  env.XDG_CACHE_HOME = path.join(repoRoot, ".runtime", "xdg-cache");
  env.XDG_DATA_HOME = path.join(repoRoot, ".runtime", "xdg-data");
  env.XDG_STATE_HOME = path.join(repoRoot, ".runtime", "xdg-state");
  env.HOME = path.join(repoRoot, ".runtime", "home");
  env.FREE_AI_MODEL = cfg.agent.model;
  env.FREE_AI_PRIMARY_MODEL = cfg.agent.primaryModel;
  env.KILO_CONFIG_CONTENT = JSON.stringify(buildKiloConfig(extra.FREE_AI_ROUTER_URL || null));
  return env;
}

export function mask(value) {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
