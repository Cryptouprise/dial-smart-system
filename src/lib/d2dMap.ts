/**
 * Door to Door pack - the canvassing map's brain.
 *
 * A port of the map logic in DoorBoss (docs/wholesale/doorboss-app/index.prod.html, v22.6):
 * `visibleProps`, `pinStyle`, `renderClusters`, `intentBonus`/`intentWhy`/`intentPick`, `updateNext`,
 * `planRoute`/`routeCandidates`/`routeInstallerChooser` and the basemap table.
 *
 * Everything here is pure and Leaflet-free so it can be unit tested and so the map screen, the route
 * planner and the next-door card cannot drift apart. The components own the Leaflet objects; this
 * module owns the decisions (what is visible, what colour, what to walk next).
 *
 * Types are structural rather than the row types from d2dApi, so importing this module never pulls
 * the Supabase client into a test or a bundle that does not need it.
 */

import { D2D_REKNOCK_DAYS, formatDistanceMeters, isKnockable, statusMeta } from '@/lib/doorToDoor';
import {
  boundsContain,
  hasLatLng,
  haversine,
  latLngOf,
  pointInPoly,
  type GeoBounds,
  type LatLng,
} from '@/lib/geo';

/* ============================================================
   WHAT A PIN NEEDS TO KNOW
   ============================================================ */

/** The columns the map reads off a property. `D2DProperty` satisfies this structurally. */
export interface MappableProperty {
  id: string;
  lat: number | null;
  lng: number | null;
  address: string;
  status: string;
  tier: string;
  installer: string | null;
  installer_status: string;
  territory_id: string | null;
  last_knock_at: string | null;
  callback_at: string | null;
  dnc: boolean;
}

/** The columns the map reads off a territory. `D2DTerritory` satisfies this structurally. */
export interface MappableTerritory {
  id: string;
  name: string;
  color: string;
  polygon: unknown;
  assigned_user_ids: unknown;
}

/** DoorBoss stores a territory outline as [[lat, lng], ...]; jsonb can hold anything, so coerce. */
export function territoryPolygon(territory: MappableTerritory | null | undefined): LatLng[] {
  const raw = territory?.polygon;
  if (!Array.isArray(raw)) return [];
  const out: LatLng[] = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
  }
  return out;
}

