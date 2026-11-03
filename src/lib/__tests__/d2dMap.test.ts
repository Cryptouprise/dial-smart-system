import { describe, expect, it } from 'vitest';

import { haversine, latLngOf, pathLength, type LatLng } from '@/lib/geo';
import {
  BANKRUPT_FILL,
  BANKRUPT_RING,
  BASEMAPS,
  BIG_LIST,
  CLUSTER_MIN_PINS,
  DEFAULT_MAP_FILTER,
  DUE_CALLBACK_WINDOW_MS,
  INTENT_RADIUS_M,
  MAP_FILTERS,
  RECENT_KNOCK_WINDOW_MS,
  ROUTE_MAX_STOPS,
  SKIP_TTL_MS,
  TILE_ERROR_LIMIT,
  TILE_FALLBACK_GRACE_MS,
  buildClusters,
  buildRoute,
  clusterCellSize,
  clusterLabel,
  clusterRadius,
  clusterZoom,
  clustersInView,
  countInside,
  installerChoices,
  intentBonus,
  intentPick,
  intentWhy,
  isBasemapId,
  isHiddenByFilters,
  isMapFilter,
  loadSkips,
  myTerritories,
  nearestKnownZip,
  nextHouse,
  nextSubtitle,
  pinBaseRadius,
  pinStyle,
  planRoute,
  routeCandidates,
  routeStopSubtitle,
  routeTotalDistance,
  serializeSkips,
  shouldCluster,
  shouldCullClusters,
  territoryAssignees,
  territoryColor,
  territoryPolygon,
  tileErrorDecision,
  tierShort,
  visibleProperties,
  withSkip,
  type MappableProperty,
  type MappableTerritory,
  type MapFilterContext,
} from '@/lib/d2dMap';

/* ---------- fixtures ---------- */

const NOW = new Date('2026-11-03T15:00:00Z');

function prop(over: Partial<MappableProperty> = {}): MappableProperty {
  return {
    id: over.id ?? 'p1',
    lat: 39.7,
    lng: -104.8,
    address: '1 Main St',
    status: 'unknocked',
    tier: 'none',
    installer: 'Sunrun',
    installer_status: 'unknown',
    territory_id: null,
    last_knock_at: null,
    callback_at: null,
    dnc: false,
    ...over,
  };
}

function territory(over: Partial<MappableTerritory> = {}): MappableTerritory {
  return {
    id: 't1',
    name: 'North',
    color: '#2b7fff',
    polygon: [],
    assigned_user_ids: [],
    ...over,
  };
}

function ctx(over: Partial<MapFilterContext> = {}): MapFilterContext {
  return {
    filter: DEFAULT_MAP_FILTER,
    mine: false,
    bankruptOnly: false,
    inBusinessOnly: false,
    myTerritories: [],
    isManager: false,
    now: NOW,
    ...over,
  };
}

/** A point `meters` due north of the fixture centre, for distance-based tests. */
const NORTH_M_PER_DEG = 111_195;
function north(meters: number, lng = -104.8): LatLng {
  return [39.7 + meters / NORTH_M_PER_DEG, lng];
}

/** The lat/lng half of a property fixture, from a plain LatLng. */
function pointFrom(ll: LatLng): { lat: number; lng: number } {
  return { lat: ll[0], lng: ll[1] };
}

/* ---------- territories ---------- */

