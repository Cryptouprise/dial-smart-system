# Telnyx as Background Infrastructure — Integration Architecture

**Written 17 August 2026** for `dial-smart-system` (React 18 + Vite, Supabase Postgres +
Deno edge functions + RLS + pg_cron, multi-tenant via `organizations`, prepaid credit system
with reservation + idempotency, Retell as parallel provider).

Companion to `TELNYX_EXPERT_REFERENCE.md` V6.0. That doc is *what Telnyx offers*. This one is
*how to run it as the always-on substrate underneath the product*.

Facts here were verified against the npm registry, the `telnyx@7.15.0` source tarball, the
official OpenAPI spec (5.8 MB, 863 paths), live HTTP probes against `api.telnyx.com`, and Telnyx
release notes. Items marked **[UNVERIFIED]** are gaps we could not close.

---

## 1. SDKs

### Server: `telnyx` v7.15.0 — Deno is officially supported

| Fact | Value |
|---|---|
| Version | **7.15.0**, published 2026-08-16 |
| Cadence | ~weekly (7.3.0 → 7.15.0 between 1 Jul and 16 Aug) |
| Generator | Stainless |
| Runtime deps | exactly one: `standardwebhooks@^1.0.0` (+ optional peer `ws`) |
| TypeScript | ≥ 4.9 |

The README explicitly lists **Deno v1.28.0+**, Cloudflare Workers, Vercel Edge, and Bun as
supported. A grep of the entire `src/` tree for `node:` builtins and
`require('crypto'|'fs'|'buffer')` returns **zero hits** — it is pure `fetch` + Web APIs.
`import Telnyx from "npm:telnyx@7.15.0"` works in Supabase Edge Functions.

**But don't reach for it on hot paths.** The tarball is 2.6 MB covering 863 paths. In a
cold-start-sensitive edge function, importing the whole client to call two endpoints is real
latency. Use hand-rolled `fetch` for `POST /calls` and `POST /messages`; use the SDK where the
type surface earns its weight (assistants, managed accounts, reports).

### Browser libraries

| Package | Version | Last publish | Verdict |
|---|---|---|---|
| `@telnyx/webrtc` | 2.27.9 | 2026-08-10 | **Actively maintained.** The real browser voice client |
| `@telnyx/ai-agent-lib` | 0.6.2 | 2026-08-07 | **Alive.** State/session layer for AI-agent UIs over WebRTC. Pre-1.0 — API unstable |
| `@telnyx/react-client` | 1.0.2 | 2026-04-03 | **Effectively frozen.** 4 versions ever. Don't build on it — wrap `@telnyx/webrtc` yourself |

### `@telnyx/edge-runtime` (AgentSDK) — know about it, don't adopt it

Edge Compute launched 3 Aug 2026: Functions (GA), StatefulActor (beta), KV (GA), CloudFS (beta),
SQLDB, Object Storage (GA), all reachable via bindings with no credentials or egress fees.
AgentSDK (beta, 10 Aug) is a TypeScript `Agent` base class on top with durable message history
and background scheduling.

**Strategic read: this is Telnyx building a direct competitor to our Supabase edge layer.**
Adopting it means running agent logic *outside* our RLS boundary, away from our Postgres, in a
beta runtime. Not now. But it explains why MCP-as-a-tool got first-class treatment.

---

## 2. MCP — both directions

### 2a. Claude/Cursor managing Telnyx (hosted remote MCP)

**Live-probed 17 Aug 2026.**

| Property | Value |
|---|---|
| Endpoint | `https://api.telnyx.com/v2/mcp` |
| Transport | **Streamable HTTP** (not SSE) |
| Protocol | `2025-06-18` · server `telnyx_api` v3.0.0 |
| Session header | `mcp-session-id` |
| Auth | `Authorization: Bearer <TELNYX_API_KEY>` — **required only for `tools/call`** |
| Discovery | **Unauthenticated** — `tools/list` works with no key |
| Required Accept | `application/json, text/event-stream` |

Tools exposed: `list_api_endpoints`, `get_api_endpoint_schema`, `invoke_api_endpoint`
(a generic proxy over the whole API — "Code Mode"), plus `open_number_intelligence`,
`open_usage_cost_explorer`, `open_voice_monitor`.

**MCP Apps** (`GET /v2/mcp/apps`, public):

| Slug | Endpoint | Use |
|---|---|---|
| `number-intelligence` | `/v2/mcp/apps/number-intelligence/mcp` | Number Lookup + readiness |
| `usage-cost-explorer` | `/v2/mcp/apps/usage-cost-explorer/mcp` | Balance, usage, billing groups |
| **`voice-monitor`** | `/v2/mcp/apps/voice-monitor/mcp` | **Read-only live call monitoring, timelines, recordings** |

