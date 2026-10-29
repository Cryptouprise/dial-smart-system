
/**
 * Reads the current organization's enabled industry packs from
 * `organizations.settings -> 'packs'`.
 *
 * OrganizationContext does not load `settings` (OrganizationWithRole carries
 * identity + role only), so this hook fetches the row by id and caches it in
 * React state. RLS on organizations already restricts SELECT to members.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
import { normalizePacks, type PackId } from '@/lib/packs';

interface UseEnabledPacksResult {
  packs: PackId[];
  has: (pack: PackId) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useEnabledPacks(): UseEnabledPacksResult {
  const organizationId = useCurrentOrganizationId();
  const [packs, setPacks] = useState<PackId[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(organizationId));

  const load = useCallback(async () => {
    if (!organizationId) {
      setPacks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organizationId)
        .maybeSingle();

      if (error) throw error;

      const settings = (data?.settings ?? null) as { packs?: unknown } | null;
      setPacks(normalizePacks(settings?.packs));
    } catch (error) {
      console.error('Error loading enabled packs:', error);
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const has = useCallback((pack: PackId) => packs.includes(pack), [packs]);

  return { packs, has, loading, refresh: load };
}

export default useEnabledPacks;