describe('territoryPolygon', () => {
  it('reads an array of [lat, lng] pairs', () => {
    expect(
      territoryPolygon(territory({ polygon: [[1, 2], [3, 4]] })),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('returns an empty outline for null, a non-array or junk rows', () => {
    expect(territoryPolygon(null)).toEqual([]);
    expect(territoryPolygon(territory({ polygon: 'nope' }))).toEqual([]);
    expect(territoryPolygon(territory({ polygon: [[1], ['a', 'b'], [2, 3]] }))).toEqual([[2, 3]]);
  });
});

describe('territoryAssignees', () => {
  it('keeps only string ids', () => {
    expect(territoryAssignees(territory({ assigned_user_ids: ['u1', 7, null, 'u2'] }))).toEqual([
      'u1',
      'u2',
    ]);
  });

  it('is empty for a non-array', () => {
    expect(territoryAssignees(territory({ assigned_user_ids: { a: 1 } }))).toEqual([]);
    expect(territoryAssignees(null)).toEqual([]);
  });
});

describe('myTerritories', () => {
  it('keeps the ones the rep is assigned to', () => {
    const mine = territory({ id: 'a', assigned_user_ids: ['me'] });
    const theirs = territory({ id: 'b', assigned_user_ids: ['other'] });
    expect(myTerritories([mine, theirs], 'me').map((t) => t.id)).toEqual(['a']);
  });

  it('is empty without a signed-in user', () => {
    expect(myTerritories([territory({ assigned_user_ids: ['me'] })], null)).toEqual([]);
  });
});

describe('visibleProperties - territory scoping', () => {
  const inside = prop({ id: 'in', lat: 0.5, lng: 0.5 });
  const outside = prop({ id: 'out', lat: 5, lng: 5 });
  const square = territory({
    polygon: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
  });

  it('does not restrict a rep with no territories', () => {
    expect(visibleProperties([inside, outside], ctx({ mine: true }))).toHaveLength(2);
  });

  it('restricts a rep to their polygons', () => {
    const ids = visibleProperties([inside, outside], ctx({ mine: true, myTerritories: [square] })).map(
      (p) => p.id,
    );
    expect(ids).toEqual(['in']);
  });

  it('lets a house with a matching territory_id through even outside the outline', () => {
    const tagged = prop({ id: 'tagged', lat: 5, lng: 5, territory_id: 't1' });
    expect(visibleProperties([tagged], ctx({ mine: true, myTerritories: [square] }))).toHaveLength(1);
  });

  it('does not restrict a manager who has no territories', () => {
    expect(
      visibleProperties([inside, outside], ctx({ mine: true, isManager: true, myTerritories: [] })),
    ).toHaveLength(2);
  });

  it('restricts a manager who does have territories', () => {
    expect(
      visibleProperties([inside, outside], ctx({ mine: true, isManager: true, myTerritories: [square] })),
    ).toHaveLength(1);
  });
});

describe('visibleProperties - chips and filters', () => {
  it('never puts a house with no position on the map', () => {
    const noPos = prop({ id: 'x', lat: null, lng: null });
    expect(visibleProperties([noPos, prop({ id: 'y' })], ctx())).toHaveLength(1);
  });

  it('bankruptOnly keeps only bankrupt-installer homes', () => {
    const bankrupt = prop({ id: 'b', installer_status: 'bankrupt' });
    const active = prop({ id: 'a', installer_status: 'active' });
    expect(visibleProperties([bankrupt, active], ctx({ bankruptOnly: true })).map((p) => p.id)).toEqual(
      ['b'],
    );
  });

  it('inBusinessOnly is the other half', () => {
    const bankrupt = prop({ id: 'b', installer_status: 'bankrupt' });
    const active = prop({ id: 'a', installer_status: 'active' });
    expect(
      visibleProperties([bankrupt, active], ctx({ inBusinessOnly: true })).map((p) => p.id),
    ).toEqual(['a']);
  });

  it('callbacks filter', () => {
    const rows = [
      prop({ id: 'cb', status: 'callback' }),
      prop({ id: 'nh', status: 'not_home' }),
    ];
    expect(visibleProperties(rows, ctx({ filter: 'callbacks' })).map((p) => p.id)).toEqual(['cb']);
  });

  it('appts filter covers appointment and signed', () => {
    const rows = [
      prop({ id: 'ap', status: 'appointment' }),
      prop({ id: 'sg', status: 'signed' }),
      prop({ id: 'in', status: 'interested' }),
    ];
    expect(visibleProperties(rows, ctx({ filter: 'appts' })).map((p) => p.id)).toEqual(['ap', 'sg']);
  });

  it('hot filter covers interested, callback and appointment', () => {
    const rows = [
      prop({ id: 'in', status: 'interested' }),
      prop({ id: 'cb', status: 'callback' }),
      prop({ id: 'ap', status: 'appointment' }),
      prop({ id: 'nh', status: 'not_home' }),
    ];
    expect(visibleProperties(rows, ctx({ filter: 'hot' })).map((p) => p.id)).toEqual([
      'in',
      'cb',
      'ap',
    ]);
  });

  it('knockable filter follows isKnockable, including the reknock window', () => {
    const fresh = prop({ id: 'fresh', status: 'not_home', last_knock_at: NOW.toISOString() });
    const old = prop({
      id: 'old',
      status: 'not_home',
      last_knock_at: new Date(NOW.getTime() - 5 * 86_400_000).toISOString(),
    });
    const never = prop({ id: 'never', status: 'unknocked' });
    const dnc = prop({ id: 'dnc', status: 'do_not_knock' });
    expect(
      visibleProperties([fresh, old, never, dnc], ctx({ filter: 'knockable' })).map((p) => p.id),
    ).toEqual(['old', 'never']);
  });

  it('all filter keeps everything with a position', () => {
    const rows = [prop({ id: 'a', status: 'do_not_knock' }), prop({ id: 'b', status: 'signed' })];
    expect(visibleProperties(rows, ctx({ filter: 'all' }))).toHaveLength(2);
  });

  it('isHiddenByFilters answers the same question for one house', () => {
    const hidden = prop({ id: 'h', installer_status: 'active' });
    expect(isHiddenByFilters(hidden, ctx({ bankruptOnly: true }))).toBe(true);
    expect(isHiddenByFilters(hidden, ctx())).toBe(false);
  });
});

/* ---------- pins ---------- */

describe('pinBaseRadius', () => {
  it('grows with zoom and is 70% bigger on a touch screen', () => {
    expect(pinBaseRadius(14, false)).toBe(4);
    expect(pinBaseRadius(18, false)).toBe(11);
    expect(pinBaseRadius(18, true)).toBeCloseTo(18.7, 5);
  });
});

describe('pinStyle', () => {
  const base = { zoom: 18, basemap: 'streets' as const, dark: false, coarsePointer: false };

  it('uses the status colour from the shared vocabulary', () => {
    expect(pinStyle(prop({ status: 'interested' }), base).fillColor).toBe('#0ea5e9');
  });

  it('draws appointment, signed and callback two pixels bigger', () => {
    expect(pinStyle(prop({ status: 'unknocked' }), base).radius).toBe(11);
    expect(pinStyle(prop({ status: 'callback' }), base).radius).toBe(13);
  });

  it('gives a bankrupt installer a red fill and a gold ring', () => {
    const style = pinStyle(prop({ status: 'unknocked', installer_status: 'bankrupt' }), base);
    expect(style.fillColor).toBe(BANKRUPT_FILL);
    expect(style.color).toBe(BANKRUPT_RING);
    expect(style.weight).toBe(3);
  });

  it('keeps the status colour when a bankrupt-installer home has been knocked', () => {
    const style = pinStyle(prop({ status: 'interested', installer_status: 'bankrupt' }), base);
    expect(style.fillColor).toBe('#0ea5e9');
    expect(style.color).toBe(BANKRUPT_RING);
  });

  it('borders in white over satellite and in the dark theme', () => {
    expect(pinStyle(prop(), { ...base, basemap: 'satellite' }).color).toBe('#ffffff');
    expect(pinStyle(prop(), { ...base, dark: true }).color).toBe('#ffffff');
    expect(pinStyle(prop(), base).color).toBe('#1b2430');
  });

  it('fades the doors nobody should walk to', () => {
    expect(pinStyle(prop({ status: 'do_not_knock' }), base).fillOpacity).toBe(0.6);
    expect(pinStyle(prop({ status: 'not_interested' }), base).fillOpacity).toBe(0.6);
    expect(pinStyle(prop({ status: 'unknocked' }), base).fillOpacity).toBe(1);
  });

  it('falls back to the unknocked colour for a status it does not know', () => {
    expect(pinStyle(prop({ status: 'weird' }), base).fillColor).toBe('#94a3b8');
  });
});

/* ---------- clusters ---------- */

describe('clusters', () => {
  it('clusters below zoom 15, and one level longer for a big list', () => {
    expect(clusterZoom(500)).toBe(15);
    expect(clusterZoom(9000)).toBe(16);
  });

  it('cell size grows as you zoom out', () => {
    expect(clusterCellSize(12)).toBe(0.02);
    expect(clusterCellSize(13)).toBe(0.01);
    expect(clusterCellSize(14)).toBe(0.005);
  });

  it('bubble radius steps with the count', () => {
    expect(clusterRadius(10)).toBe(14);
    expect(clusterRadius(20)).toBe(18);
    expect(clusterRadius(100)).toBe(22);
    expect(clusterRadius(500)).toBe(26);
  });

  it('labels the bubble after the active filter', () => {
    expect(clusterLabel('knockable', 12)).toBe('12 to knock');
    expect(clusterLabel('callbacks', 12)).toBe('follow-ups');
    expect(clusterLabel('appts', 12)).toBe('appts');
    expect(clusterLabel('hot', 12)).toBe('hot');
    expect(clusterLabel('all', 12)).toBe('12 to knock');
  });

  it('buckets nearby houses together and averages the position', () => {
    const rows = [
      prop({ id: 'a', lat: 39.700, lng: -104.800 }),
      prop({ id: 'b', lat: 39.7005, lng: -104.8005 }),
      prop({ id: 'c', lat: 39.75, lng: -104.85 }),
    ];
    const clusters = buildClusters(rows, 0.005, 3, NOW);
    expect(clusters).toHaveLength(2);
    const big = clusters.find((c) => c.n === 2);
    expect(big).toBeDefined();
    expect(big!.lat).toBeCloseTo(39.70025, 6);
    expect(big!.knockable).toBe(2);
  });

  it('counts only knockable doors inside a bucket', () => {
    const rows = [
      prop({ id: 'a', status: 'unknocked' }),
      prop({ id: 'b', status: 'do_not_knock' }),
    ];
    const [cluster] = buildClusters(rows, 0.005, 3, NOW);
    expect(cluster.n).toBe(2);
    expect(cluster.knockable).toBe(1);
  });

  it('switches to pins only once the list is big enough', () => {
    expect(shouldCluster(CLUSTER_MIN_PINS, 14, 500)).toBe(false);
    expect(shouldCluster(CLUSTER_MIN_PINS + 1, 14, 500)).toBe(true);
    expect(shouldCluster(500, 15, 500)).toBe(false);
  });

  it('culls clusters to the screen only for a big list at street zoom', () => {
    expect(shouldCullClusters(BIG_LIST, 14)).toBe(false);
    expect(shouldCullClusters(BIG_LIST + 1, 14)).toBe(true);
    expect(shouldCullClusters(BIG_LIST + 1, 12)).toBe(false);
  });

  it('clustersInView keeps the bubbles inside the box', () => {
    const clusters = buildClusters(
      [
        prop({ id: 'a', lat: 39.700, lng: -104.800 }),
        prop({ id: 'b', lat: 39.900, lng: -104.900 }),
      ],
      0.005,
      3,
      NOW,
    );
    const view = { south: 39.69, west: -104.81, north: 39.71, east: -104.79 };
    expect(clustersInView(clusters, view)).toHaveLength(1);
  });
});

/* ---------- knock next ---------- */

describe('intentBonus and intentWhy', () => {
  it('takes the single best reason, not the sum', () => {
    const p = prop({ status: 'interested', tier: 'verified_uninstalled', installer_status: 'bankrupt' });
    expect(intentBonus(p)).toBe(500);
  });

  it('scores each signal', () => {
    expect(intentBonus(prop({ status: 'interested' }))).toBe(500);
    expect(intentBonus(prop({ tier: 'verified_uninstalled' }))).toBe(400);
    expect(intentBonus(prop({ installer_status: 'bankrupt' }))).toBe(300);
    expect(intentBonus(prop({ tier: 'verified_installed' }))).toBe(150);
    expect(intentBonus(prop({ tier: 'permit_only' }))).toBe(50);
    expect(intentBonus(prop())).toBe(0);
  });

  it('names the reason in DoorBoss order', () => {
    expect(intentWhy(prop({ status: 'interested' }))).toBe('Interested');
    expect(intentWhy(prop({ tier: 'verified_uninstalled' }))).toBe('No panels (high intent)');
    expect(intentWhy(prop({ installer_status: 'bankrupt' }))).toBe('Bankrupt installer');
    expect(intentWhy(prop({ tier: 'verified_installed' }))).toBe('Installed');
    expect(intentWhy(prop({ tier: 'permit_only' }))).toBe('Permit');
    expect(intentWhy(prop({ status: 'not_home' }))).toBe('Not home');
  });
});

describe('intentPick', () => {
  const me: LatLng = [39.7, -104.8];

  it('is undefined for an empty list', () => {
    expect(intentPick([], me)).toBeUndefined();
  });

  it('walks to the nearest door when nothing is high intent', () => {
    const near = prop({ id: 'near', ...pointFrom(north(200)) });
    const far = prop({ id: 'far', ...pointFrom(north(900)) });
    expect(intentPick([far, near], me)!.property.id).toBe('near');
  });

  it('lets intent beat distance inside the ring', () => {
    const hot = prop({ id: 'hot', status: 'interested', ...pointFrom(north(1400)) });
    const plain = prop({ id: 'plain', ...pointFrom(north(1000)) });
    expect(intentPick([plain, hot], me)!.property.id).toBe('hot');
  });

  it('never lets a far-away interested drag the rep across town', () => {
    const hot = prop({ id: 'hot', status: 'interested', ...pointFrom(north(INTENT_RADIUS_M + 200)) });
    const plain = prop({ id: 'plain', ...pointFrom(north(300)) });
    expect(intentPick([plain, hot], me)!.property.id).toBe('plain');
  });
});

describe('nextHouse', () => {
  const myPos: LatLng = [39.7, -104.8];
  const base = { myPos, mine: false, myTerritories: [], skips: {}, now: NOW };

  it('is undefined before the first GPS fix', () => {
    expect(nextHouse([prop()], { ...base, myPos: null })).toBeUndefined();
  });

  it('walks to the closest knockable door', () => {
    const near = prop({ id: 'near', ...pointFrom(north(120)) });
    const far = prop({ id: 'far', ...pointFrom(north(800)) });
    const pick = nextHouse([far, near], base);
    expect(pick!.property.id).toBe('near');
    expect(pick!.why).toContain('Not knocked yet');
  });

  it('always serves a follow-up that is due inside the half hour', () => {
    const due = prop({
      id: 'due',
      status: 'callback',
      callback_at: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
      ...pointFrom(north(900)),
    });
    const close = prop({ id: 'close', ...pointFrom(north(20)) });
    const pick = nextHouse([due, close], base);
    expect(pick!.property.id).toBe('due');
    expect(pick!.why).toContain('Follow-up due');
  });

  it('leaves a follow-up that is not due yet alone', () => {
    const later = prop({
      id: 'later',
      status: 'callback',
      callback_at: new Date(NOW.getTime() + 3 * 60 * 60_000).toISOString(),
      ...pointFrom(north(100)),
    });
    expect(nextHouse([later], base)).toBeUndefined();
  });

  it('skips do-not-knock doors and flagged DNC numbers', () => {
    const dnk = prop({ id: 'dnk', status: 'do_not_knock', ...pointFrom(north(10)) });
    const dnc = prop({ id: 'dnc', dnc: true, ...pointFrom(north(20)) });
    const ok = prop({ id: 'ok', ...pointFrom(north(500)) });
    expect(nextHouse([dnk, dnc, ok], base)!.property.id).toBe('ok');
  });

  it('does not send the rep back to a door they knocked in the last four hours', () => {
    const justKnocked = prop({
      id: 'just',
      status: 'interested',
      last_knock_at: new Date(NOW.getTime() - RECENT_KNOCK_WINDOW_MS / 2).toISOString(),
      ...pointFrom(north(10)),
    });
    const fresh = prop({ id: 'fresh', ...pointFrom(north(600)) });
    expect(nextHouse([justKnocked, fresh], base)!.property.id).toBe('fresh');
  });

  it('honours the skipped list', () => {
    const skipped = prop({ id: 'skipped', ...pointFrom(north(10)) });
    const other = prop({ id: 'other', ...pointFrom(north(600)) });
    const pick = nextHouse([skipped, other], { ...base, skips: { skipped: NOW.getTime() } });
    expect(pick!.property.id).toBe('other');
  });

  it('stays inside the rep territory when the My territory chip is on', () => {
    const square = territory({
      polygon: [
        [39.69, -104.81],
        [39.69, -104.79],
        [39.71, -104.79],
        [39.71, -104.81],
      ],
    });
    const inside = prop({ id: 'in', ...pointFrom([39.7005, -104.8005]) });
    const outside = prop({ id: 'out', ...pointFrom([39.75, -104.85]) });
    const pick = nextHouse([inside, outside], { ...base, mine: true, myTerritories: [square] });
    expect(pick!.property.id).toBe('in');
  });

  it('does not call a door in the half-hour window a follow-up when it is not a callback', () => {
    const p = prop({ id: 'x', ...pointFrom(north(50)) });
    expect(nextHouse([p], base)!.why).not.toContain('Follow-up');
  });
});

describe('nextSubtitle and tierShort', () => {
  it('shortens tiers the DoorBoss way', () => {
    expect(tierShort('verified_installed')).toBe('Installed');
    expect(tierShort('verified_uninstalled')).toBe('Uninstalled');
    expect(tierShort('permit_only')).toBe('Permit');
    expect(tierShort(null)).toBe('—');
    expect(tierShort('mystery')).toBe('—');
  });

  it('joins reason, installer and tier', () => {
    const pick = { property: prop({ installer: 'Sunrun', tier: 'verified_installed' }), distanceM: 100, why: 'Installed · 328 ft' };
    expect(nextSubtitle(pick)).toBe('Installed · 328 ft · Sunrun · Installed');
  });

  it('drops the installer when the record has none', () => {
    const pick = { property: prop({ installer: null, tier: 'none' }), distanceM: 100, why: 'Not knocked yet' };
    expect(nextSubtitle(pick)).toBe('Not knocked yet · —');
  });
});

/* ---------- skips ---------- */

describe('skips', () => {
  it('is empty for junk', () => {
    expect(loadSkips(null)).toEqual({});
    expect(loadSkips('')).toEqual({});
    expect(loadSkips('not json')).toEqual({});
    expect(loadSkips('[1,2]')).toEqual({});
  });

  it('keeps fresh skips and drops expired ones', () => {
    const raw = JSON.stringify({ fresh: 1000, stale: 0 });
    expect(Object.keys(loadSkips(raw, 1000 + SKIP_TTL_MS))).toEqual(['fresh']);
  });

  it('round-trips through serialize', () => {
    const skips = withSkip({}, 'a', 5000);
    expect(skips).toEqual({ a: 5000 });
    expect(loadSkips(serializeSkips(skips), 5000)).toEqual({ a: 5000 });
  });

  it('does not mutate the store it was given', () => {
    const before = { a: 1 };
    withSkip(before, 'b', 2);
    expect(before).toEqual({ a: 1 });
  });
});

/* ---------- route ---------- */

describe('planRoute', () => {
  const start: LatLng = [39.7, -104.8];

  it('visits every stop exactly once', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => prop({ id: `p${i}`, ...pointFrom(north(i * 150)) }));
    const stops = planRoute(start, rows, { now: NOW });
    expect(stops).toHaveLength(5);
    expect(new Set(stops.map((s) => s.property.id)).size).toBe(5);
  });

  it('walks nearest neighbour when the optimiser is off', () => {
    const near = prop({ id: 'near', ...pointFrom(north(100)) });
    const mid = prop({ id: 'mid', ...pointFrom(north(400)) });
    const far = prop({ id: 'far', ...pointFrom(north(900)) });
    const stops = planRoute(start, [far, near, mid], { noOpt: true, now: NOW });
    expect(stops.map((s) => s.property.id)).toEqual(['near', 'mid', 'far']);
  });

  it('never makes the tour longer than the seed', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      prop({ id: `p${i}`, ...pointFrom([39.7 + (i % 3) * 0.004, -104.8 + Math.floor(i / 3) * 0.004]) }),
    );
    const seeded = planRoute(start, rows, { noOpt: true, now: NOW });
    const optimised = planRoute(start, rows, { now: NOW });
    const seedLength = pathLength(
      start,
      seeded.map((s) => latLngOf(s.property)),
    );
    const optimisedLength = pathLength(
      start,
      optimised.map((s) => latLngOf(s.property)),
    );
    expect(optimisedLength).toBeLessThanOrEqual(seedLength + 1e-6);
  });

  it('puts callbacks that are due within two hours first, in time order', () => {
    const later = prop({
      id: 'later',
      status: 'callback',
      callback_at: new Date(NOW.getTime() + 90 * 60_000).toISOString(),
      ...pointFrom(north(900)),
    });
    const sooner = prop({
      id: 'sooner',
      status: 'callback',
      callback_at: new Date(NOW.getTime() + 20 * 60_000).toISOString(),
      ...pointFrom(north(800)),
    });
    const plain = prop({ id: 'plain', ...pointFrom(north(50)) });
    const stops = planRoute(start, [later, sooner, plain], { now: NOW });
    expect(stops.slice(0, 2).map((s) => s.property.id)).toEqual(['sooner', 'later']);
    expect(stops.filter((s) => s.due).map((s) => s.property.id)).toEqual(['sooner', 'later']);
    expect(stops[2].property.id).toBe('plain');
  });

  it('marks a leg for every stop and totals them', () => {
    const rows = [1, 2].map((i) => prop({ id: `p${i}`, ...pointFrom(north(i * 200)) }));
    const stops = planRoute(start, rows, { now: NOW });
    expect(routeTotalDistance(stops)).toBeCloseTo(
      stops.reduce((t, s) => t + s.leg, 0),
      6,
    );
    expect(stops[0].leg).toBeCloseTo(haversine(start, latLngOf(stops[0].property)), 3);
  });

  it('is empty with no stops', () => {
    expect(planRoute(start, [], { now: NOW })).toEqual([]);
  });
});

