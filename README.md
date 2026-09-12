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

- `free-ai` launches repo-local Kilo CLI with `-m kilo/kilo-auto/free`.
- `MAX_COST_USD=0`.
- Paid env vars such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_*`, and `CODEX_*` are removed only for the child process.
- Runtime/config/log output is forced into this repo under `.runtime/` and `artifacts/`.
- Caller current directory is preserved as coding workspace.

Credentials:

Copy `.env.example` to `.env` and fill only free-tier keys. `.env` is gitignored.