export function territoryAssignees(territory: MappableTerritory | null | undefined): string[] {
  const raw = territory?.assigned_user_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

/** Territories assigned to one rep. */
export function myTerritories(
  territories: MappableTerritory[],
  userId: string | null,
): MappableTerritory[] {
  if (!userId) return [];
  return territories.filter((t) => territoryAssignees(t).includes(userId));
}

/**
 * Is this house in one of the rep's territories? Ported from DoorBoss `inMyTerr`: a rep with no
 * territories is not restricted, which is what a brand-new account needs to see doors at all.
 */
export function inMyTerritory(
  property: MappableProperty,
  territories: MappableTerritory[],
): boolean {
  if (!territories.length) return true;
  return territories.some(
    (t) => t.id === property.territory_id || pointInPoly(latLngOf(property), territoryPolygon(t)),
  );
}

/* ============================================================
   FILTERS
   ============================================================ */

export type MapFilter = 'knockable' | 'callbacks' | 'appts' | 'hot' | 'all';

export interface MapFilterDef {
  id: MapFilter;
  label: string;
}

/** DoorBoss `filterChips`, in the same order. */
export const MAP_FILTERS: MapFilterDef[] = [
  { id: 'knockable', label: 'Knock next' },
  { id: 'callbacks', label: 'Follow-ups' },
  { id: 'appts', label: 'Appts' },
  { id: 'hot', label: 'Interested' },
  { id: 'all', label: 'All' },
];

/** The default is 'all' so a house the rep just knocked stays on the map in its new colour. */
export const DEFAULT_MAP_FILTER: MapFilter = 'all';

export function isMapFilter(value: unknown): value is MapFilter {
  return typeof value === 'string' && MAP_FILTERS.some((f) => f.id === value);
}

export interface MapFilterState {
  filter: MapFilter;
  /** "Bankrupt installer" chip (DoorBoss `orphanOnly`). */
  bankruptOnly: boolean;
  /** "In business" chip (DoorBoss `activeOnly`) - the other half of bankruptOnly. */
  inBusinessOnly: boolean;
  /** "My territory" chip. */
  mine: boolean;
}

export interface MapFilterContext extends MapFilterState {
  /** Territories assigned to the signed-in rep (their polygons matter, not just their ids). */
  myTerritories: MappableTerritory[];
  isManager: boolean;
  reknockDays?: number;
  now?: Date;
}

export const DEFAULT_MAP_FILTER_STATE: MapFilterState = {
  filter: DEFAULT_MAP_FILTER,
  mine: false,
  bankruptOnly: false,
  inBusinessOnly: false,
};

/** DoorBoss `visibleProps`: no position, filtered out, or outside the rep's patch - not on the map. */
export function visibleProperties<T extends MappableProperty>(
  properties: T[],
  ctx: MapFilterContext,
): T[] {
  const now = ctx.now ?? new Date();
  const reknockDays = ctx.reknockDays ?? D2D_REKNOCK_DAYS;

  return properties.filter((p) => {
    if (!hasLatLng(p)) return false;
    if (ctx.bankruptOnly && p.installer_status !== 'bankrupt') return false;
    if (ctx.inBusinessOnly && p.installer_status === 'bankrupt') return false;
    if (ctx.mine && !ctx.isManager && !inMyTerritory(p, ctx.myTerritories)) return false;
    if (ctx.mine && ctx.isManager && ctx.myTerritories.length && !inMyTerritory(p, ctx.myTerritories)) {
      return false;
    }
    switch (ctx.filter) {
      case 'knockable':
        return isKnockable(p, reknockDays, now);
      case 'callbacks':
        return p.status === 'callback';
      case 'appts':
        return p.status === 'appointment' || p.status === 'signed';
      case 'hot':
        return p.status === 'interested' || p.status === 'callback' || p.status === 'appointment';
      default:
        return true;
    }
  });
}

/** DoorBoss `showOnMap`: a house the current chips hide is jumped to by clearing the chips first. */
export function isHiddenByFilters(
  property: MappableProperty,
  ctx: MapFilterContext,
): boolean {
  return !visibleProperties([property], ctx).length;
}

/* ============================================================
   PINS
   ============================================================ */

export type BasemapId = 'streets' | 'satellite';

export const BANKRUPT_RING = '#ffc400';
export const BANKRUPT_FILL = '#e02438';

export interface PinContext {
  zoom: number;
  basemap: BasemapId;
  dark: boolean;
  /** Fingers, not a mouse: DoorBoss draws 70% bigger pins on a phone. */
  coarsePointer: boolean;
}

export interface PinStyle {
  radius: number;
  fillColor: string;
  color: string;
  weight: number;
  fillOpacity: number;
  opacity: number;
}

export function pinBaseRadius(zoom: number, coarsePointer: boolean): number {
  const base = zoom >= 18 ? 11 : zoom >= 17 ? 9 : zoom >= 16 ? 7 : zoom >= 15 ? 5.5 : 4;
  return base * (coarsePointer ? 1.7 : 1);
}

/** The statuses DoorBoss draws bigger, because they are the ones worth walking back to. */
const BIG_STATUSES = new Set(['appointment', 'signed', 'callback']);

/**
 * DoorBoss `pinStyle`. The colour comes from doorToDoor.ts (the pack's single source of truth for
 * status colours) rather than a second copy of the palette, and a bankrupt-installer house gets the
 * red fill + gold ring a rep can read from across the street.
 */
export function pinStyle(property: MappableProperty, ctx: PinContext): PinStyle {
  const status = statusMeta(property.status);
  const base = pinBaseRadius(ctx.zoom, ctx.coarsePointer);
  const big = BIG_STATUSES.has(property.status);
  const bankrupt = property.installer_status === 'bankrupt';

  return {
    radius: big ? base + 2 : base,
    fillColor: bankrupt && property.status === 'unknocked' ? BANKRUPT_FILL : status.color,
    color: bankrupt ? BANKRUPT_RING : ctx.basemap === 'satellite' || ctx.dark ? '#ffffff' : '#1b2430',
    weight: bankrupt ? 3 : ctx.basemap === 'satellite' ? 3 : 2,
    fillOpacity: property.status === 'do_not_knock' || property.status === 'not_interested' ? 0.6 : 1,
    opacity: 1,
  };
}

/* ============================================================
   CLUSTERS
   ============================================================ */

export const CLUSTER_ZOOM = 15;

/** A big list stays clustered one zoom level longer, or the phone melts. */
export function clusterZoom(propertyCount: number): number {
  return propertyCount > 8000 ? 16 : CLUSTER_ZOOM;
}

export function clusterCellSize(zoom: number): number {
  return zoom <= 12 ? 0.02 : zoom <= 13 ? 0.01 : 0.005;
}

export function clusterRadius(count: number): number {
  return count > 200 ? 26 : count > 60 ? 22 : count > 15 ? 18 : 14;
}

/** DoorBoss `clusterSub`: the label follows the active filter. */
export function clusterLabel(filter: MapFilter, knockableCount: number): string {
  if (filter === 'callbacks') return 'follow-ups';
  if (filter === 'appts') return 'appts';
  if (filter === 'hot') return 'hot';
  return `${knockableCount} to knock`;
}

export interface Cluster {
  key: string;
  n: number;
  lat: number;
  lng: number;
  knockable: number;
}

/**
 * DoorBoss `renderClusters`: bucket the list into cells and average each bucket. The longitude cell is
 * 1.3x the latitude cell so clusters stay round at Colorado's latitude.
 */
export function buildClusters(
  list: MappableProperty[],
  cell: number,
  reknockDays = D2D_REKNOCK_DAYS,
  now = new Date(),
): Cluster[] {
  const cells = new Map<string, Cluster>();
  for (const p of list) {
    if (!hasLatLng(p)) continue;
    const lat = p.lat as number;
    const lng = p.lng as number;
    const key = `${Math.floor(lat / cell)}|${Math.floor(lng / (cell * 1.3))}`;
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = { key, n: 0, lat: 0, lng: 0, knockable: 0 };
      cells.set(key, bucket);
    }
    bucket.n += 1;
    bucket.lat += lat;
    bucket.lng += lng;
    if (isKnockable(p, reknockDays, now)) bucket.knockable += 1;
  }
  return Array.from(cells.values()).map((c) => ({
    ...c,
    lat: c.lat / c.n,
    lng: c.lng / c.n,
  }));
}