`voice-monitor` is immediately useful — point Claude Code at it for live campaign triage with
zero tooling of our own.

Local option: `telnyx-mcp@7.15.0` on npm (`npx telnyx-mcp@latest`), supports stdio / SSE /
streamable HTTP. ⚠️ **The Python `team-telnyx/telnyx-mcp-server` is deprecated** — its README
now says migrate to the TypeScript version.

### 2b. A Telnyx voice assistant calling OUR MCP server mid-call

**This is the deepest integration available, and the API shape changed from what
`TELNYX_VOICE_PLATFORM.md` documents.**

Our old docs describe an inline tool `{"type":"mcp_server","url":…}` inside `tools[]`.
**That shape is gone.** MCP servers are now standalone resources referenced by ID.

**Step 1 — register the server:**

```jsonc
POST /v2/ai/mcp_servers
{
  "name": "dial-smart-crm",
  "type": "<see UNVERIFIED below>",
  "url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/mcp",
  "api_key_ref": "dialsmart_mcp_bearer",     // → an Integration Secret identifier
  "allowed_tools": ["lookup_lead", "book_appointment", "log_disposition"]
}
```

Full CRUD at `/ai/mcp_servers` and `/ai/mcp_servers/{id}`. Response is exactly
`{ id, created_at, name, type, url, allowed_tools, api_key_ref }`.

**Step 2 — attach to the assistant.** `AssistantCreateParams` carries a top-level `mcp_servers[]`:

```ts
export interface AssistantMcpServer {
  id: string;                     // an /ai/mcp_servers id
  allowed_tools?: Array<string>;  // per-assistant narrowing; falls back to server-level
}
```

**Two-level allowlisting (server + per-assistant) is a genuinely good multi-tenant primitive** —
one registered server, different tool subsets per assistant.

`GET /ai/assistants/{id}/versions?include_mcp_servers=true` — MCP attachments are
**version-scoped** and participate in canary deploys.

**Auth:** `api_key_ref` points at an **Integration Secret**, not a raw token:

```jsonc
POST /v2/integration_secrets
{ "identifier": "dialsmart_mcp_bearer", "type": "bearer", "token": "<opaque>" }
// type is "bearer" | "basic"
```

Telnyx stores it and presents it to our server. Rotate by updating the secret — no assistant edits.

**Gaps:**
- **[UNVERIFIED] the `type` enum.** The OpenAPI spec declares it as a bare
  `{"type":"string","title":"Type"}` — no enum, no description. Likely `"sse"` or
  `"streamable_http"`. **Probe it:** POST with a junk value and read the 422 body.
- **[UNVERIFIED] `telnyx_conversation_id` injection.** The string appears **zero times** in the
  5.8 MB spec. Our V5 claim traces to the old inline-tool shape. **Do not depend on it** — design
  tools to take an explicit correlation ID the assistant fills from a dynamic variable we injected.
- **[UNVERIFIED] MCP latency budget.** Unpublished. The sibling webhook tool's default async
  patience is **300 ms**; assume MCP `tools/call` is on a comparable synchronous budget and treat
  anything over ~500 ms as a design error.

**Telnyx's own caveat**, from the [MCP release note](https://telnyx.com/release-notes/mcp-servers-ai-agents):
the webhook tool *"still offers broader coverage and, in some cases lower latency."*

### Recommendation

**Webhook tools for latency-critical mid-call operations** (lead lookup, availability check,
disposition write). **MCP for the long tail** — the composable, discoverable surface. MCP's win
is that one registered server + `allowed_tools` gives you N tools without N tool definitions;
the webhook tool's win is latency and total control.

**Bonus:** `POST /ai/assistants/import` accepts `provider: "elevenlabs" | "vapi" | "retell"` with
an `api_key_ref` and optional `import_ids`. We can bulk-import existing Retell agents rather
than hand-porting.

---

## 3. Webhooks at scale

### 3.1 Event catalogue — 71 distinct events

Extracted from the SDK's generated types.

