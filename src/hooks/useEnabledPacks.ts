
/**
 * Reads the current organization's enabled industry packs from
 * `organizations.settings -> 'packs'`.
 *
 * OrganizationContext does not load `settings` (OrganizationWithRole carries
 * identity + role only), so this hook fetches the row by id. RLS on
 * organizations already restricts SELECT to members.
 *
 * The state lives in ONE module-level store shared by every hook instance, so
 * enabling a pack on the Packs screen updates the sidebar immediately instead
 * of waiting for a page reload (that was the "I toggled it and nothing
 * changed" bug).
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
import { normalizePacks, type PackId } from '@/lib/packs';

interface UseEnabledPacksResult {
  packs: PackId[];
  has: (pack: PackId) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

interface PackStore {
  orgId: string | null;
  packs: PackId[];
  loading: boolean;
  /** The org id whose packs have been fetched (null = nothing loaded yet). */
  loadedFor: string | null;
}

let state: PackStore = { orgId: null, packs: [], loading: false, loadedFor: null };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function setState(patch: Partial<PackStore>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PackStore {
  return state;
}

async function load(orgId: string, force: boolean): Promise<void> {
  if (!force && state.orgId === orgId && state.loadedFor === orgId) return;
  if (inFlight && state.orgId === orgId && !force) return inFlight;

  if (state.orgId !== orgId) setState({ orgId, packs: [], loadedFor: null });
  setState({ loading: true });

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .maybeSingle();

      if (error) throw error;

      const settings = (data?.settings ?? null) as { packs?: unknown } | null;
      setState({ orgId, packs: normalizePacks(settings?.packs), loading: false, loadedFor: orgId });
    } catch (error) {
      console.error('Error loading enabled packs:', error);
      setState({ orgId, packs: [], loading: false, loadedFor: orgId });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Force a re-read for the org currently in the store (used after set_org_packs). */
export async function refreshEnabledPacks(): Promise<void> {
  if (state.orgId) await load(state.orgId, true);
}

export function useEnabledPacks(): UseEnabledPacksResult {
  const organizationId = useCurrentOrganizationId();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!organizationId) {
      if (state.orgId !== null || state.loadedFor !== null) {
        setState({ orgId: null, packs: [], loading: false, loadedFor: null });
      }
      return;
    }
    void load(organizationId, false);
  }, [organizationId]);

  const has = useCallback((pack: PackId) => snapshot.packs.includes(pack), [snapshot.packs]);

  const refresh = useCallback(async () => {
    if (organizationId) await load(organizationId, true);
  }, [organizationId]);

  return {
    packs: snapshot.packs,
    has,
    // Stay "loading" until THIS org's packs have been fetched, so a pack tab
    // never flashes PackLocked on first paint.
    loading: Boolean(organizationId) && (snapshot.loading || snapshot.loadedFor !== organizationId),
    refresh,
  };
}

export default useEnabledPacks;