/** Above this many doors the map switches from pins to cluster bubbles. */
export const CLUSTER_MIN_PINS = 60;

export function shouldCluster(listLength: number, zoom: number, propertyCount: number): boolean {
  return zoom < clusterZoom(propertyCount) && listLength > CLUSTER_MIN_PINS;
}

/** Only draw clusters near the screen once the list is big (DoorBoss v17). */
export const BIG_LIST = 3000;
export const BIG_LIST_CULL_ZOOM = 13;

/** DoorBoss v17: above 3000 doors, only the clusters near the screen are drawn. */
export function shouldCullClusters(propertyCount: number, zoom: number): boolean {
  return propertyCount > BIG_LIST && zoom >= BIG_LIST_CULL_ZOOM;
}

export function clustersInView<T extends Cluster>(clusters: T[], view: GeoBounds): T[] {
  return clusters.filter((c) => boundsContain(view, [c.lat, c.lng]));
}

/* ============================================================
   KNOCK NEXT - intent beats distance, but only nearby
   ============================================================ */

/** The ring inside which a far-away "interested" is allowed to pull the rep. DoorBoss v22.15. */
export const INTENT_RADIUS_M = 1500;
export const DUE_CALLBACK_WINDOW_MS = 30 * 60 * 1000;
export const RECENT_KNOCK_WINDOW_MS = 4 * 60 * 60 * 1000;

export function intentBonus(property: MappableProperty): number {
  let bonus = 0;
  if (property.status === 'interested') bonus = Math.max(bonus, 500);
  if (property.tier === 'verified_uninstalled') bonus = Math.max(bonus, 400);
  if (property.installer_status === 'bankrupt') bonus = Math.max(bonus, 300);
  if (property.tier === 'verified_installed') bonus = Math.max(bonus, 150);
  if (property.tier === 'permit_only') bonus = Math.max(bonus, 50);
  return bonus;
}