describe('routeCandidates', () => {
  const routeCtx = { mine: false, myTerritories: [], now: NOW };

  it('keeps knockable doors only', () => {
    const rows = [
      prop({ id: 'k', status: 'unknocked' }),
      prop({ id: 'd', status: 'do_not_knock' }),
      prop({ id: 'n', status: 'not_interested' }),
      prop({ id: 'x', lat: null, lng: null }),
      prop({ id: 'f', dnc: true }),
    ];
    expect(routeCandidates(rows, routeCtx).map((p) => p.id)).toEqual(['k']);
  });

  it('pins to one installer when asked', () => {
    const rows = [
      prop({ id: 'a', installer: 'Sunrun' }),
      prop({ id: 'b', installer: 'Tesla' }),
    ];
    expect(routeCandidates(rows, { ...routeCtx, installer: 'Tesla' }).map((p) => p.id)).toEqual(['b']);
  });

  it('respects the territory chip', () => {
    const square = territory({
      polygon: [
        [39.69, -104.81],
        [39.69, -104.79],
        [39.71, -104.79],
        [39.71, -104.81],
      ],
    });
    const rows = [prop({ id: 'in', ...pointFrom([39.7005, -104.8005]) }), prop({ id: 'out', ...pointFrom([39.75, -104.85]) })];
    expect(routeCandidates(rows, { ...routeCtx, mine: true, myTerritories: [square] }).map((p) => p.id)).toEqual(['in']);
  });
});

