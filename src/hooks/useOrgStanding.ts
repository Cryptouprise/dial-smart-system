/**
 * useOrgStanding
 *
 * Asks the database whether the current organization may use the product:
 *   supabase.rpc('org_in_good_standing', { p_org_id })   (migration 20261029160000_billing_lock.sql)
 * and whether the signed-in user is a platform operator:
 *   supabase.rpc('is_platform_operator')                 (live; user_roles.role = 'admin')
 *
 * Results are cached for 60 s per (user, org). Exposes { ok, loading, status, refresh }.
 *
 * Fail OPEN: an RPC error (network blip, cold start) must never lock everyone out, so on error the
 * hook reports ok=true with status 'unknown' and does not cache. The RESTRICTIVE RLS policies are the
 * real enforcement; this hook only decides which screen to show.
 *
 * No organization selected -> nothing to lock -> ok=true, status 'skipped'.
 * Platform operator -> ok=true, status 'operator' (mirrors the SQL bypass).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const CACHE_TTL_MS = 60_000;

export type OrgStandingStatus = 'ok' | 'paused' | 'operator' | 'unknown' | 'skipped';

export interface OrgStanding {
  /** true = render the app; false = render BillingPaused */
  ok: boolean;
  loading: boolean;
  status: OrgStandingStatus;
  /** Drop the cache for this org and ask the database again. */
  refresh: () => void;
}

type CacheEntry = { ok: boolean; status: OrgStandingStatus; at: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, organizationId: string): string {
  return `${userId}:${organizationId}`;
}

function readCache(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

/** Clear cached standing (all orgs, or one) so the next render re-checks. */
export function invalidateOrgStanding(organizationId?: string): void {
  if (!organizationId) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key.endsWith(`:${organizationId}`)) cache.delete(key);
  }
}

type RpcResult = { data: unknown; error: { message: string } | null };
// The generated Database types do not know these RPCs until `supabase gen types` is re-run after the
// migration; call through an untyped signature rather than hand-editing the generated file.
const rpc = (fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult> =>
  (supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>)(fn, args);

const SKIPPED: Omit<OrgStanding, 'refresh'> = { ok: true, loading: false, status: 'skipped' };

export function useOrgStanding(organizationId: string | null | undefined): OrgStanding {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [version, setVersion] = useState(0);

  const [state, setState] = useState<Omit<OrgStanding, 'refresh'>>(() => {
    if (!organizationId || !userId) return SKIPPED;
    const cached = readCache(cacheKey(userId, organizationId));
    if (cached) return { ok: cached.ok, loading: false, status: cached.status };
    return { ok: true, loading: true, status: 'unknown' };
  });

  const refresh = useCallback(() => {
    if (organizationId) invalidateOrgStanding(organizationId);
    setVersion((v) => v + 1);
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !userId) {
      setState(SKIPPED);
      return;
    }

    const key = cacheKey(userId, organizationId);
    const cached = readCache(key);
    if (cached) {
      setState({ ok: cached.ok, loading: false, status: cached.status });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    (async () => {
      const [standing, operator] = await Promise.all([
        rpc('org_in_good_standing', { p_org_id: organizationId }),
        rpc('is_platform_operator'),
      ]);
      if (cancelled) return;

      // Platform operators are never locked (same rule as the SQL bypass). An error on this call
      // simply means "not an operator"; the standing result decides.
      if (!operator.error && operator.data === true) {
        const entry: CacheEntry = { ok: true, status: 'operator', at: Date.now() };
        cache.set(key, entry);
        setState({ ok: true, loading: false, status: 'operator' });
        return;
      }

      if (standing.error) {
        // Fail open, do not cache: a transient failure must not pause anyone.
        console.warn('[useOrgStanding] org_in_good_standing failed; allowing access:', standing.error.message);
        setState({ ok: true, loading: false, status: 'unknown' });
        return;
      }

      const ok = standing.data === true;
      const status: OrgStandingStatus = ok ? 'ok' : 'paused';
      cache.set(key, { ok, status, at: Date.now() });
      setState({ ok, loading: false, status });
    })().catch((err: unknown) => {
      if (cancelled) return;
      console.warn('[useOrgStanding] standing check threw; allowing access:', err);
      setState({ ok: true, loading: false, status: 'unknown' });
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId, userId, version]);

  return { ...state, refresh };
}