/** The reason line on the Knock next card: "Interested", "Bankrupt installer", ... */
export function intentWhy(property: MappableProperty): string {
  if (property.status === 'interested') return 'Interested';
  if (property.tier === 'verified_uninstalled') return 'No panels (high intent)';
  if (property.installer_status === 'bankrupt') return 'Bankrupt installer';
  if (property.tier === 'verified_installed') return 'Installed';
  if (property.tier === 'permit_only') return 'Permit';
  return statusMeta(property.status).label;
}

export interface ScoredProperty<P> {
  property: P;
  distanceM: number;
  score: number;
}

/** Best door by score = distance - intent bonus, where the bonus only counts inside INTENT_RADIUS_M. */
export function intentPick<P extends MappableProperty>(
  list: P[],
  from: LatLng,
): ScoredProperty<P> | undefined {
  let best: ScoredProperty<P> | undefined;
  for (const property of list) {
    if (!hasLatLng(property)) continue;
    const distanceM = haversine(from, latLngOf(property));
    const bonus = distanceM <= INTENT_RADIUS_M ? intentBonus(property) : 0;
    const score = distanceM - bonus;
    if (!best || score < best.score) best = { property, distanceM, score };
  }
  return best;
}

export interface NextPick<P> {
  property: P;
  distanceM: number;
  /** Ready to render, e.g. "Follow-up due · 320 ft". */
  why: string;
}

export interface NextContext {
  myPos: LatLng | null;
  mine: boolean;
  myTerritories: MappableTerritory[];
  /** Ids the rep skipped today (see loadSkips). */
  skips: Record<string, number>;
  reknockDays?: number;
  now?: Date;
}

export function nearest<P extends MappableProperty>(
  list: P[],
  from: LatLng,
): ScoredProperty<P> | undefined {
  let best: ScoredProperty<P> | undefined;
  for (const property of list) {
    if (!hasLatLng(property)) continue;
    const distanceM = haversine(from, latLngOf(property));
    if (!best || distanceM < best.distanceM) best = { property, distanceM, score: distanceM };
  }
  return best;
}

/**
 * DoorBoss `updateNext`. A callback that is due within half an hour always wins (the rep promised a
 * time); otherwise the best door by intent inside walking distance, and a door knocked in the last
 * four hours is left alone so the rep does not re-knock the street they just finished.
 */
export function nextHouse<P extends MappableProperty>(
  properties: P[],
  ctx: NextContext,
): NextPick<P> | undefined {
  if (!ctx.myPos) return undefined;
  const nowMs = (ctx.now ?? new Date()).getTime();
  const reknockDays = ctx.reknockDays ?? D2D_REKNOCK_DAYS;

  const candidates = properties.filter((p) => {
    if (!hasLatLng(p)) return false;
    if (ctx.mine && !inMyTerritory(p, ctx.myTerritories)) return false;
    if (p.status === 'do_not_knock' || p.dnc) return false;
    return !ctx.skips[p.id];
  });

  const dueCallbacks = candidates.filter((p) => {
    if (p.status !== 'callback' || !p.callback_at) return false;
    const at = new Date(p.callback_at).getTime();
    return Number.isFinite(at) && at <= nowMs + DUE_CALLBACK_WINDOW_MS;
  });
  if (dueCallbacks.length) {
    const pick = nearest(dueCallbacks, ctx.myPos);
    if (pick) {
      return {
        property: pick.property,
        distanceM: pick.distanceM,
        why: `Follow-up due · ${formatDistanceMeters(pick.distanceM)}`,
      };
    }
  }

  const knockable = candidates.filter((p) => {
    if (!isKnockable(p, reknockDays, ctx.now ?? new Date())) return false;
    if (p.status === 'callback' && p.callback_at) {
      const at = new Date(p.callback_at).getTime();
      if (Number.isFinite(at) && at > nowMs + DUE_CALLBACK_WINDOW_MS) return false;
    }
    if (p.status !== 'unknocked' && p.last_knock_at) {
      const last = new Date(p.last_knock_at).getTime();
      if (Number.isFinite(last) && nowMs - last < RECENT_KNOCK_WINDOW_MS) return false;
    }
    return true;
  });

  const pick = intentPick(knockable, ctx.myPos);
  if (!pick) return undefined;
  return {
    property: pick.property,
    distanceM: pick.distanceM,
    why: `${intentWhy(pick.property)} · ${formatDistanceMeters(pick.distanceM)}`,
  };
}