describe('installerChoices', () => {
  const routeCtx = { mine: false, myTerritories: [], now: NOW };

  function houses(installer: string, count: number, offset: number) {
    return Array.from({ length: count }, (_, i) =>
      prop({ id: `${installer}-${i}`, installer, ...pointFrom(north(offset + i * 10)) }),
    );
  }

  it('ignores installers with fewer than three doors', () => {
    expect(installerChoices([...houses('Sunrun', 3, 100), ...houses('Tesla', 2, 400)], routeCtx)).toEqual([
      { installer: 'Sunrun', count: 3 },
    ]);
  });

  it('sorts by house count and caps the list', () => {
    const many = [
      ...houses('A', 9, 0),
      ...houses('B', 7, 200),
      ...houses('C', 5, 400),
      ...houses('D', 4, 600),
      ...houses('E', 4, 800),
      ...houses('F', 3, 1000),
      ...houses('G', 3, 1200),
    ];
    const choices = installerChoices(many, routeCtx);
    expect(choices.map((c) => c.installer)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(choices[0].count).toBe(9);
  });

  it('counts across every installer even when a route installer is already set', () => {
    const rows = [...houses('Sunrun', 4, 0), ...houses('Tesla', 4, 200)];
    expect(installerChoices(rows, { ...routeCtx, installer: 'Sunrun' })).toHaveLength(2);
  });
});

describe('buildRoute', () => {
  it('caps the day at the DoorBoss maximum', () => {
    const rows = Array.from({ length: ROUTE_MAX_STOPS + 40 }, (_, i) =>
      prop({ id: `p${i}`, ...pointFrom(north(i * 5)) }),
    );
    const plan = buildRoute([39.7, -104.8], rows, { mine: false, myTerritories: [], now: NOW });
    expect(plan.stops).toHaveLength(ROUTE_MAX_STOPS);
    expect(plan.index).toBe(0);
  });

  it('starts with the doors closest to the rep', () => {
    const rows = Array.from({ length: ROUTE_MAX_STOPS + 10 }, (_, i) =>
      prop({ id: `p${i}`, ...pointFrom(north(i * 5)) }),
    );
    const plan = buildRoute([39.7, -104.8], rows, { mine: false, myTerritories: [], now: NOW });
    const ids = new Set(plan.stops.map((s) => s.property.id));
    expect(ids.has('p0')).toBe(true);
    expect(ids.has(`p${ROUTE_MAX_STOPS + 9}`)).toBe(false);
  });
});

describe('routeStopSubtitle', () => {
  it('leads with the follow-up flag and measures from where the rep stands', () => {
    const stop = {
      property: prop({ installer: 'Sunrun', tier: 'permit_only', ...pointFrom(north(300)) }),
      leg: 10,
      due: true,
    };
    const subtitle = routeStopSubtitle(stop, [39.7, -104.8]);
    expect(subtitle.startsWith('Follow-up due · ')).toBe(true);
    expect(subtitle).toContain('Sunrun · Permit');
  });
});

/* ---------- territories ---------- */

describe('territoryColor', () => {
  it('cycles the palette', () => {
    expect(territoryColor(0)).toBe('#2b7fff');
    expect(territoryColor(1)).not.toBe(territoryColor(0));
    expect(territoryColor(6)).toBe(territoryColor(0));
  });
});

describe('countInside', () => {
  const square: LatLng[] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];

  it('counts the doors in the shape', () => {
    const rows = [
      prop({ id: 'in', lat: 0.5, lng: 0.5 }),
      prop({ id: 'out', lat: 5, lng: 5 }),
      prop({ id: 'nopos', lat: null, lng: null }),
    ];
    expect(countInside(rows, square)).toBe(1);
  });

  it('is zero for a shape that is not a polygon', () => {
    expect(countInside([prop({ lat: 0.5, lng: 0.5 })], [[0, 0]])).toBe(0);
  });
});

