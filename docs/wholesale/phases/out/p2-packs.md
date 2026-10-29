=== FILE: supabase/migrations/20261029010000_industry_packs.sql ===
-- Industry packs: storage in organizations.settings->'packs' (jsonb array of pack ids).
-- No new tables, no constraint on settings (unrelated keys keep working).
-- Pack ids allowed: solar_exit, wholesale_re, door_to_door.

-- Read helper: true when the pack id is in the org's settings.packs AND the caller
-- is a member of that org. SECURITY DEFINER so it can read organizations.settings
-- regardless of the caller's row-level visibility, but it still gates on membership.
CREATE OR REPLACE FUNCTION public.org_has_pack(p_org_id uuid, p_pack text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    public.user_in_organization(p_org_id)
    AND EXISTS (
      SELECT 1
      FROM public.organizations o,
           jsonb_array_elements_text(
             CASE
               WHEN jsonb_typeof(o.settings -> 'packs') = 'array'
                 THEN o.settings -> 'packs'
               ELSE '[]'::jsonb
             END
           ) AS pack_id
      WHERE o.id = p_org_id
        AND pack_id = p_pack
    );
$function$;

REVOKE ALL ON FUNCTION public.org_has_pack(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_has_pack(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_has_pack(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.org_has_pack(uuid, text) IS
  'True when p_pack is listed in organizations.settings->''packs'' for p_org_id AND the caller is a member of that org. Read-only; safe for RLS predicates.';

-- Write helper: admin-only. Validates every id against the allowed list, then
-- merges into settings without touching any other key.
CREATE OR REPLACE FUNCTION public.set_org_packs(p_org_id uuid, p_packs text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed constant text[] := ARRAY['solar_exit', 'wholesale_re', 'door_to_door']::text[];
  v_bad     text;
  v_new     jsonb;
BEGIN
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Only organization admins can change industry packs'
      USING ERRCODE = '42501';
  END IF;

  -- Reject any id outside the allowed list (NULL elements included).
  SELECT x
    INTO v_bad
    FROM unnest(coalesce(p_packs, ARRAY[]::text[])) AS x
   WHERE x IS NULL OR NOT (x = ANY (v_allowed))
   LIMIT 1;

  IF v_bad IS NOT NULL OR (p_packs IS NOT NULL AND array_position(p_packs, NULL) IS NOT NULL) THEN
    RAISE EXCEPTION 'Unknown industry pack id: %', coalesce(v_bad, 'NULL')
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.organizations
     SET settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('packs', to_jsonb(coalesce(p_packs, ARRAY[]::text[]))),
         updated_at = now()
   WHERE id = p_org_id
  RETURNING settings INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_org_packs(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_org_packs(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_org_packs(uuid, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_org_packs(uuid, text[]) IS
  'Admin-only. Replaces organizations.settings->''packs'' with the given ids (validated against solar_exit/wholesale_re/door_to_door) and returns the new settings. Other settings keys are preserved.';

=== FILE: src/lib/packs.ts ===
/**
 * Industry packs registry.
 *
 * A pack is an optional industry module an organization can enable. Pack ids
 * live in `organizations.settings -> 'packs'` (jsonb array). Core screens
 * (leads, campaigns, calls, texting, numbers, DNC, settings, billing) are NOT
 * pack-gated; only the items registered here are.
 *
 * Keep this list in sync with the allowed list in
 * supabase/migrations/20261029010000_industry_packs.sql (set_org_packs).
 */

export const PACK_IDS = ['solar_exit', 'wholesale_re', 'door_to_door'] as const;

export type PackId = (typeof PACK_IDS)[number];

export interface PackSidebarItem {
  /** Dashboard tab id (the `?tab=` value). */
  id: string;
  label: string;
  /** lucide-react icon name, resolved in DashboardSidebar. */
  icon: string;
}

export interface PackSidebarGroup {
  title: string;
  items: PackSidebarItem[];
}

export interface PackDefinition {
  id: PackId;
  label: string;
  description: string;
  sidebarGroups: PackSidebarGroup[];
  /** Path prefixes owned by this pack (for route-level gating). */
  routes: string[];
}

export const PACKS: Record<PackId, PackDefinition> = {
  solar_exit: {
    id: 'solar_exit',
    label: 'Solar Exit',
    description:
      'The dialer workflow Solar Freedom runs today: AI campaigns, number rotation, spam detection and SMS messaging.',
    // These are the existing dialer tabs from DashboardSidebar's
    // "Phone & Dialing" group (values: predictive, rotation, spam, sms).
    sidebarGroups: [
      {
        title: 'Solar Exit',
        items: [
          { id: 'predictive', label: 'AI Campaigns', icon: 'Target' },
          { id: 'rotation', label: 'Number Rotation', icon: 'RotateCw' },
          { id: 'spam', label: 'Spam Detection', icon: 'Shield' },
          { id: 'sms', label: 'SMS Messaging', icon: 'MessageSquare' },
        ],
      },
    ],
    routes: [],
  },
  wholesale_re: {
    id: 'wholesale_re',
    label: 'Wholesale Real Estate',
    description:
      'Properties, distress list, call list, offers and deals for wholesale real-estate teams.',
    sidebarGroups: [
      {
        title: 'Wholesale RE',
        items: [{ id: 'wh-properties', label: 'Properties', icon: 'Building2' }],
      },
    ],
    routes: [],
  },
  door_to_door: {
    id: 'door_to_door',
    label: 'Door to Door',
    description:
      'Knock list, intake, canvassing map and call workspace for door-to-door teams.',
    sidebarGroups: [
      {
        title: 'Door to Door',
        items: [{ id: 'd2d-knock-list', label: 'Knock list', icon: 'DoorOpen' }],
      },
    ],
    routes: [],
  },
};

/** All pack ids in registry order. */
export const ALL_PACKS: PackDefinition[] = PACK_IDS.map((id) => PACKS[id]);

/** Narrow an arbitrary string to a PackId. */
export function isPackId(value: unknown): value is PackId {
  return typeof value === 'string' && (PACK_IDS as readonly string[]).includes(value);
}

/** Normalize a raw settings.packs value into a de-duplicated PackId[]. */
export function normalizePacks(raw: unknown): PackId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<PackId>();
  for (const value of raw) {
    if (isPackId(value)) seen.add(value);
  }
  return Array.from(seen);
}

/** Which pack (if any) owns a given dashboard tab id. */
export function packForTab(tab: string): PackId | null {
  for (const pack of ALL_PACKS) {
    for (const group of pack.sidebarGroups) {
      if (group.items.some((item) => item.id === tab)) return pack.id;
    }
  }
  return null;
}

/** Which pack (if any) owns a given pathname, by prefix match. */
export function packForPath(pathname: string): PackId | null {
  for (const pack of ALL_PACKS) {
    for (const prefix of pack.routes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return pack.id;
    }
  }
  return null;
}

=== FILE: src/hooks/useEnabledPacks.ts ===
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

=== FILE: src/components/PackComingSoon.tsx ===
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Construction } from 'lucide-react';
import { PACKS, type PackId } from '@/lib/packs';

interface PackComingSoonProps {
  pack: PackId;
  feature?: string;
}

/**
 * Placeholder screen for pack items whose real screens arrive later.
 */
const PackComingSoon = ({ pack, feature }: PackComingSoonProps) => {
  const definition = PACKS[pack];

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Construction className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">{feature ?? definition.label}</CardTitle>
          <Badge variant="outline" className="text-[10px] h-5">Coming soon</Badge>
        </div>
        <CardDescription>{definition.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This screen is part of the {definition.label} pack and is not built yet.
        </p>
      </CardContent>
    </Card>
  );
};

export default PackComingSoon;

=== FILE: src/components/PackLocked.tsx ===
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { PACKS, type PackId } from '@/lib/packs';

interface PackLockedProps {
  pack: PackId;
}

/**
 * Shown when a user lands on a `?tab=` that belongs to a pack the current
 * organization has not enabled.
 */
const PackLocked = ({ pack }: PackLockedProps) => {
  const definition = PACKS[pack];

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{definition.label} is not enabled</CardTitle>
        </div>
        <CardDescription>
          Ask an admin to enable the {definition.label} pack.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Admins can turn packs on or off under Settings &rarr; Packs.
        </p>
      </CardContent>
    </Card>
  );
};

export default PackLocked;

=== FILE: src/components/PackSettings.tsx ===
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  useCurrentOrganizationId,
  useIsOrganizationAdmin,
} from '@/contexts/OrganizationContext';
import { useEnabledPacks } from '@/hooks/useEnabledPacks';
import { ALL_PACKS, type PackId } from '@/lib/packs';

/**
 * Admin-only pack toggles. Non-admins see read-only badges.
 * Writes go through the set_org_packs RPC (admin-checked server side).
 */
const PackSettings = () => {
  const organizationId = useCurrentOrganizationId();
  const isAdmin = useIsOrganizationAdmin();
  const { packs, loading, refresh } = useEnabledPacks();
  const { toast } = useToast();
  const [saving, setSaving] = useState<PackId | null>(null);

  // Keep local state in sync with the hook's fetched value.
  const [enabled, setEnabled] = useState<PackId[]>(packs);
  useEffect(() => {
    setEnabled(packs);
  }, [packs]);

  const handleToggle = async (pack: PackId, next: boolean) => {
    if (!organizationId || !isAdmin) return;

    const previous = enabled;
    const nextPacks = next
      ? Array.from(new Set([...enabled, pack]))
      : enabled.filter((id) => id !== pack);

    setEnabled(nextPacks);
    setSaving(pack);

    try {
      const { error } = await supabase.rpc('set_org_packs', {
        p_org_id: organizationId,
        p_packs: nextPacks,
      });
      if (error) throw error;

      await refresh();
      toast({
        title: next ? 'Pack enabled' : 'Pack disabled',
        description: `${pack} ${next ? 'is now on' : 'is now off'} for this organization.`,
      });
    } catch (error) {
      console.error('Error updating packs:', error);
      setEnabled(previous);
      toast({
        title: 'Could not update packs',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Industry Packs</CardTitle>
          <CardDescription>
            Turn on the industry modules this organization uses. Core screens are always available.
            {!isAdmin && ' Only organization admins can change these.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {ALL_PACKS.map((pack) => {
        const isOn = enabled.includes(pack.id);
        return (
          <Card key={pack.id} className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    {pack.label}
                    {isOn ? (
                      <Badge variant="default" className="text-[10px] h-5">Enabled</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-5">Off</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">{pack.description}</CardDescription>
                </div>
                {isAdmin ? (
                  <Switch
                    checked={isOn}
                    disabled={saving === pack.id || !organizationId}
                    onCheckedChange={(checked) => handleToggle(pack.id, checked)}
                    aria-label={`Toggle ${pack.label} pack`}
                  />
                ) : (
                  <Badge variant={isOn ? 'default' : 'secondary'}>
                    {isOn ? 'Enabled' : 'Disabled'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground font-mono">{pack.id}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PackSettings;

=== FILE: src/components/DashboardSidebar.tsx ===
import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Phone,
  Target,
  BarChart3,
  RotateCw,
  Shield,
  MessageSquare,
  Workflow,
  Upload,
  Zap,
  Clock,
  Settings,
  Brain,
  Calendar,
  Bot,
  Sparkles,
  TrendingUp,
  FileText,
  Activity,
  Beaker,
  LayoutDashboard,
  ChevronDown,
  PanelLeftClose,
  ToggleLeft,
  ToggleRight,
  Radio,
  Rocket,
  AlertCircle,
  DollarSign,
  Users,
  Wallet,
  GitBranch,
  History,
  UserCircle,
  Lock,
  Play,
  Bell,
  ShieldCheck,
  Building2,
  DoorOpen,
  Package,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { Badge } from '@/components/ui/badge';
import { useIsOrganizationAdmin } from '@/contexts/OrganizationContext';
import { useEnabledPacks } from '@/hooks/useEnabledPacks';
import { ALL_PACKS, type PackId } from '@/lib/packs';

interface NavItem {
  title: string;
  value: string;
  icon: React.ElementType;
  simpleMode?: boolean; // If true, show in simple mode
  route?: string; // If set, navigates to this route instead of setting tab
  adminOnly?: boolean; // If true, only show for admin/owner users
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
  simpleModeLabel?: string; // Alternative label for simple mode
}

const navigationGroups: NavGroup[] = [
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { title: '⚡ Command Center', value: 'command-center', icon: Zap, simpleMode: true },
      { title: 'Release Evidence', value: 'launch-readiness', icon: ShieldCheck, simpleMode: true },
      { title: 'Dashboard', value: 'overview', icon: LayoutDashboard },
      { title: 'Try Demo', value: 'demo', icon: Play, route: '/demo' },
      { title: 'Setup Wizard', value: 'onboarding', icon: Rocket },
      { title: 'AI Setup', value: 'ai-setup', icon: Sparkles },
    ],
  },
  {
    label: 'Phone & Dialing',
    simpleModeLabel: 'Calling',
    defaultOpen: true,
    items: [
      { title: 'Voice Broadcast', value: 'broadcast', icon: Radio },
      { title: 'AI Campaigns', value: 'predictive', icon: Target },
      { title: 'Number Rotation', value: 'rotation', icon: RotateCw },
      { title: 'Spam Detection', value: 'spam', icon: Shield },
      { title: 'SMS Messaging', value: 'sms', icon: MessageSquare },
    ],
  },
  {
    label: 'Leads & Pipeline',
    defaultOpen: false,
    items: [
      { title: 'Lead Import & Review', value: 'leads', icon: Users, simpleMode: true },
      { title: 'Pipeline', value: 'pipeline', icon: Workflow },
      { title: 'Lead Upload', value: 'lead-upload', icon: Upload },
      { title: 'Appointments', value: 'calendar', icon: Calendar },
      { title: 'Dispositions', value: 'dispositions', icon: Zap },
      { title: 'Follow-ups', value: 'follow-ups', icon: Clock },
    ],
  },
  {
    label: 'AI & Automation',
    defaultOpen: true,
    items: [
      { title: 'Elite Pilot Copilot', value: 'autonomous-agent', icon: Brain, simpleMode: true },
      { title: 'Agent Builder', value: 'agent-builder', icon: GitBranch },
      { title: 'Telnyx Voice AI', value: 'telnyx-ai', icon: Bot },
      { title: 'Retell AI', value: 'retell', icon: Settings },
      { title: 'Workflows', value: 'workflows', icon: Zap },
      { title: 'Automation', value: 'automation', icon: Calendar },
      { title: 'AI Workflows', value: 'ai-workflows', icon: Sparkles },
      { title: 'Reachability', value: 'reachability', icon: TrendingUp },
      { title: 'AI Error Handler', value: 'ai-errors', icon: AlertCircle },
    ],
  },
  {
    label: 'Reports & Analytics',
    simpleModeLabel: 'Results',
    defaultOpen: false,
    items: [
      { title: 'Campaign Results', value: 'campaign-results', icon: BarChart3, simpleMode: true },
      { title: 'Call History', value: 'call-history', icon: History },
      { title: 'Call Analytics', value: 'analytics', icon: BarChart3 },
      { title: 'Daily Reports', value: 'reports', icon: FileText },
      { title: 'Live Monitor', value: 'live-monitor', icon: Activity },
      { title: 'A/B Testing', value: 'ab-testing', icon: Beaker },
      { title: 'Budget Manager', value: 'budget', icon: DollarSign },
      { title: 'Credits & Billing', value: 'credits', icon: Wallet },
      { title: 'Client Portal', value: 'client-portal', icon: UserCircle },
    ],
  },
  {
    label: 'System & Settings',
    defaultOpen: false,
    items: [
      { title: 'System Testing', value: 'system-testing', icon: Beaker, route: '/system-testing' },
      { title: 'Manager Alerts', value: 'manager-notifications', icon: Bell },
      { title: 'System Health', value: 'health', icon: Activity },
      { title: 'Settings', value: 'settings', icon: Settings, simpleMode: true, route: '/settings' },
      { title: 'Packs', value: 'packs', icon: Package },
      { title: 'Admin Settings', value: 'admin-settings', icon: Lock, adminOnly: true },
    ],
  },
];

// Filter navigation for simple mode and admin-only items
export const getFilteredNavigation = (isSimpleMode: boolean, isAdmin: boolean): NavGroup[] => {
  let groups = navigationGroups;

  // Filter out admin-only items if not admin
  groups = groups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.adminOnly || isAdmin),
  }));

  // Apply simple mode filtering
  if (isSimpleMode) {
    groups = groups
      .map(group => ({
        ...group,
        label: group.simpleModeLabel || group.label,
        items: group.items.filter(item => item.simpleMode),
      }));
  }

  return groups.filter(group => group.items.length > 0);
};

// Resolve a pack's icon name (string in the registry) to a lucide component.
const PACK_ICONS: Record<string, React.ElementType> = {
  Target,
  RotateCw,
  Shield,
  MessageSquare,
  Building2,
  DoorOpen,
};

const resolvePackIcon = (name: string): React.ElementType => PACK_ICONS[name] ?? Package;

// Build NavGroups for the packs the org has enabled, in registry order.
export const getPackNavigation = (enabledPacks: PackId[]): NavGroup[] => {
  const groups: NavGroup[] = [];
  for (const pack of ALL_PACKS) {
    if (!enabledPacks.includes(pack.id)) continue;
    for (const group of pack.sidebarGroups) {
      groups.push({
        label: group.title,
        defaultOpen: false,
        items: group.items.map((item) => ({
          title: item.label,
          value: item.id,
          icon: resolvePackIcon(item.icon),
        })),
      });
    }
  }
  return groups;
};

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const DashboardSidebar = ({ activeTab, onTabChange }: DashboardSidebarProps) => {
  const { toggleSidebar } = useSidebar();
  const { isSimpleMode, toggleMode } = useSimpleMode();
  const navigate = useNavigate();
  const isAdmin = useIsOrganizationAdmin();
  const { packs: enabledPacks } = useEnabledPacks();

  const filteredNavigation = getFilteredNavigation(isSimpleMode, isAdmin);
  const packNavigation = getPackNavigation(enabledPacks);
  const simpleModeTabCount = filteredNavigation.reduce((count, group) => count + group.items.length, 0);

  const handleNavigate = (route: string) => {
    navigate(route);
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">Smart Dialer</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8 shrink-0"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Mode Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMode}
          className="w-full mt-2 justify-between h-8 text-xs"
        >
          <span className="flex items-center gap-2">
            {isSimpleMode ? (
              <ToggleLeft className="h-4 w-4 text-primary" />
            ) : (
              <ToggleRight className="h-4 w-4 text-primary" />
            )}
            {isSimpleMode ? 'Simple Mode' : 'Full Mode'}
          </span>
          <Badge variant="outline" className="text-[10px] h-5">
            {isSimpleMode ? `${simpleModeTabCount} tabs` : '20+ tabs'}
          </Badge>
        </Button>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {filteredNavigation.map((group) => (
          <NavGroupCollapsible
            key={group.label}
            group={group}
            activeTab={activeTab}
            onTabChange={(tab) => {
              onTabChange(tab);
              // Auto-close sidebar on mobile after selection
              if (window.innerWidth < 768) {
                toggleSidebar();
              }
            }}
            onNavigate={handleNavigate}
          />
        ))}
        {packNavigation.map((group) => (
          <NavGroupCollapsible
            key={`pack-${group.label}`}
            group={group}
            activeTab={activeTab}
            onTabChange={(tab) => {
              onTabChange(tab);
              if (window.innerWidth < 768) {
                toggleSidebar();
              }
            }}
            onNavigate={handleNavigate}
          />
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="space-y-2">
          {isSimpleMode && (
            <p className="text-xs text-muted-foreground text-center">
              Need more features? Switch to <button onClick={toggleMode} className="text-primary hover:underline">Full Mode</button>
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center hidden sm:block">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘B</kbd> to toggle
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

interface NavGroupCollapsibleProps {
  group: NavGroup;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNavigate: (route: string) => void;
}

const NavGroupCollapsible = ({
  group,
  activeTab,
  onTabChange,
  onNavigate,
}: NavGroupCollapsibleProps) => {
  const hasActiveItem = group.items.some((item) => item.value === activeTab);
  const [isOpen, setIsOpen] = React.useState(group.defaultOpen || hasActiveItem);

  React.useEffect(() => {
    if (hasActiveItem) setIsOpen(true);
  }, [hasActiveItem]);

  const handleItemClick = (item: NavItem) => {
    if (item.route) {
      onNavigate(item.route);
    } else {
      onTabChange(item.value);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
      <SidebarGroup className="py-1">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {group.label}
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    onClick={() => handleItemClick(item)}
                    isActive={activeTab === item.value}
                    className={cn(
                      'touch-manipulation',
                      activeTab === item.value && 'bg-primary/10 text-primary font-medium'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
};

export default DashboardSidebar;

=== FILE: src/components/Dashboard.tsx ===
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { debouncedErrorToast } from '@/lib/toastDedup';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

// Eagerly loaded - needed for Overview tab (most common entry point)
import TabErrorBoundary from '@/components/TabErrorBoundary';
import DashboardSidebar from '@/components/DashboardSidebar';
import QuickStartCards from '@/components/QuickStartCards';
import TodayPerformanceCard from '@/components/TodayPerformanceCard';
import QuickLaunchButton from '@/components/QuickLaunchButton';
import SystemHealthIndicator from '@/components/SystemHealthIndicator';
import SystemHealthDashboard from '@/components/SystemHealthDashboard';
import AgentActivityWidget from '@/components/AgentActivityWidget';
import PendingCallbacksWidget from '@/components/PendingCallbacksWidget';
import GuardianStatusWidget from '@/components/GuardianStatusWidget';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleMode, SIMPLE_MODE_TABS } from '@/hooks/useSimpleMode';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_PHONE_NUMBERS } from '@/data/demo/demoPhoneNumbers';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { useEnabledPacks } from '@/hooks/useEnabledPacks';
import { packForTab } from '@/lib/packs';
import {
  CONTACT_EGRESS_LAUNCH_LOCK_MESSAGE,
  QUARANTINE_RELEASE_LAUNCH_LOCK_MESSAGE,
} from '@/lib/launchSafety';

// Lazy-loaded tab components - only loaded when user navigates to them
const CallAnalytics = lazy(() => import('@/components/CallAnalytics'));
const NumberRotationManager = lazy(() => import('@/components/NumberRotationManager'));
const SpamDetectionManager = lazy(() => import('@/components/SpamDetectionManager'));
const AIDecisionEngine = lazy(() => import('@/components/AIDecisionEngine'));
const PredictiveDialingDashboard = lazy(() => import('@/components/PredictiveDialingDashboard'));
const RetellAIManager = lazy(() => import('@/components/RetellAIManager'));
const EnhancedPipelineKanban = lazy(() => import('@/components/EnhancedPipelineKanban'));
const PipelineKanban = lazy(() => import('@/components/PipelineKanban'));
const SmsMessaging = lazy(() => import('@/components/SmsMessaging'));
const DailyReports = lazy(() => import('@/components/DailyReports'));
const CampaignAutomation = lazy(() => import('@/components/CampaignAutomation'));
const DispositionAutomationManager = lazy(() => import('@/components/DispositionAutomationManager'));
const AIPipelineManager = lazy(() => import('@/components/AIPipelineManager'));
const FollowUpScheduler = lazy(() => import('@/components/FollowUpScheduler'));
const AgentActivityDashboard = lazy(() => import('@/components/AgentActivityDashboard'));
const WorkflowBuilder = lazy(() => import('@/components/WorkflowBuilder'));
const LeadUpload = lazy(() => import('@/components/LeadUpload'));
const EnhancedLeadManager = lazy(() => import('@/components/EnhancedLeadManager'));
const AIWorkflowGenerator = lazy(() => import('@/components/AIWorkflowGenerator'));
const ReachabilityDashboard = lazy(() => import('@/components/ReachabilityDashboard'));
const CampaignResultsDashboard = lazy(() => import('@/components/CampaignResultsDashboard'));
const LiveCampaignMonitor = lazy(() => import('@/components/LiveCampaignMonitor'));
const WorkflowABTesting = lazy(() => import('@/components/WorkflowABTesting'));
const VoiceBroadcastManager = lazy(() => import('@/components/VoiceBroadcastManager'));
const AIErrorPanel = lazy(() => import('@/components/AIErrorPanel'));
const BudgetManager = lazy(() => import('@/components/BudgetManager').then(m => ({ default: m.BudgetManager })));
const OnboardingWizard = lazy(() => import('@/components/ai-configuration/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));
const AISetupAssistant = lazy(() => import('@/components/ai-configuration/AISetupAssistant').then(m => ({ default: m.AISetupAssistant })));
const CalendarIntegrationManager = lazy(() => import('@/components/CalendarIntegrationManager').then(m => ({ default: m.CalendarIntegrationManager })));
const AutonomousAgentDashboard = lazy(() => import('@/components/AutonomousAgentDashboard'));
const AgentFlowBuilder = lazy(() => import('@/components/AgentFlowBuilder'));
const CreditDashboard = lazy(() => import('@/components/CreditDashboard'));
const CallHistoryTable = lazy(() => import('@/components/CallHistoryTable'));
const ClientPortal = lazy(() => import('@/components/ClientPortal'));
const AdminSettings = lazy(() => import('@/components/AdminSettings'));
const TelnyxAIManager = lazy(() => import('@/components/TelnyxAIManager'));
const CommandCenter = lazy(() => import('@/components/CommandCenter'));
const ManagerNotifications = lazy(() => import('@/components/ManagerNotifications'));
const ProductionHealthDashboard = lazy(() => import('@/components/ProductionHealthDashboard').then(m => ({ default: m.ProductionHealthDashboard })));
const PackSettings = lazy(() => import('@/components/PackSettings'));
const PackComingSoon = lazy(() => import('@/components/PackComingSoon'));
const PackLocked = lazy(() => import('@/components/PackLocked'));

// Loading component for lazy-loaded tabs
const TabLoader = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-4 w-1/2" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
    <Skeleton className="h-64 mt-4" />
  </div>
);

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  status: 'active' | 'quarantined' | 'inactive';
  dailyCalls: number;
  spamScore: number;
  dateAdded: string;
  provider: 'twilio' | 'retell' | 'telnyx' | 'unknown';
  retellPhoneId?: string;
}

// Create a global event for opening AI chat with a prompt
export const openAIChatWithPrompt = (prompt: string) => {
  window.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt } }));
};

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'command-center');
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const { toast } = useToast();
  const { isSimpleMode } = useSimpleMode();
  const { isDemoMode } = useDemoMode();
  const { has: hasPack, loading: packsLoading } = useEnabledPacks();

  // Keep Simple Mode on its intentionally narrow, pilot-safe workflow even when
  // a user arrives through a bookmarked URL.
  useEffect(() => {
    if (isSimpleMode && !SIMPLE_MODE_TABS.includes(activeTab as typeof SIMPLE_MODE_TABS[number])) {
      setActiveTab('command-center');
      setSearchParams({ tab: 'command-center' });
      toast({
        title: 'Simple Mode',
        description: 'Opened the pilot workflow in Command Center.',
      });
    }
  }, [activeTab, isSimpleMode, setSearchParams, toast]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const loadNumbers = async () => {
    // Use demo data if in demo mode
    if (isDemoMode) {
      const demoNumbers: PhoneNumber[] = DEMO_PHONE_NUMBERS.map(num => ({
        id: num.id,
        phoneNumber: num.number,
        status: num.status as 'active' | 'quarantined' | 'inactive',
        dailyCalls: num.daily_calls,
        spamScore: num.is_spam ? 100 : 0,
        dateAdded: new Date().toISOString().split('T')[0],
        provider: num.provider as 'twilio' | 'retell' | 'telnyx' | 'unknown',
      }));
      setNumbers(demoNumbers);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedNumbers: PhoneNumber[] = (data || []).map(num => {
        let provider: 'twilio' | 'retell' | 'telnyx' | 'unknown' = 'unknown';
        if (num.retell_phone_id) {
          provider = 'retell';
        } else if (num.provider?.toLowerCase() === 'telnyx' || num.carrier_name?.toLowerCase().includes('telnyx')) {
          provider = 'telnyx';
        } else if (num.provider?.toLowerCase() === 'twilio' || num.twilio_sid) {
          provider = 'twilio';
        } else {
          provider = num.provider as any || 'unknown';
        }
        
        return {
          id: num.id,
          phoneNumber: num.number,
          status: num.status as 'active' | 'quarantined' | 'inactive',
          dailyCalls: num.daily_calls,
          spamScore: num.is_spam ? 100 : 0,
          dateAdded: new Date(num.created_at).toISOString().split('T')[0],
          provider,
          retellPhoneId: num.retell_phone_id || undefined,
        };
      });

      setNumbers(formattedNumbers);
    } catch (error) {
      console.error('Error loading numbers:', error);
      debouncedErrorToast(toast, 'Failed to load phone numbers from database', 'Error Loading Numbers');
    }
  };

  useEffect(() => {
    loadNumbers();
  }, [isDemoMode]);

  const handleTestCall = () => {
    toast({
      title: 'Call Testing Locked',
      description: CONTACT_EGRESS_LAUNCH_LOCK_MESSAGE,
      variant: 'destructive',
    });
  };

  const handleReleaseFromQuarantine = () => {
    toast({
      title: 'Quarantine Release Locked',
      description: QUARANTINE_RELEASE_LAUNCH_LOCK_MESSAGE,
      variant: 'destructive',
    });
  };

  const refreshNumbers = async () => {
    await loadNumbers();
    toast({
      title: 'Numbers Refreshed',
      description: 'Phone numbers have been refreshed.',
    });
  };

  const renderContent = () => {
    // Pack gating: if the active tab belongs to a pack the org has not enabled,
    // render PackLocked instead of the pack screen. Wait for packs to load so we
    // never flash a locked screen for an enabled pack.
    const owningPack = packForTab(activeTab);
    if (owningPack && !packsLoading && !hasPack(owningPack)) {
      return (
        <TabErrorBoundary tabName="Pack Locked">
          <Suspense fallback={<TabLoader />}>
            <PackLocked pack={owningPack} />
          </Suspense>
        </TabErrorBoundary>
      );
    }

    switch (activeTab) {
      case 'command-center':
        return (
          <TabErrorBoundary tabName="Command Center">
            <Suspense fallback={<TabLoader />}>
              <CommandCenter onNavigate={handleTabChange} onOpenAIChat={openAIChatWithPrompt} />
            </Suspense>
          </TabErrorBoundary>
        );
      case 'manager-notifications':
        return (
          <TabErrorBoundary tabName="Manager Notifications">
            <Suspense fallback={<TabLoader />}>
              <ManagerNotifications />
            </Suspense>
          </TabErrorBoundary>
        );
      case 'launch-readiness':
        return (
          <TabErrorBoundary tabName="Release Evidence">
            <Suspense fallback={<TabLoader />}>
              <ProductionHealthDashboard initialTab="providers" />
            </Suspense>
          </TabErrorBoundary>
        );
      case 'health':
        return (
          <TabErrorBoundary tabName="System Health">
            <Suspense fallback={<TabLoader />}>
              <ProductionHealthDashboard initialTab="system" />
            </Suspense>
          </TabErrorBoundary>
        );
      case 'overview':
        return (
          <TabErrorBoundary tabName="Overview">
            <div className="space-y-4 lg:space-y-6">
              {/* System Health Indicator - Always visible at top */}
              <SystemHealthIndicator compact />
              
              {/* Today's Performance - Always visible for quick stats */}
              <TodayPerformanceCard />
              
              {/* Review-only launch preparation */}
              <QuickLaunchButton />
              
              {/* Quick Start Cards - AI Guided Setup */}
              <QuickStartCards onOpenAIChat={openAIChatWithPrompt} />
              
              {/* Pending Callbacks - Prominent alerts for overdue callbacks */}
              <PendingCallbacksWidget />
              
              {/* System Health - Only on Overview */}
              <SystemHealthDashboard />
              
              {/* Quick Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Numbers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">
                      <AnimatedCounter value={numbers.length} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <AnimatedCounter value={numbers.filter(n => n.status === 'active').length} /> active
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Daily Calls
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">
                      <AnimatedCounter value={numbers.reduce((sum, n) => sum + n.dailyCalls, 0)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Avg: <AnimatedCounter value={Math.round(numbers.reduce((sum, n) => sum + n.dailyCalls, 0) / Math.max(numbers.length, 1))} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Quarantined
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">
                      <AnimatedCounter value={numbers.filter(n => n.status === 'quarantined').length} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <AnimatedCounter value={Math.round((numbers.filter(n => n.status === 'quarantined').length / Math.max(numbers.length, 1)) * 100)} suffix="%" /> of total
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Area Codes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">
                      <AnimatedCounter value={new Set(numbers.map(n => {
                        const cleaned = n.phoneNumber?.replace(/\D/g, '') || '';
                        return cleaned.length >= 4 ? cleaned.slice(cleaned.startsWith('1') ? 1 : 0, cleaned.startsWith('1') ? 4 : 3) : '';
                      }).filter(Boolean)).size} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Geographic spread</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AgentActivityWidget />
                <GuardianStatusWidget />
              </div>
              {/* Numbers Table */}
              <Card id="phone-numbers" className="bg-card/90 backdrop-blur-sm">
                <CardHeader className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Phone Numbers ({numbers.length})</CardTitle>
                    <Button onClick={refreshNumbers} variant="outline" size="sm">
                      <RotateCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4">
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground pb-3 border-b">
                        <div>Phone Number</div>
                        <div>Provider</div>
                        <div>Status</div>
                        <div>Daily Calls</div>
                        <div>Spam Score</div>
                        <div>Added</div>
                        <div>Actions</div>
                      </div>
                      <div className="space-y-2 mt-3">
                        {numbers.map((number) => (
                          <div key={number.id} className="grid grid-cols-7 gap-4 items-center py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="font-mono text-sm truncate">{number.phoneNumber}</div>
                            <div>
                              <Badge className={`text-xs ${
                                number.provider === 'retell'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                  : number.provider === 'telnyx'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}>
                                {number.provider === 'retell' ? 'Retell AI' : number.provider === 'telnyx' ? 'Telnyx' : 'Twilio'}
                              </Badge>
                            </div>
                            <div>
                              <Badge variant={number.status === 'active' ? 'default' : number.status === 'quarantined' ? 'destructive' : 'secondary'}>
                                {number.status}
                              </Badge>
                            </div>
                            <div className="text-sm">{number.dailyCalls}</div>
                            <div>
                              <Badge variant={number.spamScore > 70 ? 'destructive' : number.spamScore > 40 ? 'secondary' : 'default'}>
                                {number.spamScore}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">{number.dateAdded}</div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={handleTestCall} className="text-xs h-7 px-2">
                                Call Testing Locked
                              </Button>
                              {number.status === 'quarantined' && (
                                <Button size="sm" variant="outline" onClick={handleReleaseFromQuarantine} className="text-xs h-7 px-2 text-amber-700 border-amber-300 hover:bg-amber-50">
                                  Release Locked
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {numbers.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No caller-ID inventory found. Browser procurement is intentionally locked; add certified provider-binding evidence in Release Evidence before any phone activity.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabErrorBoundary>
        );
      case 'leads':
        return <TabErrorBoundary tabName="Leads"><Suspense fallback={<TabLoader />}><EnhancedLeadManager /></Suspense></TabErrorBoundary>;
      case 'pipeline':
      case 'pipelines':
        return <TabErrorBoundary tabName="Pipeline"><Suspense fallback={<TabLoader />}><EnhancedPipelineKanban /></Suspense></TabErrorBoundary>;
      case 'predictive':
      case 'dialer':
        return <TabErrorBoundary tabName="Predictive Dialing"><Suspense fallback={<TabLoader />}><PredictiveDialingDashboard /></Suspense></TabErrorBoundary>;
      case 'retell':
        return <TabErrorBoundary tabName="Retell AI"><Suspense fallback={<TabLoader />}><RetellAIManager /></Suspense></TabErrorBoundary>;
      case 'workflows':
        return <TabErrorBoundary tabName="Workflows"><Suspense fallback={<TabLoader />}><WorkflowBuilder /></Suspense></TabErrorBoundary>;
      case 'lead-upload':
        return <TabErrorBoundary tabName="Lead Upload"><Suspense fallback={<TabLoader />}><LeadUpload /></Suspense></TabErrorBoundary>;
      case 'analytics':
        return <TabErrorBoundary tabName="Analytics"><Suspense fallback={<TabLoader />}><CallAnalytics numbers={numbers} /></Suspense></TabErrorBoundary>;
      case 'ai-engine':
        return <TabErrorBoundary tabName="AI Engine"><Suspense fallback={<TabLoader />}><AIDecisionEngine numbers={numbers} onRefreshNumbers={refreshNumbers} /></Suspense></TabErrorBoundary>;
      case 'rotation':
        return <TabErrorBoundary tabName="Rotation"><Suspense fallback={<TabLoader />}><NumberRotationManager numbers={numbers} onRefreshNumbers={refreshNumbers} /></Suspense></TabErrorBoundary>;
      case 'spam':
        return <TabErrorBoundary tabName="Spam Detection"><Suspense fallback={<TabLoader />}><SpamDetectionManager /></Suspense></TabErrorBoundary>;
      case 'sms':
        return <TabErrorBoundary tabName="SMS"><Suspense fallback={<TabLoader />}><SmsMessaging /></Suspense></TabErrorBoundary>;
      case 'reports':
        return <TabErrorBoundary tabName="Reports"><Suspense fallback={<TabLoader />}><DailyReports /></Suspense></TabErrorBoundary>;
      case 'automation':
        return <TabErrorBoundary tabName="Automation"><Suspense fallback={<TabLoader />}><CampaignAutomation /></Suspense></TabErrorBoundary>;
      case 'dispositions':
        return <TabErrorBoundary tabName="Dispositions"><Suspense fallback={<TabLoader />}><DispositionAutomationManager /></Suspense></TabErrorBoundary>;
      case 'ai-manager':
        return <TabErrorBoundary tabName="AI Manager"><Suspense fallback={<TabLoader />}><AIPipelineManager /></Suspense></TabErrorBoundary>;
      case 'follow-ups':
        return <TabErrorBoundary tabName="Follow-ups"><Suspense fallback={<TabLoader />}><FollowUpScheduler /></Suspense></TabErrorBoundary>;
      case 'agent-activity':
        return <TabErrorBoundary tabName="Agent Activity"><Suspense fallback={<TabLoader />}><AgentActivityDashboard /></Suspense></TabErrorBoundary>;
      case 'ai-workflows':
        return <TabErrorBoundary tabName="AI Workflows"><Suspense fallback={<TabLoader />}><AIWorkflowGenerator /></Suspense></TabErrorBoundary>;
      case 'reachability':
        return <TabErrorBoundary tabName="Reachability"><Suspense fallback={<TabLoader />}><ReachabilityDashboard /></Suspense></TabErrorBoundary>;
      case 'campaign-results':
      case 'campaigns':
        return <TabErrorBoundary tabName="Campaign Results"><Suspense fallback={<TabLoader />}><CampaignResultsDashboard /></Suspense></TabErrorBoundary>;
      case 'live-monitor':
        return <TabErrorBoundary tabName="Live Monitor"><Suspense fallback={<TabLoader />}><LiveCampaignMonitor /></Suspense></TabErrorBoundary>;
      case 'ab-testing':
        return <TabErrorBoundary tabName="A/B Testing"><Suspense fallback={<TabLoader />}><WorkflowABTesting /></Suspense></TabErrorBoundary>;
      case 'broadcast':
        return <TabErrorBoundary tabName="Voice Broadcasting"><Suspense fallback={<TabLoader />}><VoiceBroadcastManager /></Suspense></TabErrorBoundary>;
      case 'ai-errors':
        return <TabErrorBoundary tabName="Guardian"><Suspense fallback={<TabLoader />}><AIErrorPanel /></Suspense></TabErrorBoundary>;
      case 'budget':
        return <TabErrorBoundary tabName="Budget Manager"><Suspense fallback={<TabLoader />}><BudgetManager /></Suspense></TabErrorBoundary>;
      case 'onboarding':
        return <TabErrorBoundary tabName="Setup Wizard"><Suspense fallback={<TabLoader />}><OnboardingWizard onComplete={() => handleTabChange('overview')} onSkip={() => handleTabChange('overview')} /></Suspense></TabErrorBoundary>;
      case 'ai-setup':
        return <TabErrorBoundary tabName="AI Setup"><Suspense fallback={<TabLoader />}><AISetupAssistant /></Suspense></TabErrorBoundary>;
      case 'calendar':
        return <TabErrorBoundary tabName="Calendar"><Suspense fallback={<TabLoader />}><CalendarIntegrationManager /></Suspense></TabErrorBoundary>;
      case 'autonomous-agent':
        return <TabErrorBoundary tabName="Autonomous Agent"><Suspense fallback={<TabLoader />}><AutonomousAgentDashboard /></Suspense></TabErrorBoundary>;
      case 'agent-builder':
        return <TabErrorBoundary tabName="Agent Flow Builder"><Suspense fallback={<TabLoader />}><AgentFlowBuilder /></Suspense></TabErrorBoundary>;
      case 'credits':
        return <TabErrorBoundary tabName="Credits"><Suspense fallback={<TabLoader />}><CreditDashboard /></Suspense></TabErrorBoundary>;
      case 'call-history':
        return <TabErrorBoundary tabName="Call History"><Suspense fallback={<TabLoader />}><CallHistoryTable /></Suspense></TabErrorBoundary>;
      case 'client-portal':
        return <TabErrorBoundary tabName="Client Portal"><Suspense fallback={<TabLoader />}><ClientPortal /></Suspense></TabErrorBoundary>;
      case 'admin-settings':
        return <TabErrorBoundary tabName="Admin Settings"><Suspense fallback={<TabLoader />}><AdminSettings /></Suspense></TabErrorBoundary>;
      case 'telnyx-ai':
        return <TabErrorBoundary tabName="Telnyx Voice AI"><Suspense fallback={<TabLoader />}><TelnyxAIManager /></Suspense></TabErrorBoundary>;
      case 'packs':
        return <TabErrorBoundary tabName="Packs"><Suspense fallback={<TabLoader />}><PackSettings /></Suspense></TabErrorBoundary>;
      case 'wh-properties':
        return <TabErrorBoundary tabName="Properties"><Suspense fallback={<TabLoader />}><PackComingSoon pack="wholesale_re" feature="Properties" /></Suspense></TabErrorBoundary>;
      case 'd2d-knock-list':
        return <TabErrorBoundary tabName="Knock list"><Suspense fallback={<TabLoader />}><PackComingSoon pack="door_to_door" feature="Knock list" /></Suspense></TabErrorBoundary>;
      default:
        return <div className="text-muted-foreground">Select a section from the sidebar</div>;
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background to-muted/30">
        <DashboardSidebar activeTab={activeTab} onTabChange={handleTabChange} />
        <SidebarInset className="flex-1 min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur px-3 sm:px-4 lg:px-6">
            <SidebarTrigger className="shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-semibold truncate">📞 Smart Dialer</h1>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
            <div className="max-w-full overflow-hidden">
              {renderContent()}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;

DESIGN NOTE
- Built: migration with `org_has_pack` (STABLE SECURITY DEFINER, pinned search_path, membership-gated) and `set_org_packs` (admin-gated, validates ids, merges into settings, returns new settings); both REVOKE PUBLIC/anon, GRANT authenticated+service_role. Frontend: `packs.ts` registry, `useEnabledPacks` hook (fetches `organizations.settings` by current org id, caches in state), `PackSettings` (admin switches via RPC, read-only badges otherwise), `PackComingSoon`, `PackLocked`, and patched `DashboardSidebar` (appends enabled pack groups, hides disabled) + `Dashboard` (pack-tab gating + `packs` tab + placeholder tabs).
- ASSUMPTION: `OrganizationWithRole` does not carry `settings`, so the hook fetches the row (RLS already restricts SELECT to members). ASSUMPTION: `solar_exit` sidebar items reuse existing dialer tab ids (`predictive`, `rotation`, `spam`, `sms`) from the "Phone & Dialing" group; those tabs are also reachable via core nav, so gating them only affects direct `?tab=` URLs. ASSUMPTION: `set_org_packs` replaces the array (not appends); empty array = core only. ASSUMPTION: `updated_at` on organizations is safe to touch (not billing-guarded).
- VERIFY: `organizations.updated_at` exists and is not blocked by `trg_guard_organization_billing_columns` (LIVE-SCHEMA lists it; trigger only guards billing/plan). VERIFY: `@/components/ui/switch` exists (shadcn standard; not shown in material). VERIFY: `use-toast` path `@/hooks/use-toast` matches repo. VERIFY: `organizations.settings` default is `'{}'` so `coalesce` is belt-and-braces. VERIFY: no existing `packs` tab id collision.

TESTS
1. Apply migration, then as service_role enable `wholesale_re` on org 11824e05-24e3-4dc3-b684-5d0bc7c436d6:
```sql
-- run as service_role (bypasses is_org_admin? NO - is_org_admin uses auth.uid(); service_role has no auth.uid())
-- Use direct UPDATE as service_role instead:
UPDATE public.organizations
   SET settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('packs', '["wholesale_re"]'::jsonb)
 WHERE id = '11824e05-24e3-4dc3-b684-5d0bc7c436d6'
RETURNING settings->'packs';
```
Expected: `["wholesale_re"]`.

2. Prove `org_has_pack` true/false (run as an authenticated member of that org, e.g. via `set local role authenticated; set local request.jwt.claims = '{"sub":"<member-uuid>"}'`):
```sql
SELECT public.org_has_pack('11824e05-24e3-4dc3-b684-5d0bc7c436d6','wholesale_re'); -- true
SELECT public.org_has_pack('11824e05-24e3-4dc3-b684-5d0bc7c436d6','door_to_door');  -- false
SELECT public.org_has_pack('11824e05-24e3-4dc3-b684-5d0bc7c436d6','solar_exit');    -- false
```
Expected: `t`, `f`, `f`. As a non-member: all `f`. As anon: `ERROR: permission denied for function org_has_pack`.

3. Prove `set_org_packs` guards:
```sql
-- as non-admin member:
SELECT public.set_org_packs('11824e05-24e3-4dc3-b684-5d0bc7c436d6', ARRAY['solar_exit']); -- ERROR 42501
-- as admin with bad id:
SELECT public.set_org_packs('11824e05-24e3-4dc3-b684-5d0bc7c436d6', ARRAY['bogus']);       -- ERROR 22023
-- as admin, valid:
SELECT public.set_org_packs('11824e05-24e3-4dc3-b684-5d0bc7c436d6', ARRAY['solar_exit','wholesale_re']);
```
Expected: 42501, 22023, then jsonb with `"packs": ["solar_exit","wholesale_re"]` and all other settings keys preserved.

4. Manual UI check (org with only `wholesale_re` enabled):
- Sidebar shows a new "Wholesale RE" group with "Properties"; no "Solar Exit" or "Door to Door" group.
- Navigate `?tab=wh-properties` → Properties "Coming soon" card renders.
- Navigate `?tab=d2d-knock-list` → "Door to Door is not enabled" PackLocked card with "Ask an admin to enable the Door to Door pack."
- Settings → Packs tab: admin sees three switches; toggling `door_to_door` on adds the "Door to Door" sidebar group with "Knock list" without reload; non-admin sees badges only.
- Disable `wholesale_re` in Packs → "Wholesale RE" group disappears from sidebar; `?tab=wh-properties` now shows PackLocked.