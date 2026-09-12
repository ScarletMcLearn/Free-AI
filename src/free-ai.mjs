import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDirs, repoRoot, sanitizedEnvironment } from "./lib/env.mjs";

ensureDirs();

const callerCwd = process.env.FREE_AI_CALLER_CWD || process.cwd();
const env = sanitizedEnvironment();
const kiloCmd = process.platform === "win32"
  ? path.join(repoRoot, "node_modules", ".bin", "kilo.cmd")
  : path.join(repoRoot, "node_modules", ".bin", "kilo");

if (!fs.existsSync(kiloCmd)) {
  console.error("Kilo CLI missing. Run: pnpm install");
  process.exit(1);
}

const logFile = path.join(repoRoot, "artifacts", "logs", `free-ai-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
fs.appendFileSync(logFile, `free-ai launch\nrepo=${repoRoot}\nworkspace=${callerCwd}\nmodel=${env.FREE_AI_MODEL}\n`);

const passthrough = process.argv.slice(2);
if (passthrough.includes("--free-ai-check")) {
  console.log(JSON.stringify({
    repoRoot,
    workspace: callerCwd,
    model: env.FREE_AI_MODEL,
    maxCostUsd: env.MAX_COST_USD,
    appdata: env.APPDATA
  }, null, 2));
  process.exit(0);
}
let args;
if (passthrough.includes("--version") || passthrough.includes("-v") || passthrough.includes("--help") || passthrough.includes("-h")) {
  args = passthrough;
} else if (passthrough[0] === "run") {
  args = ["run", ...passthrough.slice(1), "-m", env.FREE_AI_MODEL];
} else {
  args = [callerCwd, "-m", env.FREE_AI_MODEL, ...passthrough];
}
const child = spawn(kiloCmd, args, {
  cwd: callerCwd,
  env,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    fs.appendFileSync(logFile, `exit signal=${signal}\n`);
    process.kill(process.pid, signal);
  }
  fs.appendFileSync(logFile, `exit code=${code ?? 0}\n`);
  process.exit(code ?? 0);
});
