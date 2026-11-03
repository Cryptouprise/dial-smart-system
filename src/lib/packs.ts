
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
    // Core dialer tabs (predictive, rotation, spam, sms) are NEVER pack-gated: every company gets them.
    // Solar Exit registers its own workspace screen only (real screens arrive in phase 3).
    sidebarGroups: [
      {
        title: 'Solar Exit',
        items: [{ id: 'se-workspace', label: 'Solar Exit workspace', icon: 'Sun' }],
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
        items: [
          { id: 'd2d-app', label: 'DoorBoss app', icon: 'DoorOpen' },
          { id: 'd2d-knock-list', label: 'Knock list', icon: 'List' },
          { id: 'd2d-map', label: 'Map', icon: 'Map' },
          { id: 'd2d-call', label: 'Call', icon: 'Phone' },
        ],
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

