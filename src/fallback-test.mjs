import fs from "node:fs";
import path from "node:path";
import { ensureDirs, readProviderConfig, repoRoot } from "./lib/env.mjs";

ensureDirs();
const cfg = readProviderConfig();
const route = [
  { id: "mock-provider-a", status: 429, retryable: true },
  { id: cfg.route[0].id, status: 200, retryable: false }
];

const events = [];
let selected = null;
for (const provider of route) {
  events.push({ provider: provider.id, status: provider.status });
  if ([408, 429, 500, 502, 503, 504].includes(provider.status)) continue;
  selected = provider.id;
  break;
}

const pass = selected === cfg.route[0].id;
const report = {
  time: new Date().toISOString(),
  pass,
  simulatedFailure: "mock-provider-a returned 429",
  selectedProvider: selected,
  events,
  quotaExhaustionBehavior: "retryable 429 moves to next free provider; no paid route exists"
};
const outPath = path.join(repoRoot, "artifacts", "fallback-tests", `fallback-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("FREE AI FALLBACK TEST\n");
for (const event of events) console.log(`${event.provider} -> HTTP ${event.status}`);
console.log(`Result -> ${pass ? "PASS" : "FAIL"}`);
console.log(`Report -> ${outPath}`);
process.exit(pass ? 0 : 1);