/** DoorBoss `TIERS[...].short` - the word that fits on the end of a Knock next line. */
export const D2D_TIER_SHORT: Record<string, string> = {
  verified_installed: 'Installed',
  verified_uninstalled: 'Uninstalled',
  permit_only: 'Permit',
  none: '—',
};

export function tierShort(tier: string | null | undefined): string {
  return D2D_TIER_SHORT[tier ?? 'none'] ?? D2D_TIER_SHORT.none;
}

/** "Interested · 320 ft · Sunrun · Installed" - DoorBoss `#nextS`. */
export function nextSubtitle(pick: NextPick<MappableProperty>): string {
  const parts = [pick.why];
  if (pick.property.installer) parts.push(pick.property.installer);
  parts.push(tierShort(pick.property.tier));
  return parts.join(' · ');
}

/* ============================================================
   SKIPPED DOORS (the X on the Knock next card)
   ============================================================ */

export const SKIP_STORAGE_KEY = 'dialsmart.d2d.skipnext.v1';
export const SKIP_TTL_MS = 14 * 60 * 60 * 1000;

/** Parse the skip store and drop anything older than 14 hours. Never throws. */
export function loadSkips(raw: string | null, nowMs = Date.now()): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof at === 'number' && nowMs - at <= SKIP_TTL_MS) out[id] = at;
  }
  return out;
}

export function serializeSkips(skips: Record<string, number>): string {
  return JSON.stringify(skips);
}

export function withSkip(
  skips: Record<string, number>,
  id: string,
  nowMs = Date.now(),
): Record<string, number> {
  return { ...skips, [id]: nowMs };
}

/* ============================================================
   ROUTE - walk the day's doors from where the rep is standing
   ============================================================ */

/** DoorBoss caps a planned route so the day stays walkable. */
export const ROUTE_MAX_STOPS = 120;
/** Ask which installer to walk when the patch spans this many houses per installer, twice over. */
export const ROUTE_INSTALLER_MIN_HOUSES = 3;
export const ROUTE_INSTALLER_MAX_CHOICES = 6;
export const DUE_ROUTE_CALLBACK_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface RouteStop<P> {
  property: P;
  /** Metres from the previous stop (the rep's position for the first one). */
  leg: number;
  /** A callback that is due within two hours, so it is walked first in time order. */
  due: boolean;
}

export interface RoutePlan<P> {
  stops: RouteStop<P>[];
  index: number;
  startedAt: number;
}

/**
 * Nearest-neighbour seed, then 2-opt until no improvement (DoorBoss `planRoute`). A hundred doors
 * plans in well under 50 ms on a phone. Callbacks due within two hours go first, in time order.
 */
export function planRoute<P extends MappableProperty>(
  start: LatLng,
  properties: P[],
  opts: { noOpt?: boolean; now?: Date } = {},
): RouteStop<P>[] {
  const nowMs = (opts.now ?? new Date()).getTime();
  const due = properties
    .filter((p) => {
      if (p.status !== 'callback' || !p.callback_at) return false;
      const at = new Date(p.callback_at).getTime();
      return Number.isFinite(at) && at <= nowMs + DUE_ROUTE_CALLBACK_WINDOW_MS;
    })
    .sort((a, b) => new Date(a.callback_at as string).getTime() - new Date(b.callback_at as string).getTime());

  const dueIds = new Set(due.map((p) => p.id));
  const rest = properties.filter((p) => !dueIds.has(p.id));

  const anchor: LatLng = due.length ? latLngOf(due[due.length - 1]) : start;
  let cursor: LatLng = anchor;
  const left = rest.slice();
  const order: P[] = [];
  while (left.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < left.length; i += 1) {
      const d = haversine(cursor, latLngOf(left[i]));
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const [next] = left.splice(bestIndex, 1);
    order.push(next);
    cursor = latLngOf(next);
  }

  // 2-opt: keep reversing segments while the tour gets shorter.
  const points = order.map((p) => latLngOf(p));
  const n = points.length;
  if (n > 3 && !opts.noOpt) {
    let improved = true;
    let passes = 0;
    while (improved && passes < 25) {
      improved = false;
      passes += 1;
      for (let i = 0; i < n - 2; i += 1) {
        for (let k = i + 1; k < n - 1; k += 1) {
          const a = i ? points[i - 1] : anchor;
          const b = points[i];
          const c = points[k];
          const e = points[k + 1];
          if (haversine(a, b) + haversine(c, e) > haversine(a, c) + haversine(b, e) + 0.5) {
            points.splice(i, k - i + 1, ...points.slice(i, k + 1).reverse());
            order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse());
            improved = true;
          }
        }
      }
    }
  }

  const stops: RouteStop<P>[] = [];
  let previous = start;
  for (const property of due.concat(order)) {
    const ll = latLngOf(property);
    stops.push({ property, leg: haversine(previous, ll), due: dueIds.has(property.id) });
    previous = ll;
  }
  return stops;
}