describe('nearestKnownZip', () => {
  const cityOf = (p: MappableProperty) => (p.address === '1 Main St' ? 'Aurora' : null);
  const zipOf = (p: MappableProperty) => (p.address === '1 Main St' ? '80013' : null);

  it('borrows city and zip from the nearest house with one', () => {
    const rows = [prop({ id: 'known', address: '1 Main St', ...pointFrom(north(100)) })];
    expect(nearestKnownZip(rows, north(150), cityOf, zipOf)).toEqual({ city: 'Aurora', zip: '80013' });
  });

  it('gives nothing back when the nearest house is too far', () => {
    const rows = [prop({ id: 'known', address: '1 Main St', ...pointFrom(north(100)) })];
    expect(nearestKnownZip(rows, north(2000), cityOf, zipOf)).toEqual({ city: '', zip: '' });
  });

  it('gives nothing back when no house has a zip', () => {
    expect(nearestKnownZip([prop({ address: 'nowhere' })], north(10), cityOf, zipOf)).toEqual({
      city: '',
      zip: '',
    });
  });
});

/* ---------- basemaps and filter ids ---------- */

describe('basemaps', () => {
  it('has both layers with an attribution and a max zoom', () => {
    for (const def of Object.values(BASEMAPS)) {
      expect(def.url).toContain('{z}');
      expect(def.attribution.length).toBeGreaterThan(3);
      expect(def.maxZoom).toBeGreaterThanOrEqual(18);
    }
  });

  it('narrows a stored basemap id', () => {
    expect(isBasemapId('streets')).toBe(true);
    expect(isBasemapId('satellite')).toBe(true);
    expect(isBasemapId('hybrid')).toBe(false);
    expect(isBasemapId(null)).toBe(false);
  });
});

