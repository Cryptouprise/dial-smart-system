# Agent Orchestration Layer — Design & Roadmap

**Status:** Phase 0 (scaffold landed) · **Branch:** `claude/sales-engine-launch-check-30asbv`

The vision: a provider-agnostic orchestration layer where **any** voice agent —
your own, Retell, Telnyx, Assistable, or a future one — is a pluggable executor,
and a single router decides *which agent handles which call*, with health-aware
failover and capability matching. This doc is the honest map from where the code
is today to that goal.

---

## Where we actually are (verified in code)

- **Providers are wired, but per-provider, not abstracted.** `outbound-calling`
  has a Retell path and a Telnyx path; `telnyx-outbound-ai` and
  `assistable-make-call` are separate functions. `src/services/providers/*`
  define a clean `IProviderAdapter` interface **but the adapters are stubs and
  are never called** — the edge functions call each provider's API directly.
- **Provider selection is inlined in the dispatcher.** `call-dispatcher`
  resolves provider + agent inside the per-lead loop
  (`retell | telnyx | both | assistable`; `both` alternates by attempt with an
  agent-availability fallback). Correct, but not reusable, not testable, and
  with nowhere to grow.
- **There is no agent-to-agent handoff, no per-call provider health check, no
  capability router.** It's one-agent-per-campaign.

So the *interfaces* for orchestration exist; the *decision layer and real
executors* do not.

---

## Phase 0 — the seam (DONE in this branch)

`supabase/functions/_shared/provider-router.ts` extracts the provider/agent
decision into one **pure, unit-tested** function `resolveRouting()`:

```ts
resolveRouting({ campaign, attempt, health }) 
  → { provider, agentId, fallbackUsed, reason }
```

- Reproduces the dispatcher's current rules exactly (safe, behavior-preserving).
- Adds typed extension points: `ProviderHealth` (health-aware fallback) and an
  ordered-candidate model that generalizes to N providers.
- Covered by `provider-router.test.ts` (Deno).

This is the single place all future routing intelligence plugs into.

## Phase 1 — adopt the router in the dispatcher (next, reviewed)

Replace the inline block in `call-dispatcher` (~lines 1463–1487) with a call to
`resolveRouting()`. Behavior-preserving because Phase 0 mirrors current logic.
Ship behind a log-compare first (compute both, log divergences, act on the old
path) for one deploy, then cut over. **Not done here** — it touches the live
dial path and deserves its own reviewed PR + an end-to-end test call.

## Phase 2 — health-aware routing

Feed `ProviderHealth` from what already exists:
- `number_health_metrics` + `recalculate_number_health()` (per-number spam risk)
- provider API error rates (the new `provider_call_failed` alert stream)
- credit balance / rate-limit state

The router already accepts `health` and will steer away from an unhealthy
provider when a healthy one can serve the call. Wire the signal; no router change.

## Phase 3 — real executor adapters (retire the stubs)

Turn `src/services/providers/*` stubs into thin server-side executors OR, more
pragmatically, define one edge-side executor interface:

```ts
interface CallExecutor {
  placeCall(input: NormalizedCallInput): Promise<NormalizedCallResult>;
  capabilities(): ProviderCapabilities; // voice, sms, amd, transfer, cost/min
}
```

with `RetellExecutor`, `TelnyxExecutor`, `AssistableExecutor` wrapping the code
already living in `outbound-calling` / `telnyx-outbound-ai` / `assistable-make-call`.
The router returns a provider; the dispatcher looks up the executor and calls it.
This is what finally makes providers *pluggable* instead of branched.

## Phase 4 — capability matching & cost-aware routing

Extend `resolveRouting()` inputs with a `RoutingRequirement`
(needs transfer? needs SMS fallback? local-presence? max cost/min?) and pick the
cheapest executor whose `capabilities()` satisfy it. The `RoutingRequirements`
struct already sketched in `src/services/providers/types.ts` is the starting shape.

## Phase 5 — multi-agent handoff & specialization

Per-call agent selection by task, not just provider: a qualifier agent hands off
to a closer agent (Telnyx handoff is native; Retell via transfer + context
injection). Model agents as `{ id, provider, role, capabilities }` and let the
router pick the agent for the *current conversation stage*, feeding the
autonomous engine's journey state.

---

## Design principles

1. **One decision function.** All routing flows through `resolveRouting()`.
   No provider `if` branches scattered across functions.
2. **Behavior-preserving adoption.** Each phase is a safe refactor validated by
   a log-compare before cutover — never a big-bang rewrite of the dial path.
3. **Pluggable executors, not branches.** Adding a provider = one executor +
   one entry in the candidate list, zero dispatcher edits.
4. **Health & cost are inputs, not special cases.** They flow in as typed
   signals the pure router consumes.

## Immediate next step

Phase 1: adopt `resolveRouting()` in `call-dispatcher` behind a log-compare.
That single change turns the scaffold into the live routing brain without
risking the dial path.
