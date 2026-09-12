# Free-AI

Repo-contained free-only coding-agent launcher for Windows PowerShell.

Commands:

```powershell
free-ai
free-ai-doctor
free-ai-test
```

Install:

```powershell
pnpm install
```

Optional global command setup:

```powershell
$bin = "H:\Projects\AI\Free-AI\Free-AI\bin"
$old = [Environment]::GetEnvironmentVariable("Path", "User")
if (($old -split ";") -notcontains $bin) {
  [Environment]::SetEnvironmentVariable("Path", ($old.TrimEnd(";") + ";" + $bin), "User")
}
```

Open a new PowerShell after changing PATH.

Free-only guardrails:

- `free-ai` launches repo-local Kilo CLI and points it at a repo-local OpenAI-compatible router.
- The router tries `kilo/kilo-auto/free` first when configured, then only configured free providers: Gemini `gemini-3.6-flash`, Cerebras, Groq, OpenRouter Free, then STOP.
- NVIDIA is optional and skipped when `NVIDIA_API_KEY` is absent.
- OpenRouter uses `openrouter/free` plus zero-price routing caps; `openrouter/auto:free` is not used.
- `MAX_COST_USD=0`.
- Paid env vars such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_*`, and `CODEX_*` are removed only for the child process.
- Runtime/config/log output is forced into this repo under `.runtime/` and `artifacts/`.
- Caller current directory is preserved as coding workspace.

Credentials:

Copy `.env.example` to `.env` and fill only free-tier keys. `.env` is gitignored.

Actual runtime route is shown by:

```powershell
free-ai-doctor
```

Fast quota-free router test:

```powershell
free-ai-test
```

Safe live fallback test, using the first configured free provider after an intentionally failing temporary provider:

```powershell
free-ai-test --live
```

If every configured free provider fails, `free-ai` stops with:

```text
All configured free providers are exhausted or unavailable.
```

Streaming fallback is intentionally conservative: fallback happens only before any provider response is returned. Mid-stream replay is not attempted because coding-agent tool calls can mutate files.