export interface RouteContext {
  mine: boolean;
  myTerritories: MappableTerritory[];
  /** When set, the route only walks this installer's houses. */
  installer?: string | null;
  reknockDays?: number;
  now?: Date;
}

/** DoorBoss `routeCandidates`: knockable, not a do-not-knock, has a position, in the rep's patch. */
export function routeCandidates<P extends MappableProperty>(
  properties: P[],
  ctx: RouteContext,
): P[] {
  const now = ctx.now ?? new Date();
  const reknockDays = ctx.reknockDays ?? D2D_REKNOCK_DAYS;
  return properties.filter((p) => {
    if (!hasLatLng(p)) return false;
    if (ctx.mine && !inMyTerritory(p, ctx.myTerritories)) return false;
    if (p.status === 'do_not_knock' || p.dnc) return false;
    if (ctx.installer && p.installer !== ctx.installer) return false;
    return isKnockable(p, reknockDays, now);
  });
}

export interface InstallerChoice {
  installer: string;
  count: number;
}

/** DoorBoss `routeInstallerChooser`: the top installers by house count, only when there is a choice. */
export function installerChoices<P extends MappableProperty>(
  properties: P[],
  ctx: RouteContext,
): InstallerChoice[] {
  const counts = new Map<string, number>();
  for (const p of routeCandidates(properties, { ...ctx, installer: null })) {
    const key = p.installer ?? '';
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= ROUTE_INSTALLER_MIN_HOUSES)
    .map(([installer, count]) => ({ installer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, ROUTE_INSTALLER_MAX_CHOICES);
}

/**
 * DoorBoss `startRoute`: take the closest ROUTE_MAX_STOPS doors first so the plan stays walkable,
 * then optimise the order.
 */
export function buildRoute<P extends MappableProperty>(
  start: LatLng,
  properties: P[],
  ctx: RouteContext,
): RoutePlan<P> {
  const candidates = routeCandidates(properties, ctx);
  const nearestFirst = candidates
    .map((property) => ({ property, d: haversine(start, latLngOf(property)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(candidates.length, ROUTE_MAX_STOPS))
    .map((x) => x.property);
  return { stops: planRoute(start, nearestFirst, { now: ctx.now }), index: 0, startedAt: Date.now() };
}

export function routeTotalDistance<P>(stops: RouteStop<P>[]): number {
  return stops.reduce((total, stop) => total + stop.leg, 0);
}

/** DoorBoss `drawRoute`: a dashed blue line the rep follows. */
export const ROUTE_LINE = { color: '#1e8cff', weight: 3, opacity: 0.55, dashArray: '6 8' };

/** DoorBoss `showNextRouteCard` `#nextS`: distance from where the rep stands, not from the last stop. */
export function routeStopSubtitle<P extends MappableProperty>(
  stop: RouteStop<P>,
  myPos: LatLng,
): string {
  const prefix = stop.due ? 'Follow-up due · ' : '';
  const parts = [`${prefix}${formatDistanceMeters(haversine(myPos, latLngOf(stop.property)))}`];
  if (stop.property.installer) parts.push(stop.property.installer);
  parts.push(tierShort(stop.property.tier));
  return parts.join(' · ');
}

/** The dashed line: from where the rep stands, through every stop still ahead of them. */
export function routePolyline<P extends MappableProperty>(
  start: LatLng,
  plan: RoutePlan<P>,
): LatLng[] {
  return [start, ...plan.stops.slice(plan.index).map((s) => latLngOf(s.property))];
}

/* ============================================================
   TERRITORIES
   ============================================================ */

export const TERRITORY_COLORS = ['#2b7fff', '#15a35a', '#7c5cff', '#e0a800', '#d64545', '#0b7a68'];

export function territoryColor(existingCount: number): string {
  return TERRITORY_COLORS[existingCount % TERRITORY_COLORS.length];
}

/** How many of a company's doors fall inside a shape the rep just drew. */
export function countInside(properties: MappableProperty[], polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;
  return properties.filter((p) => hasLatLng(p) && pointInPoly(latLngOf(p), polygon)).length;
}

/** A hand-added house borrows city + zip from the nearest house within 400 m (DoorBoss `nearZip`). */
export const NEAR_ZIP_RADIUS_M = 400;

export function nearestKnownZip(
  properties: MappableProperty[],
  ll: LatLng,
  cityOf: (p: MappableProperty) => string | null,
  zipOf: (p: MappableProperty) => string | null,
): { city: string; zip: string } {
  let best: MappableProperty | null = null;
  let bestDistance = Infinity;
  for (const p of properties) {
    if (!zipOf(p) || !hasLatLng(p)) continue;
    const d = haversine(ll, latLngOf(p));
    if (d < bestDistance) {
      bestDistance = d;
      best = p;
    }
  }
  if (!best || bestDistance >= NEAR_ZIP_RADIUS_M) return { city: '', zip: '' };
  return { city: cityOf(best) ?? '', zip: zipOf(best) ?? '' };
}

/* ============================================================
   BASEMAPS
   ============================================================ */

export interface BasemapDef {
  url: string;
  attribution: string;
  maxZoom: number;
}

/**
 * Streets from Esri World Street Map - keyless and built for app traffic (OpenStreetMap's own tile
 * server blocks apps at team scale). Satellite from Esri World Imagery, also keyless.
 */
export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  streets: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin, OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
};

/** Plain OpenStreetMap, used only if the primary host blocks us. */
export const BASEMAP_FALLBACK: BasemapDef = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: 'OpenStreetMap contributors',
  maxZoom: 19,
};

export const DEFAULT_BASEMAP: BasemapId = 'streets';
export const BASEMAP_STORAGE_KEY = 'dialsmart.d2d.basemap';

export function isBasemapId(value: unknown): value is BasemapId {
  return value === 'streets' || value === 'satellite';
}

/** The map opens here when the company has no positioned doors yet (Aurora, CO - DoorBoss's demo centre). */
export const MAP_FALLBACK_CENTER: LatLng = [39.6975, -104.8262];
export const MAP_FALLBACK_ZOOM = 16;
export const MAP_STREET_ZOOM = 17;
export const MAP_MAX_FIT_ZOOM = 17;
export const MAP_START_PAD = 0.08;

/** Street level: the basemap does not draw house numbers, so the pin grows a label. */
export const PIN_LABEL_MIN_ZOOM = 18;
/* ---------- the tile-fallback ladder ---------- */

export interface TileFallbackState {
  /** Already on the schematic grid: there is nothing left to swap to. */
  swapped: boolean;
  /** Already moved off the primary host to plain OpenStreetMap. */
  fellBack: boolean;
  /** At least one real tile has loaded this session. */
  loadedAny: boolean;
  /** Errors seen since the last reset. */
  errCount: number;
}

export type TileDecision = 'ignore' | 'fallback' | 'schematic';

/** Errors with no successful tile that justify giving up on real tiles entirely. */
export const TILE_ERROR_LIMIT = 6;

/** How long a map with errors and no successful tile waits before falling back (ms). */
export const TILE_FALLBACK_GRACE_MS = 8000;

/**
 * DoorBoss 2026-10-14: one failed tile used to flip the whole map to the schematic grid for the
 * rest of the session (an ad-blocker, an Esri 429, a dropped packet on a phone) and lock the
 * Satellite button with it. A failure only matters while NO real tile has ever loaded: the first
 * one swaps to plain OpenStreetMap, and only TILE_ERROR_LIMIT of those (or TILE_FALLBACK_GRACE_MS
 * with none) fall back to the grid. After a single tile loads, errors are just gaps that refill
 * on the next pan.
 */
export function tileErrorDecision(state: TileFallbackState): TileDecision {
  if (state.swapped || state.loadedAny) return 'ignore';
  if (!state.fellBack) return 'fallback';
  return state.errCount >= TILE_ERROR_LIMIT ? 'schematic' : 'ignore';
}