**Voice lifecycle:** `call.initiated` `call.answered` `call.bridged` `call.hangup` `call.hold`
`call.unhold` `call.enqueued` `call.dequeued` `call.left_queue`
**AMD:** `call.machine.detection.ended` `call.machine.greeting.ended`
`call.machine.premium.detection.ended` `call.machine.premium.greeting.ended`
**Media:** `call.playback.started/ended` `call.speak.started/ended` `call.recording.saved`
`call.recording.error` `call.recording.transcription.saved` `call.transcription`
`call.fork.started/stopped` `streaming.*` `siprec.*`
**Interaction:** `call.dtmf.received` `call.gather.ended` `call.refer.started/completed/failed`
`call.payment.*`
**AI:** `call.conversation.ended` `call.conversation_insights.generated` `call.ai_gather.ended`
`call.ai_gather.partial_results` `call.ai_gather.message_history_updated`
**Trust/billing:** `call.deepfake_detection.result/.error` **`call.cost`**
**Conference:** 14 events · **Messaging:** `message.received/sent/finalized`,
`ReplacedLinkClickWebhookEvent`, `CampaignStatusUpdate` · **Fax:** 5 · **Ops:** `porting_order.*`,
`portout.status_changed`, number/hosted-number order status, artifact, session, transcript

**Our handler covers 9 of 71.** Missing the ones we most need: `call.cost`,
`call.conversation.ended`, `call.conversation_insights.generated`, `call.transcription`,
`call.recording.saved`.

### 3.2 Ed25519 verification — working Deno code

**Do NOT use `client.webhooks.unwrap()` from the SDK.** Read the source: `src/resources/webhooks.ts`
(the one actually wired to the client) calls `standardwebhooks@1.0.0`, whose `verify()` reads
`webhook-id` / `webhook-signature` / `webhook-timestamp`. Telnyx sends
`Telnyx-Signature-Ed25519` / `Telnyx-Timestamp`. **No overlap — it throws.**

The SDK *does* ship a correct native implementation at `src/lib/webhooks.ts`, but
`grep -rn "lib/webhooks" src/` returns nothing and it isn't exported. Dead code.

The real scheme:

| Element | Value |
|---|---|
| Signature header | `Telnyx-Signature-Ed25519`, base64, decodes to **64 bytes** |
| Timestamp header | `Telnyx-Timestamp`, Unix seconds |
| Signed payload | `` `${timestamp}|${rawBody}` `` — literal pipe, **raw body, not re-serialized** |
| Public key | base64 from Mission Control, decodes to **32 bytes** raw Ed25519 |
| Replay window | 300 s |

```ts
const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Cache the CryptoKey — importKey on every webhook is pure waste.
let cachedKey: { b64: string; key: CryptoKey } | null = null;
async function importPublicKey(b64: string): Promise<CryptoKey> {
  if (cachedKey?.b64 === b64) return cachedKey.key;
  const raw = b64ToBytes(b64);
  if (raw.byteLength !== 32) throw new Error(`bad public key length ${raw.byteLength}, expected 32`);
  const key = await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
  cachedKey = { b64, key };
  return key;
}

export async function verifyTelnyxWebhook(
  rawBody: string,
  headers: Headers,
  publicKeyB64: string,
  toleranceSecs = 300,
): Promise<{ ok: true } | { ok: false; reason: string; skew?: number }> {
  const sigB64 = headers.get("telnyx-signature-ed25519");
  const ts = headers.get("telnyx-timestamp");
  if (!sigB64 || !ts) return { ok: false, reason: "missing_signature_headers" };

  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(skew) || skew > toleranceSecs)
    return { ok: false, reason: "timestamp_out_of_tolerance", skew };

  const sig = b64ToBytes(sigB64);
  if (sig.byteLength !== 64) return { ok: false, reason: "bad_signature_length" };

  const key = await importPublicKey(publicKeyB64);
  const ok = await crypto.subtle.verify("Ed25519", key, sig, enc.encode(`${ts}|${rawBody}`));
  return ok ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}
```

No `Buffer`, no npm, no Node builtins. Ed25519 in WebCrypto: Deno ≥1.28, Node ≥18.4, Supabase
Edge Runtime.

### 3.3 Delivery semantics — the part that bites

| Property | Reality |
|---|---|
| **Timeout** | **2000 ms default**, configurable `webhook_timeout_secs` (0–30) |
| **Retries** | **One retry**, then failover URL. That's it. |
| Backoff schedule | **[UNVERIFIED]** — unpublished |
| **Delivery guarantee** | **At-least-once.** Telnyx: "may occasionally receive the same event more than once" |
| **Ordering** | **No guarantee.** Retry + failover makes reordering structural |
| Ack | Any `2xx`. Body ignored |
| Failover | `webhook_event_failover_url` (connections), `webhook_failover_url` (messaging) |
| **API version** | `webhook_api_version: "1" \| "2"`, **default `"1"`** — v2 is the Ed25519-signed format |

⚠️ **`webhook_api_version` defaults to `"1"`.** Audit every Call Control App, TeXML App, and
connection. A resource left on v1 sends a different payload shape with different signing.