describe('MAP_FILTERS', () => {
  it('is DoorBoss order, Knock next first, All last', () => {
    expect(MAP_FILTERS.map((f) => f.id)).toEqual(['knockable', 'callbacks', 'appts', 'hot', 'all']);
    expect(MAP_FILTERS[0].label).toBe('Knock next');
  });

  it('narrows a stored filter id', () => {
    expect(isMapFilter('hot')).toBe(true);
    expect(isMapFilter('knockable_bankrupt')).toBe(false);
    expect(DEFAULT_MAP_FILTER).toBe('all');
  });
});

describe('DUE_CALLBACK_WINDOW_MS', () => {
  it('is half an hour, the same as DoorBoss', () => {
    expect(DUE_CALLBACK_WINDOW_MS).toBe(30 * 60 * 1000);
  });
});
describe('tileErrorDecision', () => {
  const state = (over: Partial<Parameters<typeof tileErrorDecision>[0]> = {}) => ({
    swapped: false,
    fellBack: false,
    loadedAny: false,
    errCount: 0,
    ...over,
  });

  it('falls back to plain OpenStreetMap on the first error', () => {
    expect(tileErrorDecision(state())).toBe('fallback');
    expect(tileErrorDecision(state({ errCount: 1 }))).toBe('fallback');
  });

  it('ignores every error once a real tile has loaded', () => {
    expect(tileErrorDecision(state({ loadedAny: true, fellBack: true, errCount: 99 }))).toBe('ignore');
    expect(tileErrorDecision(state({ loadedAny: true }))).toBe('ignore');
  });

  it('ignores errors after the grid is already showing', () => {
    expect(tileErrorDecision(state({ swapped: true, fellBack: true, errCount: 99 }))).toBe('ignore');
  });

  it('only gives up on real tiles at the error limit', () => {
    const fell = { fellBack: true } as const;
    expect(tileErrorDecision(state({ ...fell, errCount: TILE_ERROR_LIMIT - 1 }))).toBe('ignore');
    expect(tileErrorDecision(state({ ...fell, errCount: TILE_ERROR_LIMIT }))).toBe('schematic');
    expect(tileErrorDecision(state({ ...fell, errCount: TILE_ERROR_LIMIT + 10 }))).toBe('schematic');
  });

  it('keeps the DoorBoss numbers', () => {
    expect(TILE_ERROR_LIMIT).toBe(6);
    expect(TILE_FALLBACK_GRACE_MS).toBe(8000);
  });
});
