import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Plan catalog, promo redemption, and phone-sourcing mode.
 *
 * Pricing lives in the `plans` table, not in this file — changing a price is a
 * single UPDATE with no deploy. Nothing here hardcodes a dollar amount.
 */

export interface Plan {
  id: string;
  name: string;
  tagline: string | null;
  price_cents: number;
  billing_period: string;
  included_minutes: number;
  overage_per_minute_cents: number;
  unlimited_minutes: boolean;
  max_campaigns: number | null;
  max_phone_numbers: number | null;
  max_leads: number | null;
  max_concurrent_calls: number | null;
  features: Record<string, boolean>;
  phone_mode: 'byo' | 'managed' | 'both';
  sort_order: number;
}

export interface PlanAddon {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_period: string;
  available_for_plan_ids: string[];
  sort_order: number;
}

export interface RedeemResult {
  success: boolean;
  message: string;
  reason?: string;
  grant_type?: string;
}

/** $29.00 from 2900. Always derive display price from the catalog, never a literal. */
export const formatPrice = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 === 0 ? 0 : 2 });

/** "$0.18/min" from 18. */
export const formatPerMinute = (cents: number): string =>
  `${(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}/min`;

export const usePlans = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<PlanAddon[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [unlimitedAccess, setUnlimitedAccess] = useState(false);
  const [phoneMode, setPhoneMode] = useState<'byo' | 'managed' | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrgState = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const orgId = (membership as { organization_id?: string } | null)?.organization_id;
    if (!orgId) return;

    const { data: org } = await supabase
      .from('organizations')
      .select('plan_id, unlimited_access, phone_mode')
      .eq('id', orgId)
      .maybeSingle();

    const row = org as { plan_id?: string | null; unlimited_access?: boolean; phone_mode?: 'byo' | 'managed' | null } | null;
    setCurrentPlanId(row?.plan_id ?? null);
    setUnlimitedAccess(Boolean(row?.unlimited_access));
    setPhoneMode(row?.phone_mode ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [planRes, addonRes] = await Promise.all([
          supabase.from('plans').select('*').eq('is_active', true).eq('is_public', true).order('sort_order'),
          supabase.from('plan_addons').select('*').eq('is_active', true).order('sort_order'),
        ]);
        if (cancelled) return;
        setPlans((planRes.data ?? []) as unknown as Plan[]);
        setAddons((addonRes.data ?? []) as unknown as PlanAddon[]);
        await loadOrgState();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [loadOrgState]);

  /**
   * Redeem a promo code. Codes are matched case-insensitively and trimmed
   * server-side, so "OSCAR1", "oscar1" and " Oscar1 " are the same code.
   *
   * All validation happens in the redeem_promo_code() database function — the
   * client cannot read the promo_codes table at all, by design, so codes cannot
   * be enumerated from the browser.
   */
  const redeemCode = useCallback(async (code: string): Promise<RedeemResult> => {
    const { data, error } = await supabase.rpc('redeem_promo_code' as never, { p_code: code } as never);

    if (error) {
      return { success: false, message: error.message || 'Could not redeem that code.', reason: 'error' };
    }

    const result = (data ?? {}) as RedeemResult;
    if (result.success) await loadOrgState();
    return result;
  }, [loadOrgState]);

  /**
   * Choose how this workspace sources phone numbers. Unlike plan and billing
   * fields, this is a legitimate tenant setting and is not platform-guarded.
   */
  const setPhoneSourcing = useCallback(async (mode: 'byo' | 'managed'): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: membership } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const orgId = (membership as { organization_id?: string } | null)?.organization_id;
    if (!orgId) return false;

    const { error } = await supabase
      .from('organizations')
      .update({ phone_mode: mode } as never)
      .eq('id', orgId);

    if (error) return false;
    setPhoneMode(mode);
    return true;
  }, []);

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;

  return {
    loading,
    plans,
    addons,
    currentPlan,
    currentPlanId,
    unlimitedAccess,
    phoneMode,
    redeemCode,
    setPhoneSourcing,
    refresh: loadOrgState,
  };
};

export default usePlans;
