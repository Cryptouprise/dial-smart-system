/**
 * Provider / Agent Router — the seam for the agent orchestration layer.
 *
 * Today the dispatcher decides "which provider + agent handles this call"
 * with logic inlined in the per-lead dispatch loop (retell | telnyx | both |
 * assistable, where `both` alternates by attempt with an agent-availability
 * fallback). That inline logic is correct but not reusable, not testable, and
 * has no place to grow health-aware or capability-aware routing.
 *
 * This module extracts that decision into ONE pure function,
 * `resolveRouting()`, so it can be unit-tested and evolved without touching the
 * hot path. It intentionally reproduces the CURRENT behavior first (so adoption
 * is a safe, behavior-preserving refactor) and exposes typed extension points
 * (`ProviderHealth`, capability filtering) for the real orchestration layer.
 *
 * Pure: no I/O, no Deno/browser APIs — callable from edge functions and tests.
 */

export type ProviderId = 'retell' | 'telnyx' | 'assistable';

/** Campaign-level routing configuration (subset of the campaigns row). */
export interface CampaignRoutingConfig {
  /** 'retell' | 'telnyx' | 'both' | 'assistable'. Missing → 'retell'. */
  provider?: string | null;
  /** Retell agent id, if configured. */
  agent_id?: string | null;
  /** Telnyx assistant id, if configured. */
  telnyx_assistant_id?: string | null;
  /** Assistable assistant id, if configured (from metadata today). */
  assistable_assistant_id?: string | null;
}

/**
 * Optional runtime health signal per provider. When supplied, the router will
 * avoid a provider marked unhealthy if a healthy alternative can serve the
 * call. This is the hook the autonomous engine / number-health system feeds.
 */
export interface ProviderHealth {
  retell?: { healthy: boolean; reason?: string };
  telnyx?: { healthy: boolean; reason?: string };
  assistable?: { healthy: boolean; reason?: string };
}

export interface RoutingInput {
  campaign: CampaignRoutingConfig;
  /** 0-based attempt number for this lead (drives `both` alternation). */
  attempt: number;
  /** Optional provider health; when absent, health is assumed OK. */
  health?: ProviderHealth;
}

export interface RoutingDecision {
  /** The provider that should place this call, or null if none can. */
  provider: ProviderId | null;
  /** The agent/assistant id to use for the chosen provider, or null. */
  agentId: string | null;
  /** True when the router diverged from the campaign's first preference. */
  fallbackUsed: boolean;
  /** Human-readable explanation (logged + surfaced for diagnostics). */
  reason: string;
}

/** Does the campaign have a usable agent for the given provider? */
function agentIdFor(campaign: CampaignRoutingConfig, provider: ProviderId): string | null {
  switch (provider) {
    case 'retell':
      return campaign.agent_id || null;
    case 'telnyx':
      return campaign.telnyx_assistant_id || null;
    case 'assistable':
      return campaign.assistable_assistant_id || null;
    default:
      return null;
  }
}

function isHealthy(health: ProviderHealth | undefined, provider: ProviderId): boolean {
  const h = health?.[provider];
  return h ? h.healthy : true; // no signal → assume healthy
}

/** A provider can serve the call only if it has an agent AND is healthy. */
function canServe(
  campaign: CampaignRoutingConfig,
  provider: ProviderId,
  health: ProviderHealth | undefined,
): boolean {
  return !!agentIdFor(campaign, provider) && isHealthy(health, provider);
}

/**
 * Resolve which provider + agent should place this call.
 *
 * Behavior (preserves the dispatcher's current rules, then adds health-aware
 * fallback on top):
 *  - explicit 'retell' / 'telnyx' / 'assistable' → use it if it can serve;
 *    otherwise fall back to any other provider that can.
 *  - 'both' → alternate retell/telnyx by attempt parity, falling back to the
 *    other when the preferred one has no agent (or is unhealthy).
 *  - default (missing provider) → 'retell'.
 */
export function resolveRouting(input: RoutingInput): RoutingDecision {
  const { campaign, attempt, health } = input;
  const configured = (campaign.provider || 'retell').toLowerCase();

  // Ordered candidate list by campaign intent.
  let ordered: ProviderId[];
  if (configured === 'both') {
    // Alternate the preferred head by attempt parity; keep the other as fallback.
    ordered = attempt % 2 === 0 ? ['retell', 'telnyx'] : ['telnyx', 'retell'];
  } else if (configured === 'telnyx' || configured === 'assistable' || configured === 'retell') {
    const primary = configured as ProviderId;
    const rest = (['retell', 'telnyx', 'assistable'] as ProviderId[]).filter(p => p !== primary);
    ordered = [primary, ...rest];
  } else {
    ordered = ['retell', 'telnyx', 'assistable'];
  }

  const first = ordered[0];
  for (let i = 0; i < ordered.length; i++) {
    const provider = ordered[i];
    if (canServe(campaign, provider, health)) {
      const fallbackUsed = provider !== first;
      const agentId = agentIdFor(campaign, provider);
      const healthNote =
        fallbackUsed && !isHealthy(health, first)
          ? ` (${first} unhealthy: ${health?.[first]?.reason || 'unknown'})`
          : fallbackUsed
            ? ` (${first} has no agent configured)`
            : '';
      return {
        provider,
        agentId,
        fallbackUsed,
        reason: `Routed to ${provider}${fallbackUsed ? ` after falling back from ${first}` : ''}${healthNote}`,
      };
    }
  }

  return {
    provider: null,
    agentId: null,
    fallbackUsed: false,
    reason: `No provider can serve this call — no agent configured (or all unhealthy) for: ${ordered.join(', ')}`,
  };
}
