# Free Provider Notes

Outer runtime route:

1. `Kilo Auto Free` using `kilo/kilo-auto/free`.
2. NVIDIA `openai/gpt-oss-120b`, optional and skipped unless `NVIDIA_API_KEY` is present.
3. Gemini `gemini-3.6-flash`, when `GEMINI_API_KEY` is present.
4. Cerebras `gpt-oss-120b`, when `CEREBRAS_API_KEY` is present.
5. Groq `openai/gpt-oss-120b`, when `GROQ_API_KEY` is present.
6. OpenRouter `openrouter/free`, when `OPENROUTER_API_KEY` is present.

`free-ai` launches Kilo CLI as the coding-agent harness and points it at a repo-local OpenAI-compatible router. The router preserves the OpenAI-compatible request body from Kilo, including conversation and tool-call messages, then tries only configured free providers in order.

Kilo internal routing is distinct from free-ai outer routing:

- Kilo internal routing: `kilo/kilo-auto/free` runs inside Kilo Gateway and chooses Kilo's currently available free model.
- free-ai outer routing: if a provider returns retryable failure (`408`, `429`, `500`, `502`, `503`, `504`, quota exhausted, rate limited, timeout, temporary capacity, no free model), free-ai invokes the next configured free provider.

Kilo Auto Free remains first, but outer routing requires `KILO_API_KEY` because the local router calls the Kilo Gateway API directly. Without `KILO_API_KEY`, the doctor reports Kilo Auto as supported but not configured, and runtime skips it instead of using paid credentials.

If all configured free providers fail, the router returns:

```text
All configured free providers are exhausted or unavailable.
```

OpenRouter is locked to `openrouter/free` and the router also sends `provider.max_price` with zero prompt, completion, request, and image price caps. Do not use `openrouter/auto` or `openrouter/auto:free`; OpenRouter documents those routes can select paid models.

Streaming:

- The router safely falls back only before any response is forwarded to Kilo.
- For `stream: true`, upstream SSE is buffered and forwarded after a successful provider response. This preserves OpenAI-compatible streaming shape for clients, but it is not token-by-token passthrough.
- If an upstream fails mid-stream, the router does not replay the request to another provider because that could duplicate tool or filesystem actions.

Sources checked September 12, 2026:

- Kilo Auto Free: https://kilo.ai/docs/getting-started/using-kilo-for-free
- Kilo Auto Model: https://kilo.ai/docs/code-with-ai/agents/auto-model
- Kilo CLI reference: https://kilo.ai/docs/code-with-ai/platforms/cli-reference
- Kilo custom OpenAI-compatible providers: https://kilo.ai/docs/code-with-ai/agents/custom-models
- Kilo Gateway OpenAI-compatible API: https://kilo.ai/docs/gateway
- Gemini 3.6 Flash: https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Groq supported models/tool use: https://console.groq.com/docs/tool-use/overview
- Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Cerebras rate limits: https://inference-docs.cerebras.ai/support/rate-limits
- Cerebras chat/models API: https://inference-docs.cerebras.ai/api-reference/chat-completions
- Groq rate limits: https://console.groq.com/docs/rate-limits
- OpenRouter free variants: https://openrouter.ai/docs/guides/routing/model-variants/free
- OpenRouter Free Models Router: https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground
- OpenRouter warning about `openrouter/auto:free`: https://openrouter.zendesk.com/hc/en-us/articles/51679572756123-I-used-openrouter-auto-free-or-auto-and-still-got-charged
- OpenRouter pricing: https://openrouter.ai/pricing
- NVIDIA API Catalog quickstart: https://docs.api.nvidia.com/nim/docs/api-quickstart
- NVIDIA LLM API reference: https://docs.api.nvidia.com/nim/re/reference/llm-apis

Privacy:

Free providers can have different logging, retention, and training policies. Do not submit confidential source code unless you accept the selected provider's terms. Kilo docs specifically warn that Auto Free can route to partner providers that log prompts/outputs.
