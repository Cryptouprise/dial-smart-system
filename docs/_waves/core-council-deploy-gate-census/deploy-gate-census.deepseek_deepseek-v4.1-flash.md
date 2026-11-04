# The 503 certification gates: keep, flip or remove - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0083

---

## Census

FACT: the supplied grep contains exactly **73** `NOT_CERTIFIED` lines, across **50 function files + 2 `_shared` files**. The "73" is confirmed for this grep.

Three structural classes (the grep line itself distinguishes them):

- **A. Confirmed 503 gate responses — 9 lines.** Full `return new Response(JSON.stringify({ success: false, disabled: true, error_code: '…_NOT_CERTIFIED', error: '…' }))`: `ai-assistant-config:203`, `ai-configuration-complete:341`, `ai-error-analyzer:55`, `ai-workflow-generator:18`, `backfill-call-agent-data:19`, `demo-sms-reply:163`, `enhanced-spam-lookup:34`, `retell-business-verification:44`, `telnyx-scheduled-events:52`.
- **B. Confirmed validation throws — 19 lines.** `throw new Error('…_NOT_CERTIFIED…')`: `outbound-calling:890,899,903,907,914` (5); `_shared/call-exposure-policy.ts:12,18` (2); `_shared/retell-provider-contract.ts:93,96,99,102,105,108,111,114,120,128,147,151` (12). These are provider-contract assertions, **not** gates.
- **C. Ambiguous — 45 lines.** Only `error_code: '…'` is visible; the enclosing structure is not in evidence (could be a gate response, a thrown object, or a log).

9 + 19 + 45 = 73. ✓