⚠️ **Event ID stability is [UNVERIFIED].** Every event carries `data.id` (UUID,
`record_type: "event"`) — that's the dedupe key — but nothing published says a *retried* event
carries the same `id`. Dedupe on `id` **and** keep handlers idempotent on natural keys
(`call_control_id` + `event_type`).

**Forensics we already have:** `GET /v2/webhook_deliveries` returns per-attempt records with
`started_at`, `finished_at`, `status`, `errors[]`, and full HTTP request/response capture.
Filterable by `attempts.contains` and `finished_at.gte/lte`. This is the tool for "did Telnyx
actually send it, or did we drop it?"

### 3.4 The correct ingress shape

Given 2 s timeout and one retry, **never do work inside the request.**

```ts
Deno.serve(async (req) => {
  const raw = await req.text();                       // raw body, before any parse

  const v = await verifyTelnyxWebhook(raw, req.headers, PUBLIC_KEY);
  if (!v.ok) {
    // 401 here means Telnyx retries ONCE then the event is gone forever.
    // This is a paging-level alert, not a debug line.
    await logRejected(raw, v.reason);
    return new Response(null, { status: 401 });
  }

  const evt = JSON.parse(raw).data;

  // Single INSERT. Nothing else. ~5-15ms, comfortably inside 2s.
  const { error } = await sb.from("telnyx_webhook_events").insert({
    event_id:    evt.id,            // UNIQUE — ON CONFLICT DO NOTHING absorbs the retry
    event_type:  evt.event_type,
    occurred_at: evt.occurred_at,   // sequence on THIS, never on arrival order
    payload:     evt.payload,
    raw_body:    raw,               // keep for replay + dispute forensics
    status:      "pending",
  });
  if (error && error.code !== "23505") return new Response(null, { status: 500 }); // 5xx → retry

  return new Response(null, { status: 200 });
});
```

A `pg_cron` worker then drains `status='pending'` **ordered by `occurred_at`** and routes by
`event_type`. Three properties fall out free:

1. **Unknown event types can't crash you** — they land in the table and a `default:` branch marks
   them `ignored`. Telnyx ships new events regularly (`call.deepfake_detection.*` is recent);
   a fan-out switch with no default is a silent data-loss bug.
2. **Out-of-order handled** by sorting on `occurred_at` at drain time.
3. **Replay is `UPDATE … SET status='pending'`** after a handler bug — we kept `raw_body`.

⚠️ **What our current handler gets structurally wrong:** it returns 401 on verification failure
*and* 503 when `WEBHOOK_SECRET_TELNYX` is unset. Fail-closed is correct for security, but with a
1-retry policy a missing env var for ten minutes **silently destroys every event in that window**
— including `call.cost`. Pair fail-closed with a loud alert and a `webhook_deliveries` sweep.

---

## 4. Multi-tenancy

Four mechanisms, descending isolation strength.

### Tier 1 — Managed Accounts (real sub-accounts)

`POST /v2/managed_accounts` with `business_name`, optional `email`/`password`,
`managed_account_allow_custom_pricing`, and **`rollup_billing` (⚠️ immutable after creation)**.
**The create response includes `api_key` and `api_token` for that sub-account** — Telnyx enforces
the boundary, not our code.

Also: `POST /managed_accounts/{id}/actions/{enable,disable}`,
`PATCH /managed_accounts/{id}/update_global_channel_limit` (`channel_limit: 0` = hard per-tenant
kill switch), `GET /usage_reports?managed_accounts=true` for cross-tenant rollup. Each account
has its own `balance { balance, credit_limit, available_credit, currency }`.

**Constraints that rule it out for now:** limited release, requires a commitment plan
(**Starter $1,000/mo**, Growth $2,000, Enterprise $5,000+) — **not on PAYG**. 1,000 sub-accounts
max. `rollup_billing` needs Telnyx support to change. **You cannot convert an existing standalone
account into a managed one.** Telnyx explicitly says don't use it for prod/staging separation.

### Tier 2 — Messaging Profiles as tenant boundaries

