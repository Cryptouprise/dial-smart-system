# The 503 certification gates: keep, flip or remove

lane: deploy-gate-census  mode: council  reconciled by: manager:z-ai/glm-5.3-prime over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.2539 (reviewers $0.0657 + manager $0.1882)
tokens: 17597 in / 16000 out
files: supabase/functions-live/README.md, supabase/functions/_shared/tenant-context.ts

---

## Subset statement (applies to everything below)

All three reviewers worked from the same partial evidence: two greps (hit lines only), the README, and `tenant-context.ts`. **No gate body, no env-toggle read, no live snapshot content, no deploy config was visible.** Every "what it disables" claim below is inferred from the error-code name; every "literal return false" claim is inferred from line proximity. Reviewer 2's answer is also internally truncated (cuts off mid-table at `elevenlabs-tts`, no ordered plan delivered) — treat its classifications as partial.

## 1. Reconciled census (mechanical, high confidence)

73 hits = **54 gate-style `error_code` occurrences across 50 slugs** + **19 `throw new Error` contract assertions** (5
