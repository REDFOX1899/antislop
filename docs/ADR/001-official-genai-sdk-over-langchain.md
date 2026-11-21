# ADR-001: Native `@google/genai` SDK (>= 3.6.1) Over LangChain Wrappers (With Optional LangSmith Tracing)

- **Status:** Accepted
- **Date:** 2026-11-21
- **Context:** We need maximum throughput and full access to bleeding-edge Gemini 4 features released in Oct–Nov 2026: the `Interactions API` (`v1`), `Decisions API` (`gemini-decision-1` on `v1beta`), `thinking_level` (`low`/`medium`/`high`/`xhigh`), `gemini-nano-banana-2.1` multi-image reference fusion, `gemini-3.8-live`, and `Antigravity Managed Agents` (`antigravity-preview-09-2026`).

## Decision
1. **Use `@google/genai` (>= 3.6.1) directly** for all Gemini 4 model, Decisions API, Embedding, Image Generation, Live API, and Managed Agent calls.
2. **Do NOT route Gemini 4 calls through `@langchain/google-genai`**, because third-party wrapper layers lag behind the Nov 2026 Interactions API step schema, strip `previous_interaction_id` statefulness, do not expose `ai.decisions.create()` calibrated `noul`/`choice`/`score` outputs, and still inject deprecated `temperature`/`top_p` fields that Gemini 4 models reject or ignore.
3. **Optional Observability via LangSmith (`langsmith` `traceable()`):** If `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` are provided in `env/.env`, we wrap our native orchestrator functions with lightweight LangSmith tracing spans so judges can inspect latency waterfalls without sacrificing native SDK capabilities.

## Consequences
- Zero abstraction lag on `gemini-4-carbon`, `gemini-4-neon`, `gemini-4-hydrogen`, `gemini-decision-1`, and `antigravity-preview-09-2026`.
- Clean, transparent, debuggable TypeScript state machine with Server-Sent Events (SSE) streaming straight to AntiSlop Studio.