Strong for SMS, available on any plan. Per profile: `webhook_url` + `webhook_failover_url` ·
**`daily_spend_limit` + `daily_spend_limit_enabled`** (a hard per-tenant USD/day cap enforced by
Telnyx, resetting midnight UTC — a real financial circuit breaker we don't have to build) ·
`number_pool_settings` (`sticky_sender`, `geomatch`, `skip_unhealthy`, weights) ·
`whitelisted_destinations` · `mobile_only` · `redaction_enabled` · `ai_assistant_id`.

### Tier 3 — Connections / Call Control Apps per tenant

Per-tenant `webhook_event_url`, `webhook_event_failover_url`, `webhook_timeout_secs`,
`webhook_api_version`, and **`call_cost_in_webhooks`**. Cheap, unlimited, no plan gate. Combine
with `billing_group_id` on `POST /calls`; then
`GET /reports/cdr_usage_reports/sync?aggregation_type=BILLING_GROUP` slices spend per tenant natively.

### Tier 4 — `client_state` tagging (do this regardless)

`POST /calls` and every Call Control command accept `client_state` — a base64 string **echoed
back on every subsequent webhook for that call**. Encode `{org_id, campaign_id, lead_id}` and
every webhook self-identifies its tenant with zero DB lookup. `message.*` payloads carry `tags[]`
for the same purpose.

`/ai/conversations` supports PostgREST-style metadata filtering:
`metadata->assistant_id=eq.…`, `metadata->telnyx_end_user_target=eq.+1…`, plus `or=(…)`.

**[UNVERIFIED]** `MessagingProfile.resource_group_id` exists in the spec but there is no public
`/resource_groups` path among the 863. Likely limited-release RBAC.

### Recommendation

**Don't rebuild our tenancy on Managed Accounts** — the $1k/mo plan gate and immutable
`rollup_billing` make it a bad first move. **Run Tier 3 + Tier 4 now:** one Call Control App and
one Messaging Profile per organization, `client_state` on every dial, `daily_spend_limit` per
profile as a hard backstop behind our soft credit reservation. Keep `organizations.id` as source
of truth and store `telnyx_call_control_app_id` / `telnyx_messaging_profile_id` alongside. If we
ever cross the commitment threshold, Managed Accounts slots in behind the same abstraction.

---

## 5. Cost attribution — better than expected

**Telnyx pushes cost to us.** No CDR polling required.

### Voice: the `call.cost` webhook

Enable via **`call_cost_in_webhooks: boolean`** on Call Control Apps, TeXML Apps, and
Credential/FQDN/IP/UAC connections.

```ts
{
  event_type: 'call.cost',
  payload: {
    call_control_id, call_leg_id,
    call_session_id,          // groups transferred legs into one logical call
    client_state,             // ← OUR base64 tenant/campaign/lead context
    connection_id, billing_group_id,
    billed_duration_secs: number | null,
    total_cost: string | null,
    status: 'success' | 'error',     // ← cost calc CAN FAIL
    cost_parts: Array<{
      call_part: string,             // "sip-trunking" | "call-control" | "call-recording" | …
                                     // not a fixed set — new values may appear
      billed_duration_secs: number, cost: string, currency: string,
      rate: string,                  // ← per-minute rate actually applied
    }>,
  }
}
```

**Why this is the right integration point:** `client_state` round-trips our `org_id`, and
`cost_parts[].rate` gives Telnyx's *actual* applied rate — so we compute true margin per call
instead of estimating. It slots straight into `finalize_call_cost()`.

⚠️ **Handle `status: 'error'`.** Don't let a null `total_cost` release a reservation as $0.

### Messaging: cost on the message webhook

`cost: { amount, currency }` and
`cost_breakdown: { rate: {...}, carrier_fee: {...} }`, plus `parts` (1–10), `completed_at`,
`organization_id`, `tags[]`.

**Cost lands on `message.finalized`, not `message.sent`.** Bill on `completed_at`.

### Pull APIs for reconciliation

| Endpoint | Use |
|---|---|
| `GET /v2/detail_records` | Cross-product DR search. Message DRs carry `cost`, `carrier_fee`, `delivery_status`, `carrier`, `mcc`. **No voice CDR variant here.** |
| `GET /v2/reports/cdr_usage_reports/sync` | **Voice CDR, synchronous.** `aggregation_type: NO_AGGREGATION\|CONNECTION\|TAG\|BILLING_GROUP`. Returns `report_url`. |
| `GET /v2/reports/mdr_usage_reports` | Messaging equivalent (async + `/sync`) |
| `GET /v2/usage_reports` | Dimensional aggregation, **max 31-day range**, `managed_accounts: boolean` |
| `/v2/charges_summary`, `/charges_breakdown`, `/balance`, `/invoices` | Account financials |

### AI Assistant cost

Separate from `call.cost`. Per the [Jan 29 2026 release note](https://telnyx.com/release-notes/voice-ai-call-cost-breakdowns),
retrieve the **conversation record** for total + per-component cost: Call Control and WebRTC
durations, **LLM usage with model name and prompt/cached/completion token counts**, telephony,
recording. Also at Mission Control → AI Assistants → Analysis → View conversation → Call cost.

### Latency and finality — [UNVERIFIED], and it matters

Telnyx publishes **no** stated latency between call end and `call.cost`, and **no** statement on
whether costs can be restated.

**Guidance:** the event's existence as a *separate* webhook from `call.hangup` strongly implies
it is not synchronous with call end. **Do not block `finalize_call_cost()` on it.** Keep the
current flow — reserve on dial, finalize on `call.hangup` using duration × configured rate — and
treat `call.cost` as an **asynchronous true-up** that writes a correction transaction when actual
≠ estimate. Run **T+24h and T+7d reconciliation** against `/reports/cdr_usage_reports/sync`;
carrier fees and international rates are where restatement risk lives.

Our existing idempotency-key + `FOR UPDATE` design already makes true-ups safe. **Add a
`cost_source` column** (`estimate` | `webhook` | `cdr_reconciliation`) so we can prove which
number we billed on.

---

## 6. Reliability

### Rate limits (live-probed 17 Aug 2026)

`GET /v2/phone_numbers` returned both header families:

```
x-ratelimit-limit: 2000, 2000;w=1     ratelimit-limit: 2000, 2000;w=1
x-ratelimit-remaining: 1999           x-ratelimit-reset: 1
x-request-id: 4b59ff04-9318-9a57-8c81-6696ede7881b
```

→ **2000 req/s, 1-second window** on the general v2 API. 429 body: `{"errors":[{"code":"10011",…}]}`.

**The limits that actually constrain a dialer:**

| Layer | Limit |
|---|---|
| REST API general | 2000 req/s |
| **Voice CPS** | **50 calls/sec** per IP or SIP username; excess → **`503 CPS limit`**. Raisable on request |
| **Concurrent channels** | ~**200** outbound default, configurable via Outbound Voice Profile |
| SMS account-level | 50 MPS, max queue 720,000 |
| MMS account-level | 15 MPS, queue 216,000 |
| RCS | 1 MPS, queue 14,400 |
| Per-number | Long code **0.1 MPS** · Toll-free **20 MPS** · Short code 1,000 MPS |
| Queue depth | `MPS × 14,400 s` (4 h), **FIFO, then dropped**. Queue full → error `40318` |
| 10DLC | AT&T 15 TPM (sole prop) → 9,000 TPM; T-Mobile daily brand caps 2,000–200,000 |

⚠️ **`calculatePacingDelay()` in `voice-broadcast-engine`** computes `60000 / calls_per_minute`
with a **100 ms floor → 600 CPS max**. That is **12× the 50 CPS ceiling.** At
`calls_per_minute >= 3000` we generate `503 CPS limit` rejections that look like carrier
failures. **Cap `calls_per_minute` at 3000 and add a 50/s token bucket.**

⚠️ **The 4-hour FIFO message queue is a broadcast footgun.** Burst 200k messages and Telnyx
accepts them, then **silently drops** anything still queued at T+4h. Pace against actual
per-number MPS rather than dumping into the queue.

### Error taxonomy

```
TelnyxError → APIError
  ├── APIUserAbortError          ├── ConflictError (409)
  ├── APIConnectionError         ├── UnprocessableEntityError (422)
  │     └── …TimeoutError        ├── RateLimitError (429)
  ├── BadRequestError (400)      └── InternalServerError (>=500)
  ├── AuthenticationError (401)
  ├── PermissionDeniedError (403)
  └── NotFoundError (404)
```

All errors are `{errors: [{code, title, detail, source?, meta?}]}`. **Key handling on `code`
(stable numeric string), not `title`.**

### Retry/backoff — mirror what the SDK does

From `src/client.ts`: `maxRetries` 2, `timeout` 60 s. Retries **408, 409, 429, ≥500**, connection
errors/timeouts, honors a non-standard **`x-should-retry`** header (server override wins), and
retries 401 once if an OAuth token is within 10 s of expiry. Delay: `retry-after-ms` header →
else `Retry-After` → else `min(0.5 × 2^n, 8.0)` seconds × jitter (`1 − random()×0.25`).

### Idempotency — the asymmetry that will hurt

**There is no global idempotency-key header.** Confirmed in source: `client.ts` declares
`protected idempotencyHeader?: string` and **never assigns it**, so the injection block is dead.
Only `/email_validations`, `/ai/missions/{id}/runs/events`, and `/meeting_sessions` support it.

**But Call Control has its own, and it's good:**

| Endpoint | Idempotency |
|---|---|
| `POST /v2/calls` | ✅ **`command_id`** — "Telnyx will ignore other Dial commands with the same `command_id`" |
| All `/calls/{id}/actions/*` | ✅ `command_id`, scoped per `call_control_id` |
| `POST /v2/messages` | ❌ **none** |
| `POST /v2/ai/assistants` | ❌ |

**Actionable:** put a deterministic `command_id` on every dial —
`${campaign_id}:${lead_id}:${attempt_number}` hashed to a UUID. The dispatcher's retry loop
becomes free of duplicate-dial risk **at the Telnyx layer**, which is a stronger guarantee than
our current queue-status approach. **For SMS we must build dedupe ourselves** — a unique index on
`(org_id, lead_id, template_id, date_trunc('minute', now()))` before the send.

### Circuit breaking

**Status page has a real API** (verified live): `https://telnyx.statuspage.io/api/v2/{status,
summary,components,incidents,scheduled-maintenances}.json` — **94 components**, granular to
region and service (`Outbound Calling Services - United States`, `Number Searching`, EMEA/APAC
equivalents). Poll `summary.json` from `pg_cron` every 60 s into a `provider_health` table and
gate dispatch on the components we depend on. Statuspage also supports webhook subscriptions.

**SLA: 99.99%** on core voice and messaging — **only for Service Order plan customers**; excludes
internet outside Telnyx's network and customer misconfiguration.

**Degradation playbook:** we already run Retell in parallel. That is the strongest circuit
breaker available — on sustained 5xx or a red status component, flip
`campaigns.primary_provider` to `retell` and drain. The 9 Apr 2026 dual-provider work makes this
a config change, not a code change.

---

## 7. Observability

| Capability | What | Access |
|---|---|---|
| **Langfuse tracing** *(best thing here)* | Native, **zero instrumentation**. LLM prompts + outputs per turn, tool names/args/responses, latency, tokens, **deterministic trace grouping by `conversation_id`**. Released 13 Apr 2026 | `observability_settings` on the assistant: `{host, status, public_key_ref, secret_key_ref, prompt_name, prompt_label, prompt_sync, prompt_version}`. `host` implies self-hosted works |
| **Prompt versioning** | `prompt_sync: ENABLED` + `prompt_name` → every assistant create/update **pushes `instructions` to Langfuse** as a versioned prompt | same object |
| Assistant testing | `/ai/assistants/tests` — `instructions` + `rubric[]` + `destination`. Live scored test calls | API |
| Canary deploys | `/ai/assistants/{id}/canary-deploys` + `/versions` | API |
| Conversation insights | `/ai/conversations/insight-groups`, `/insights` + webhook | API |
| Webhook forensics | `/v2/webhook_deliveries` — per-attempt HTTP capture | API |
| **SIP Call Flow Tool / Homer** | Full SIP ladder, RTCP QoS: **MOS, jitter, packet loss**. Targets MOS > 4.0, jitter < 30 ms, loss < 0.1% | ⚠️ **Portal-only — no public API** |
| WebRTC quality | `GET /v2/voice_sdk_call_reports` | API — **`@telnyx/webrtc` clients only, not PSTN** |
| Number reputation | `/v2/reputation/numbers/{phone_number}` | API |
| Status | statuspage API, 94 components | API |

**The gap:** there is **no exportable per-call MOS/jitter metric for PSTN calls via API.** A
search of the full 5.8 MB spec found `"mos"` 4 times (none a call-quality field) and no schema
exposing MOS/jitter/loss for PSTN — the 97 `jitter` hits are all jitter-*buffer configuration*.
PSTN quality telemetry is Portal-only. **[UNVERIFIED]** whether an enterprise QoS export exists —
worth asking our rep, since for a dialer this is the metric that predicts spam-flagging.

Practical substitute: our existing `number_health_metrics` (answer-rate + voicemail-rate from
`call_logs`) plus `/v2/reputation/numbers`.

---

## 8. The playbook — what lives where

| Concern | Where | Why |
|---|---|---|
| Ed25519 verify + raw insert | **Edge function, thinnest possible** | 2 s timeout, 1 retry. Every ms of handler work is delivery risk |
| Event fan-out / business logic | **`pg_cron` worker over the events table** | Decouples Telnyx's timeout from our logic; enables `occurred_at` ordering, replay, new handlers without redeploying ingress |
| Mid-call tool calls | **Edge function, webhook tool, `async: false`, `timeout_ms` ≈ 800** | Sub-second budget. Single query, RLS-scoped |
| Slow mid-call work | **Webhook tool `async: true`** → `POST /calls/{id}/actions/ai_assistant_add_messages` | No backend deadline; inject result mid-call |
| Dynamic variables at call start | **Edge function**, budget **1500 ms** (max 10000) | |
| Provisioning (assistants, numbers, profiles) | **Edge function**, admin-triggered, SDK fine here | Not latency-sensitive; types earn their weight |
| Cost true-up | **`pg_cron`** — `call.cost` handler + T+24h/T+7d CDR reconciliation | Async by nature |
| Telnyx API keys | **Supabase secrets only. Never client.** | The publishable key reaches browsers; a Telnyx key there is account takeover |

### Cache vs store vs query live

| Data | Strategy |
|---|---|
| Assistant configs | **Store locally, but re-fetch before every edit.** Our 9/13 Apr fixes (`update_tools` payload preservation, live `llm_id` resolution) exist *because* a local snapshot drifted |
| Phone numbers | Cache, reconcile nightly. **Never dial from a stale cache** |
| Models / voices catalogue | Cache 24 h — changes weekly |
| Balance / credits | **Never cache.** Live `GET /v2/balance`, or read our own ledger |
| Cost records | **Store permanently**, immutable, with `cost_source` |
| Transcripts / insights | **Store locally** — `privacy_settings.data_retention: false` means Telnyx keeps nothing |
| Status page | Poll 60 s into a table; gate dispatch on it |

### Mid-call tool calls into our database — the sharp edges

1. **Authenticate the caller.** Register with an `api_key_ref` Integration Secret and reject any
   request without that exact bearer. Without it, `/functions/v1/mcp` is a public write path into
   tenant data.
2. **Never trust an LLM-supplied tenant ID.** The assistant will happily pass whatever `org_id`
   the *caller* claims. Derive tenancy from something **we** placed: `client_state`, the
   `assistant_id`, or the dialed number — then resolve `org_id` server-side and scope every query.
3. **Bind the conversation.** Since `telnyx_conversation_id` injection is unconfirmed, inject our
   own correlation ID as a dynamic variable at call start and require it as an explicit tool
   argument. Validate against an active-call row before any write.
4. **Writes must be idempotent** — the LLM may call the same tool twice in one turn. Natural key
   `(conversation_id, tool_name, hash(args))` with `ON CONFLICT DO NOTHING`.
5. **One query per tool call.** Sub-second budget. No N+1.
6. **Return small, flat payloads.** Use `store_fields_as_variables` to bind response fields to
   dynamic variables rather than making the model re-parse a blob every turn.
7. **Test in CI:** `POST /ai/assistants/{id}/tools/{tool_id}/test` returns
   `{status_code, success, request, response, content_type}`.

### Corrections this doc makes to `TELNYX_VOICE_PLATFORM.md`

| That doc says | Actually |
|---|---|
| MCPServerTool is inline `{"type":"mcp_server","url":…}` | Standalone `/ai/mcp_servers` resource referenced by ID |
| `tools[]` is how you define tools | **"Deprecated for new integrations."** Use `tool_ids[]` + `mcp_servers[]` |
| Dynamic-vars webhook must respond **<1 s** | Default **1500 ms**, max 10000, configurable |
| (undocumented) | **The response must be wrapped: `{"dynamic_variables": {...}}`.** A flat object is silently ignored. Our `telnyx-dynamic-vars` already does this correctly — don't let anyone "simplify" it |
| Async webhook has "NO timeout" | Backend has none, but the assistant stops waiting at `async_timeout_ms` — **default 300 ms** |
| Python `telnyx-mcp-server` | Deprecated → `telnyx-mcp` (npm) or hosted |

---

## 9. Ranked next moves

1. **Add `call.cost`** to `telnyx-webhook` and set `call_cost_in_webhooks: true` on our Call
   Control / TeXML apps. Real Telnyx cost with `client_state` tenant context — a direct upgrade to
   `finalize_call_cost()` and true margin reporting. **Highest value, lowest effort.**
2. **Add the missing AI events:** `call.conversation.ended`,
   `call.conversation_insights.generated`, `call.transcription`, `call.recording.saved`.
3. **Restructure `telnyx-webhook` to verify-and-enqueue only**, with a `pg_cron` fan-out worker.
   The current in-request switch is a data-loss risk under load.
4. **Audit `webhook_api_version`** on every connection — default is `"1"`.
5. **Clamp voice pacing to 50 CPS** in `voice-broadcast-engine`.
6. **Add `command_id`** to every `POST /calls` — free dedupe at the Telnyx layer.
7. **Set `daily_spend_limit`** per messaging profile as a hard backstop.
8. **Turn on Langfuse** (`observability_settings`) — full tool-call tracing for free, exactly what
   we lacked when debugging the silent-call and metadata-clobbering bugs.
9. **Probe the `/ai/mcp_servers` `type` enum**, then register `/functions/v1/mcp` with a tight
   `allowed_tools` list. We already built that MCP server for Lovable agents — this makes the
   *voice assistant itself* a consumer of it.
10. **Nightly `webhook_deliveries` reconciliation** + statuspage polling into `provider_health`,
    gating dispatch and driving the Retell failover we already have.
