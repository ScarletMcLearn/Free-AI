# Free Provider Notes

Outer runtime route:

1. `Kilo Auto Free` using `kilo/kilo-auto/free` when `KILO_API_KEY` is present.
2. Gemini `gemini-3.6-flash`, when `GEMINI_API_KEY` is present.
3. Cohere `north-mini-code-1-0`, when `COHERE_API_KEY` is present.
4. Mistral `mistral-small-2603`, when `MISTRAL_API_KEY` is present and account/key is constrained to Free Mode.
5. Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`, when both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are present.
6. Cerebras `gpt-oss-120b`, when `CEREBRAS_API_KEY` is present.
7. Groq `openai/gpt-oss-120b`, when `GROQ_API_KEY` is present.
8. SambaNova `DeepSeek-V3.2`, when `SAMBANOVA_API_KEY` is present.
9. SambaNova `gpt-oss-120b`, same provider/model fallback and same SambaNova quota.
10. OpenRouter `openrouter/free`, when `OPENROUTER_API_KEY` is present.
11. NVIDIA `openai/gpt-oss-120b`, optional and skipped unless `NVIDIA_API_KEY` is present.
12. STOP.

`free-ai` launches Kilo CLI as the coding-agent harness and points it at a repo-local OpenAI-compatible router. The router preserves the OpenAI-compatible request body from Kilo, including conversation and tool-call messages, then tries only configured free providers in order.

Provider notes:

| Provider | Model | Env | Quota/free note | Verification label |
| --- | --- | --- | --- | --- |
| Kilo Auto Free | `kilo/kilo-auto/free` | `KILO_API_KEY` | Kilo free route, provider-selected | `CONFIGURED` only when key present |
| Gemini | `gemini-3.6-flash` | `GEMINI_API_KEY` | Gemini free-tier key/account limits | `LIVE CHAT VERIFIED` when doctor says YES |
| Cohere | `north-mini-code-1-0` | `COHERE_API_KEY` | Cohere docs say free until rate limits for trial and production keys | `LIVE CHAT/TOOL/STREAM VERIFIED` only after probe passes |
| Mistral | `mistral-small-2603` | `MISTRAL_API_KEY` | Use Free Mode only; do not use paid fallback | `LIVE CHAT/TOOL/STREAM VERIFIED` only after probe passes |
| Cloudflare | `@cf/zai-org/glm-4.7-flash` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Workers AI Free allocation; Cloudflare-hosted models share same account allocation | `LIVE CHAT/TOOL/STREAM VERIFIED` only after probe passes |
| Cerebras | `gpt-oss-120b` | `CEREBRAS_API_KEY` | Current local status may be HTTP 402; skip safely | `CONFIGURED BUT UNHEALTHY` if 402 persists |
| Groq | `openai/gpt-oss-120b` | `GROQ_API_KEY` | Groq free developer limits | `LIVE CHAT VERIFIED` when doctor says YES |
| SambaNova | `DeepSeek-V3.2` | `SAMBANOVA_API_KEY` | Free tier: 20 RPM, 20 RPD, 200k TPD for preview model | `LIVE CHAT/TOOL/STREAM VERIFIED` only after probe passes |
| SambaNova GPT-OSS | `gpt-oss-120b` | `SAMBANOVA_API_KEY` | Same SambaNova quota as DeepSeek route | Same provider fallback only |
| OpenRouter | `openrouter/free` | `OPENROUTER_API_KEY` | Zero-price guard in request; no auto paid routing | `LIVE CHAT VERIFIED` when doctor says YES |
| NVIDIA | `openai/gpt-oss-120b` | `NVIDIA_API_KEY` | Optional; not required | `NOT CONFIGURED` unless key present |

Same-provider model fallbacks are not independent capacity. Cloudflare models share the same Workers AI account allocation. SambaNova `DeepSeek-V3.2` and `gpt-oss-120b` share the same SambaNova account quota.

Kilo internal routing is distinct from free-ai outer routing:

- Kilo internal routing: `kilo/kilo-auto/free` runs inside Kilo Gateway and chooses Kilo's currently available free model.
- free-ai outer routing: if a provider returns retryable failure (`408`, `429`, `500`, `502`, `503`, `504`, quota exhausted, rate limited, timeout, temporary capacity, no free model), free-ai invokes the next configured free provider.

OpenRouter is locked to `openrouter/free` and the router also sends `provider.max_price` with zero prompt, completion, request, and image price caps. Do not use `openrouter/auto` or `openrouter/auto:free`; OpenRouter documents those routes can select paid models.

Streaming:

- The router safely falls back only before any response is forwarded to Kilo.
- For `stream: true`, upstream SSE is buffered and forwarded after a successful provider response. This preserves OpenAI-compatible streaming shape for clients, but it is not token-by-token passthrough.
- If an upstream fails mid-stream, the router does not replay the request to another provider because that could duplicate tool or filesystem actions.

Sources checked September 12, 2026:

- Cohere North Mini Code: https://docs.cohere.com/docs/north-mini-code-1.0
- Cohere Compatibility API: https://docs.cohere.com/docs/compatibility-api
- Cloudflare GLM-4.7-Flash: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- Cloudflare AI Gateway REST API: https://developers.cloudflare.com/ai-gateway/usage/rest-api/
- Cloudflare Workers AI changelog: https://developers.cloudflare.com/changelog/product/workers-ai/
- Mistral Small 4: https://docs.mistral.ai/models/mistral-small-4-0-26-03
- Mistral model comparison: https://docs.mistral.ai/getting-started/models/compare?models=mistral-small-4-0-26-03
- SambaNova quickstart: https://docs.sambanova.ai/docs/en/get-started/quickstart
- SambaNova function calling: https://docs.sambanova.ai/docs/en/features/function-calling
- SambaNova rate limits: https://docs.sambanova.ai/docs/en/models/rate-limits
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
