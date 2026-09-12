# Free Provider Notes

Implemented route:

1. `Kilo Auto Free` using `kilo/kilo-auto/free`.
2. NVIDIA Build/NIM free endpoints, when `NVIDIA_API_KEY` is present.
3. Google Gemini API free tier, when `GEMINI_API_KEY` is present.
4. Cerebras Inference free tier, when `CEREBRAS_API_KEY` is present.
5. Groq free tier, when `GROQ_API_KEY` is present.
6. OpenRouter Free Models Router `openrouter/free`, when `OPENROUTER_API_KEY` is present.

Primary coding-agent command launches Kilo CLI with `-m kilo/kilo-auto/free`. Kilo preserves session context and routes Auto Free requests server-side among currently available free models.

Sources checked September 12, 2026:

- Kilo Auto Free: https://kilo.ai/docs/getting-started/using-kilo-for-free
- Kilo Auto Model: https://kilo.ai/docs/code-with-ai/agents/auto-model
- Kilo CLI reference: https://kilo.ai/docs/code-with-ai/platforms/cli-reference
- Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Cerebras rate limits: https://inference-docs.cerebras.ai/support/rate-limits
- Groq rate limits: https://console.groq.com/docs/rate-limits
- OpenRouter Free Models Router: https://openrouter.ai/openrouter/free/apps
- OpenRouter pricing: https://openrouter.ai/pricing
- NVIDIA API Catalog quickstart: https://docs.api.nvidia.com/nim/docs/api-quickstart

Privacy:

Free providers can have different logging, retention, and training policies. Do not submit confidential source code unless you accept the selected provider's terms. Kilo docs specifically warn that Auto Free can route to partner providers that log prompts/outputs.
