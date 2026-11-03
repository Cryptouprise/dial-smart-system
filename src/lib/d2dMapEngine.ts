/**
 * Door to Door pack - the canvassing map's Leaflet engine.
 *
 * A port of the map host in DoorBoss (docs/wholesale/doorboss-app/index.prod.html, v22.6):
 * `initMap`, `setBasemap`, `startView`, `renderPins` (with marker reuse), `labelPin`,
 * `renderClusters`, `renderTerritories`, `renderMeMarker`, `showCtx`, `drawStart`/`drawAdd`/
 * `drawUndo`/`drawCancel`, `startRoute`/`drawRoute`/`advance`/`endRoute`, `drawNextRing`,
 * `flashPin` and the tile-fallback ladder.
 *
 * Everything that can be decided without a browser lives in `d2dMap.ts` (pure, unit tested).
 * This file owns the Leaflet objects and the DOM the map itself needs, and hands every
 * decision that needs React (a dialog, a sheet, a toast) back to the caller through callbacks.
 * That split is why the map screen is a thin component instead of a second copy of DoorBoss.
 *
 * Lifecycle: `new DoorMapEngine(opts)` then `mount(container)`, `setData(...)`, and `destroy()`.
 * `setData` may be called before or after `mount`; whichever comes second does the first paint.
 */

import L from 'leaflet';

import {
  BASEMAP_FALLBACK,
  BASEMAPS,
  BASEMAP_STORAGE_KEY,
  BIG_LIST,
  buildClusters,
  buildRoute,
  clusterCellSize,
  clusterLabel,
  clusterRadius,
  countInside,
  DEFAULT_BASEMAP,
  installerChoices,
  isBasemapId,
  loadSkips as loadSkipStore,
  MAP_FALLBACK_CENTER,
  MAP_FALLBACK_ZOOM,
  MAP_MAX_FIT_ZOOM,
  MAP_START_PAD,
  MAP_STREET_ZOOM,
  nextHouse,
  nextSubtitle,
  PIN_LABEL_MIN_ZOOM,
  pinStyle,
  ROUTE_LINE,
  routePolyline,
  routeStopSubtitle,
  routeTotalDistance,
  serializeSkips,
  shouldCluster,
  shouldCullClusters,
  SKIP_STORAGE_KEY,
  territoryAssignees,
  territoryPolygon,
  tierShort,
  tileErrorDecision,
  TILE_FALLBACK_GRACE_MS,
  visibleProperties,
  withSkip,
  type BasemapId,
  type InstallerChoice,
  type MapFilterContext,
  type MapFilterState,
  type MappableProperty,
  type MappableTerritory,
  type NextPick,
  type RoutePlan,
  type TileFallbackState,
} from '@/lib/d2dMap';
import { canvasPad as viewportCanvasPad, houseNumber, latLngOf, pointInPoly, type LatLng } from '@/lib/geo';
import { SchematicLayer, StreetLayer } from '@/lib/d2dMapLayers';

/* ============================================================
   WHAT THE ENGINE NEEDS FROM ITS HOST
   ============================================================ */

/** The columns the map reads off a property on top of what `d2dMap.ts` needs. */
export interface DoorMapProperty extends MappableProperty {
  city: string | null;
  zip: string | null;
}

export interface DoorMapData {
  properties: DoorMapProperty[];
  territories: MappableTerritory[];
}

/** The Knock next card, ready to render. `status` is the DoorBoss status id for the swatch. */
export interface NextView {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  /** 1-based position and total when the pick came from a route, otherwise null. */
  routeStep: { index: number; total: number } | null;
}

/** What the draw bar shows while the rep is tapping out a territory. */
export interface DrawView {
  corners: number;
  inside: number;
}

export type StartRouteResult =
  | { kind: 'started'; doors: number; distanceM: number; due: number }
  | { kind: 'choose'; choices: InstallerChoice[] }
  | { kind: 'no-position' }
  | { kind: 'empty' };

export interface DoorMapCallbacks {
  /** A pin (or the Knock next card) was tapped - open the door sheet. */
  onOpenProperty: (propertyId: string) => void;
  /** "Add a house here" from the long-press menu. */
  onAddHouseHere: (ll: LatLng) => void;
  /** "Set my position here" (demo only in DoorBoss; wired for parity). */
  onSetPositionHere?: (ll: LatLng) => void;
  onToast: (message: string) => void;
  /** A plain map tap with nothing else to do - the host closes its sheet. */
  onMapClick: () => void;
  /** The basemap note ("The street map did not load..."), or null to clear it. */
  onNote: (text: string | null, quiet?: boolean) => void;
  /** The Knock next card changed (null = hide it). */
  onNext: (next: NextView | null) => void;
  /** The draw bar changed (null = not drawing). */
  onDraw: (draw: DrawView | null) => void;
  /** The rep finished a shape: the host asks for a name + assignees, then calls saveTerritory. */
  onTerritoryDrawn: (polygon: LatLng[], inside: number) => void;
  /** The chips changed from inside the engine (showOnMap clears them). */
  onFilterState: (state: MapFilterState) => void;
}

export interface DoorMapOptions extends DoorMapCallbacks {
  /** DoorBoss `isMgr()`: managers see every rep's patch and the Reps chip. */
  isManager: () => boolean;
  /** The signed-in rep, for "my territory". */
  me: { id: string } | null;
  /** Show "Set my position here" in the long-press menu (DoorBoss's demo builds). */
  allowManualPosition?: boolean;
  /** DoorBoss `CONFIG.reknockDays`, forwarded to the pure logic. */
  reknockDays?: number;
  /** Injected so tests and the screen can pin "now". */
  now?: () => Date;
}

/* ============================================================
   SMALL DOM / MEDIA HELPERS
   ============================================================ */

function prefersDark(): boolean {
  if (typeof document === 'undefined') return false;
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function coarsePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

function readStoredBasemap(): BasemapId | null {
  try {
    const stored = localStorage.getItem(BASEMAP_STORAGE_KEY);
    return isBasemapId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredBasemap(id: BasemapId): void {
  try {
    localStorage.setItem(BASEMAP_STORAGE_KEY, id);
  } catch {
    /* private mode - the choice just does not survive a reload */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The pin canvas padding for the window we are in (the formula itself lives in geo.ts). */
function viewportPad(): number {
  if (typeof window === 'undefined') return viewportCanvasPad(390, 760);
  return viewportCanvasPad(window.innerWidth || 390, window.innerHeight || 760);
}

/* ============================================================
   THE ENGINE
   ============================================================ */

interface DrawState {
  pts: LatLng[];
  line: L.Polygon | L.Polyline | null;
  dots: L.CircleMarker[];
}

export class DoorMapEngine {
  private readonly opts: DoorMapOptions;

  private map: L.Map | null = null;
  private container: HTMLElement | null = null;
  private ctxEl: HTMLElement | null = null;

  private data: DoorMapData = { properties: [], territories: [] };

  private tiles: L.TileLayer | null = null;
  private sat: L.TileLayer | null = null;
  private streetLayer: StreetLayer | null = null;
  private schematic = false;
  private basemap: BasemapId = DEFAULT_BASEMAP;
  private tileState: TileFallbackState = { swapped: false, fellBack: false, loadedAny: false, errCount: 0 };
  private failTimer: number | null = null;

  private markers = new Map<string, L.CircleMarker>();
  private clusterLayer: L.LayerGroup | null = null;
  private terrLayers = new Map<string, L.Polygon>();
  private routeLayer: L.Polyline | null = null;
  private meMarker: L.Marker | null = null;
  private accRing: L.Circle | null = null;
  private trail: L.Polyline | null = null;
  private nextRing: L.CircleMarker | null = null;
  private flashRing: L.CircleMarker | null = null;
  private flashTimer: number | null = null;
  /** SVG so the CSS pulse on `.d2d-next-ring` works; pins stay on canvas for speed. */
  private svg: L.SVG | null = null;

  private draw: DrawState | null = null;
  private route: { plan: RoutePlan<DoorMapProperty>; index: number; startedAt: number } | null = null;
  private routeInstaller: string | null = null;

  private myPos: LatLng | null = null;
  private accuracy = 0;
  private trailPoints: LatLng[] = [];
  private showMyTrail = false;

  private userMoved = false;
  private centeredOnMe = false;
  private centeredOnFirstFix = false;
  private dataBounds: L.LatLngBounds | null = null;

  private filterState: MapFilterState;
  private nextId: string | null = null;
  private nextAt = 0;
  private nextFrom: LatLng | null = null;
  private lastZoomAt = 0;
  private pinClickAt = 0;

  constructor(opts: DoorMapOptions) {
    this.opts = opts;
    this.filterState = {
      filter: 'all',
      mine: false,
      bankruptOnly: false,
      inBusinessOnly: false,
    };
  }

  /* ---------- lifecycle ---------- */

  mount(container: HTMLElement): void {
    if (this.map) return;
    this.container = container;

    const map = L.map(container, {
      preferCanvas: true,
      renderer: L.canvas({ tolerance: 10, padding: viewportPad() }),
      zoomControl: false,
      attributionControl: false,
      tap: false,
    });
    this.map = map;

    // Rotated phone / docked call window: the pin canvas has to grow with the screen.
    map.on('resize', () => {
      const renderer = map.options.renderer as L.Canvas | undefined;
      if (renderer?.options) renderer.options.padding = viewportPad();
    });

    this.startView();
    map.on('dragstart', () => {
      this.userMoved = true;
    });
    map.getContainer().addEventListener('touchstart', () => {
      this.userMoved = true;
    }, { passive: true });

    this.basemap = readStoredBasemap() ?? DEFAULT_BASEMAP;
    this.buildTiles();

    map.on('contextmenu', (e: L.LeafletMouseEvent) => this.showContextMenu(e));
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.draw) {
        this.addDrawPoint([e.latlng.lat, e.latlng.lng]);
        return;
      }
      this.hideContextMenu();
      if (Date.now() - this.pinClickAt > 300) this.opts.onMapClick();
    });
    map.on('movestart', () => this.hideContextMenu());

    // v22.10: an error in a zoom handler used to stop Leaflet's own redraw (giant stretched pins).
    map.on('zoomend', () => {
      this.lastZoomAt = Date.now();
      try {
        this.renderPins();
        this.drawNextRing();
      } catch (error) {
        console.warn('d2d map: pins after zoom', error);
      }
    });
    // v21: a zoom already redrew, so a move only redraws when the pins actually change.
    map.on('moveend', () => {
      if (this.lastZoomAt && Date.now() - this.lastZoomAt < 400) return;
      try {
        if (map.getZoom() >= PIN_LABEL_MIN_ZOOM || this.data.properties.length > BIG_LIST) this.renderPins();
      } catch (error) {
        console.warn('d2d map: pins after move', error);
      }
    });

    this.paint();
  }

  destroy(): void {
    this.clearFlash();
    if (this.failTimer != null) window.clearTimeout(this.failTimer);
    this.failTimer = null;
    if (this.map) {
      try {
        this.map.remove();
      } catch (error) {
        console.warn('d2d map: remove', error);
      }
    }
    this.map = null;
    this.container = null;
    this.ctxEl = null;
    this.markers.clear();
    this.terrLayers.clear();
    this.clusterLayer = null;
    this.routeLayer = null;
    this.meMarker = null;
    this.accRing = null;
    this.trail = null;
    this.nextRing = null;
    this.flashRing = null;
    this.svg = null;
    this.draw = null;
    this.route = null;
    this.tiles = null;
    this.sat = null;
    this.streetLayer = null;
  }

  /** Leaflet needs this after the host becomes visible (a tab switch, a rotated phone). */
  invalidateSize(): void {
    this.map?.invalidateSize();
  }

  isSchematic(): boolean {
    return this.schematic;
  }

  getBasemap(): BasemapId {
    return this.basemap;
  }

  getFilterState(): MapFilterState {
    return { ...this.filterState };
  }

  getRouteInstaller(): string | null {
    return this.routeInstaller;
  }

  /* ---------- data ---------- */

  setData(data: DoorMapData): void {
    const first = this.data.properties.length === 0 && data.properties.length > 0;
    this.data = data;
    if (!this.map) return;
    if (first) this.startView();
    this.paint();
  }

  setFilterState(patch: Partial<MapFilterState>): void {
    const next = { ...this.filterState, ...patch };
    // The two installer chips are halves of one question, so they never sit on together.
    if (patch.bankruptOnly) next.inBusinessOnly = false;
    if (patch.inBusinessOnly) next.bankruptOnly = false;
    this.filterState = next;
    this.opts.onFilterState(this.getFilterState());
    if (!this.map) return;
    this.renderPins();
    this.updateNext();
  }

  /** DoorBoss `setBasemap`. The schematic grid cannot be swapped away from without a reload. */
  setBasemap(id: BasemapId): void {
    if (this.schematic) {
      this.opts.onToast('Satellite needs a stronger signal; reload to try again');
      return;
    }
    const map = this.map;
    if (!map || !this.tiles || !this.sat) return;

    this.basemap = id;
    if (id === 'satellite') {
      if (map.hasLayer(this.tiles)) map.removeLayer(this.tiles);
      if (!map.hasLayer(this.sat)) this.sat.addTo(map);
    } else {
      if (map.hasLayer(this.sat)) map.removeLayer(this.sat);
      if (!map.hasLayer(this.tiles)) this.tiles.addTo(map);
    }
    writeStoredBasemap(id);

    // The border colour depends on the basemap, so every live pin is restyled.
    const byId = new Map(this.data.properties.map((p) => [p.id, p]));
    for (const [id, marker] of this.markers) {
      const property = byId.get(id);
      if (property) marker.setStyle(pinStyle(property, this.pinContext()));
    }
  }

  toggleBasemap(): void {
    this.setBasemap(this.basemap === 'satellite' ? 'streets' : 'satellite');
  }

  /* ---------- where the rep is ---------- */

  setMyPos(ll: LatLng | null, accuracy = 0): void {
    this.myPos = ll;
    this.accuracy = accuracy;
    if (!this.map) return;
    this.renderMeMarker();
    this.updateNextThrottled();

    // First real fix brings the rep to where they stand, unless they already moved the map or
    // the list is somewhere else entirely (then their patch is the useful view, not one house).
    if (ll && !this.centeredOnMe) {
      this.centeredOnMe = true;
      const near = !this.dataBounds || this.dataBounds.pad(1.0).contains(L.latLng(ll));
      if (!this.userMoved && near) {
        this.map.setView(ll, Math.max(this.map.getZoom(), MAP_STREET_ZOOM));
        this.centeredOnFirstFix = true;
      }
    }
  }

  /**
   * True when the first fix actually moved the map to the rep. False means the doors are far
   * away, so the screen fits the patch instead and says how far the nearest door is.
   */
  didCenterOnFirstFix(): boolean {
    return this.centeredOnFirstFix;
  }

  setTrail(points: LatLng[], visible = this.showMyTrail): void {
    this.trailPoints = points;
    this.showMyTrail = visible;
    if (!this.map) return;
    this.renderTrail();
  }

  centerOnMe(): void {
    if (!this.map) return;
    if (!this.myPos) {
      this.opts.onToast('No position yet');
      return;
    }
    this.map.setView(this.myPos, Math.max(this.map.getZoom(), MAP_STREET_ZOOM));
  }

  /** DoorBoss's startView, re-runnable: fit the rep's patch (or the whole list), else the fallback. */
  startView(): void {
    const map = this.map;
    if (!map) return;
    const pts = this.data.properties.filter((p) => p.lat != null && p.lng != null);
    if (pts.length) this.dataBounds = L.latLngBounds(pts.map((p) => [p.lat as number, p.lng as number]));

    if (!pts.length) {
      map.setView(MAP_FALLBACK_CENTER, MAP_FALLBACK_ZOOM);
      return;
    }
    const mine = this.opts.me ? pts.filter((p) => this.inMyTerritory(p)) : [];
    const use = mine.length ? mine : pts;
    const bounds = L.latLngBounds(use.map((p) => [p.lat as number, p.lng as number]));
    if (use.length === 1) map.setView(bounds.getCenter(), MAP_STREET_ZOOM);
    else map.fitBounds(bounds.pad(MAP_START_PAD), { maxZoom: MAP_MAX_FIT_ZOOM, animate: false });
  }

  /* ---------- knock next ---------- */

  nextPick(): NextPick<DoorMapProperty> | undefined {
    return nextHouse(this.data.properties, {
      myPos: this.myPos,
      mine: this.filterState.mine,
      myTerritories: this.myTerritories(),
      skips: this.opts.me ? this.loadSkips() : {},
      reknockDays: this.opts.reknockDays,
      now: this.now(),
    });
  }

  /** DoorBoss `updateNext`: the route card wins, then a due follow-up, then the best door by intent. */
  updateNext(): void {
    if (this.route) {
      this.showRouteCard();
      return;
    }
    if (!this.myPos || this.draw) {
      this.nextId = null;
      this.opts.onNext(null);
      this.drawNextRing();
      return;
    }
    const pick = this.nextPick();
    if (!pick) {
      this.nextId = null;
      this.opts.onNext(null);
      this.drawNextRing();
      return;
    }
    this.nextId = pick.property.id;
    this.drawNextRing();
    this.opts.onNext({
      id: pick.property.id,
      title: pick.property.address,
      subtitle: nextSubtitle(pick),
      status: pick.property.status,
      routeStep: null,
    });
  }

  /**
   * DoorBoss `updateNextThrottled`: a GPS fix every second must not rescan every house.
   * Only when 5 s have passed or the rep moved 15 m.
   */
  private updateNextThrottled(): void {
    const t = Date.now();
    const pos = this.myPos;
    if (this.nextAt && t - this.nextAt < 5000 && this.nextFrom && pos) {
      const moved = Math.abs(pos[0] - this.nextFrom[0]) + Math.abs(pos[1] - this.nextFrom[1]);
      if (moved * 111_320 < 15) return;
    }
    this.nextAt = t;
    this.nextFrom = pos ? ([pos[0], pos[1]] as LatLng) : null;
    this.updateNext();
  }

  /* ---------- skipping ---------- */

  skipNext(): void {
    if (this.route) {
      this.skipRouteStop();
      return;
    }
    if (!this.nextId) return;
    const skipped = this.loadSkips();
    this.saveSkips(withSkip(skipped, this.nextId));
    this.nextId = null;
    this.updateNext();
    this.opts.onToast(this.nextId ? 'Skipped for today' : 'No more houses to suggest right now');
  }

  private loadSkips(): Record<string, number> {
    try {
      return loadSkipStore(localStorage.getItem(SKIP_STORAGE_KEY));
    } catch {
      return {};
    }
  }

  private saveSkips(skips: Record<string, number>): void {
    try {
      localStorage.setItem(SKIP_STORAGE_KEY, serializeSkips(skips));
    } catch {
      /* private mode: the skip is just forgotten on reload */
    }
  }

  /* ---------- routes ---------- */

  /**
   * DoorBoss `startRoute`. The installer chooser is the host's dialog, so the first call may come
   * back as `choose`; the host then calls `setRouteInstaller` and starts again.
   */
  startRoute(): StartRouteResult {
    const start = this.myPos;
    if (!start) return { kind: 'no-position' };
    if (this.routeInstaller == null) {
      const choices = installerChoices(this.data.properties, this.routeContext(null));
      if (choices.length) return { kind: 'choose', choices };
    }
    const plan = buildRoute(start, this.data.properties, this.routeContext(this.routeInstaller));
    if (!plan.stops.length) return { kind: 'empty' };

    this.route = { plan, index: 0, startedAt: plan.startedAt };
    this.drawRoute();
    this.showRouteCard();
    return {
      kind: 'started',
      doors: plan.stops.length,
      distanceM: routeTotalDistance(plan.stops),
      due: plan.stops.filter((stop) => stop.due).length,
    };
  }

  setRouteInstaller(installer: string | null): void {
    this.routeInstaller = installer;
  }

  hasRoute(): boolean {
    return !!this.route;
  }

  routeRemaining(): number {
    if (!this.route) return 0;
    return Math.max(0, this.route.plan.stops.length - this.route.index);
  }

  /** DoorBoss `routeAdvance`: logging a knock on a route stop moves the route past it. */
  advanceRoute(propertyId: string): void {
    if (!this.route) return;
    const index = this.route.plan.stops.findIndex((stop) => stop.property.id === propertyId);
    if (index >= 0 && index >= this.route.index) this.route.index = index + 1;
    this.drawRoute();
    this.showRouteCard();
  }

  skipRouteStop(): void {
    if (!this.route) return;
    this.route.index = Math.min(this.route.plan.stops.length, this.route.index + 1);
    const finished = this.route.index >= this.route.plan.stops.length;
    this.drawRoute();
    this.showRouteCard();
    this.opts.onToast(finished ? 'Route finished' : 'Skipped that stop');
  }

  endRoute(): void {
    this.route = null;
    this.drawRoute();
    this.updateNext();
    this.opts.onToast('Route cleared');
  }

  /** DoorBoss `buildRoute` for one installer without the chooser: set it, then start. */
  routeForInstaller(installer: string | null): StartRouteResult {
    this.routeInstaller = installer;
    return this.startRoute();
  }

  private routeContext(installer: string | null) {
    return {
      mine: this.filterState.mine,
      myTerritories: this.myTerritories(),
      installer,
      reknockDays: this.opts.reknockDays,
      now: this.now(),
    };
  }

  private showRouteCard(): void {
    if (!this.route || this.route.index >= this.route.plan.stops.length) {
      this.route = null;
      this.drawRoute();
      this.updateNext();
      return;
    }
    const stop = this.route.plan.stops[this.route.index];
    const property = stop.property;
    this.nextId = property.id;
    this.drawNextRing();
    const start = this.myPos;
    this.opts.onNext({
      id: property.id,
      title: `${this.route.index + 1}/${this.route.plan.stops.length} · ${property.address}`,
      subtitle: start ? routeStopSubtitle(stop, start) : property.address,
      status: property.status,
      routeStep: { index: this.route.index + 1, total: this.route.plan.stops.length },
    });
  }

  /* ---------- drawing a territory ---------- */

  startDraw(): void {
    if (!this.map) return;
    this.draw = { pts: [], line: null, dots: [] };
    this.nextId = null;
    this.opts.onNext(null);
    this.map.getContainer().classList.add('d2d-crosshair');
    this.opts.onDraw({ corners: 0, inside: 0 });
  }

  isDrawing(): boolean {
    return !!this.draw;
  }

  addDrawPoint(ll: LatLng): void {
    const draw = this.draw;
    const map = this.map;
    if (!draw || !map) return;

    draw.pts.push(ll);
    const dot = L.circleMarker(ll, {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: '#f05a1a',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
    draw.dots.push(dot);
    this.redrawDrawLine();
    this.emitDraw();
  }

  undoDraw(): void {
    const draw = this.draw;
    const map = this.map;
    if (!draw || !map || !draw.pts.length) return;
    draw.pts.pop();
    const dot = draw.dots.pop();
    if (dot) map.removeLayer(dot);
    if (draw.line) {
      map.removeLayer(draw.line);
      draw.line = null;
    }
    this.redrawDrawLine();
    this.emitDraw();
  }

  cancelDraw(): void {
    const draw = this.draw;
    const map = this.map;
    if (!draw || !map) return;
    for (const dot of draw.dots) map.removeLayer(dot);
    if (draw.line) map.removeLayer(draw.line);
    this.draw = null;
    map.getContainer().classList.remove('d2d-crosshair');
    this.opts.onDraw(null);
    this.updateNext();
  }

  /** Returns the shape for the host to name + assign; the engine keeps drawing until it is saved. */
  finishDraw(): LatLng[] | null {
    const draw = this.draw;
    if (!draw || draw.pts.length < 3) {
      this.opts.onToast('Need at least 3 corners');
      return null;
    }
    const polygon = draw.pts.slice();
    this.opts.onTerritoryDrawn(polygon, countInside(this.data.properties, polygon));
    return polygon;
  }

  private redrawDrawLine(): void {
    const draw = this.draw;
    const map = this.map;
    if (!draw || !map) return;
    if (draw.line) {
      map.removeLayer(draw.line);
      draw.line = null;
    }
    if (!draw.pts.length) return;
    const style = { color: '#f05a1a', weight: 2, fillOpacity: 0.1, interactive: false };
    draw.line =
      draw.pts.length > 2 ? L.polygon(draw.pts, style).addTo(map) : L.polyline(draw.pts, style).addTo(map);
  }

  private emitDraw(): void {
    const draw = this.draw;
    if (!draw) {
      this.opts.onDraw(null);
      return;
    }
    this.opts.onDraw({ corners: draw.pts.length, inside: countInside(this.data.properties, draw.pts) });
  }

  /* ---------- jumping to a house ---------- */

  /** DoorBoss `showOnMap` + `flashPin`: street level, pulsing ring, filters cleared if needed. */
  showOnMap(propertyId: string): boolean {
    const map = this.map;
    const property = this.data.properties.find((p) => p.id === propertyId);
    if (!map || !property || property.lat == null || property.lng == null) return false;

    if (!this.isVisible(property)) {
      this.filterState = { filter: 'all', mine: false, bankruptOnly: false, inBusinessOnly: false };
      this.opts.onFilterState(this.getFilterState());
    }
    const ll: LatLng = [property.lat, property.lng];
    this.userMoved = true;
    map.setView(ll, PIN_LABEL_MIN_ZOOM, { animate: false });
    this.renderPins();
    this.flashPin(property);
    return true;
  }

  private flashPin(property: DoorMapProperty): void {
    const map = this.map;
    if (!map) return;
    this.clearFlash();
    const renderer = this.svgRenderer();
    this.flashRing = L.circleMarker(latLngOf(property), {
      renderer,
      radius: 24,
      color: '#f05a1a',
      weight: 4,
      fill: false,
      opacity: 0.95,
      interactive: false,
      className: 'd2d-next-ring',
    }).addTo(map);
    this.flashTimer = window.setTimeout(() => this.clearFlash(), 8000);
    this.opts.onToast(`${property.address} · tap the pin to log it`);
  }

  private clearFlash(): void {
    if (this.flashTimer != null) window.clearTimeout(this.flashTimer);
    this.flashTimer = null;
    if (this.flashRing && this.map) this.map.removeLayer(this.flashRing);
    this.flashRing = null;
  }

  /* ============================================================
     RENDERING
     ============================================================ */

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  private myTerritories(): MappableTerritory[] {
    const me = this.opts.me?.id;
    if (!me) return [];
    return this.data.territories.filter((t) => territoryAssignees(t).includes(me));
  }

  private inMyTerritory(property: DoorMapProperty): boolean {
    const mine = this.myTerritories();
    if (!mine.length) return false;
    return mine.some((t) => {
      const polygon = territoryPolygon(t);
      return polygon.length >= 3 && pointInPoly(latLngOf(property), polygon);
    });
  }

  private filterContext(): MapFilterContext {
    return {
      ...this.filterState,
      myTerritories: this.myTerritories(),
      isManager: this.opts.isManager(),
      reknockDays: this.opts.reknockDays,
      now: this.now(),
    };
  }

  private visible(): DoorMapProperty[] {
    return visibleProperties(this.data.properties, this.filterContext());
  }

  private isVisible(property: DoorMapProperty): boolean {
    return visibleProperties([property], this.filterContext()).length > 0;
  }

  private pinContext() {
    return {
      zoom: this.map ? this.map.getZoom() : MAP_FALLBACK_ZOOM,
      basemap: this.basemap,
      dark: prefersDark(),
      coarsePointer: coarsePointer(),
    };
  }

  private paint(): void {
    this.renderTerritories();
    this.renderPins();
    this.renderMeMarker();
    this.updateNext();
  }

  /** DoorBoss `renderTerritories`. Mine are solid; another rep's patch is dashed and faint. */
  private renderTerritories(): void {
    const map = this.map;
    if (!map) return;
    this.streetLayer?.invalidate();
    for (const layer of this.terrLayers.values()) map.removeLayer(layer);
    this.terrLayers.clear();

    const me = this.opts.me?.id;
    for (const territory of this.data.territories) {
      const polygon = territoryPolygon(territory);
      if (polygon.length < 3) continue;
      const mine = !!me && territoryAssignees(territory).includes(me);
      const layer = L.polygon(polygon, {
        color: territory.color || '#888888',
        weight: mine ? 3 : 2,
        dashArray: mine ? undefined : '6 6',
        fillOpacity: mine ? 0.08 : 0.04,
        interactive: false,
      }).addTo(map);
      this.terrLayers.set(territory.id, layer);
    }
  }

  /** DoorBoss `renderPins`: reuse the marker per house, or the map stutters on every GPS fix. */
  private renderPins(): void {
    const map = this.map;
    if (!map) return;
    const list = this.visible();
    const zoom = map.getZoom();

    if (shouldCluster(list.length, zoom, this.data.properties.length)) {
      for (const marker of this.markers.values()) {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
      this.renderClusters(list);
      return;
    }
    this.clusterLayer?.clearLayers();

    const visibleIds = new Set(list.map((p) => p.id));
    const cull = shouldCullClusters(this.data.properties.length, zoom);
    const view = cull ? map.getBounds().pad(0.6) : null;

    for (const property of this.data.properties) {
      const ll = latLngOf(property);
      const marker = this.markers.get(property.id);
      if (!visibleIds.has(property.id) || (view && !view.contains(ll))) {
        if (marker) {
          map.removeLayer(marker);
          if (view) this.markers.delete(property.id);
        }
        continue;
      }
      const style = pinStyle(property, this.pinContext());
      let live = marker;
      if (!live) {
        live = L.circleMarker(ll, style);
        live.on('click', () => {
          this.pinClickAt = Date.now();
          this.opts.onOpenProperty(property.id);
        });
        this.markers.set(property.id, live);
      } else {
        live.setStyle(style);
        live.setRadius(style.radius);
        live.setLatLng(ll);
      }
      if (!map.hasLayer(live)) live.addTo(map);
      this.labelPin(live, property, zoom);
    }
  }

  /** DoorBoss `renderClusters`: bucket the list and average each bucket. */
  private renderClusters(list: DoorMapProperty[]): void {
    const map = this.map;
    if (!map) return;
    if (!this.clusterLayer) this.clusterLayer = L.layerGroup().addTo(map);
    this.clusterLayer.clearLayers();

    const zoom = map.getZoom();
    const cell = clusterCellSize(zoom);
    // v17: above 3000 doors only the clusters near the screen are drawn.
    let buckets = list;
    if (shouldCullClusters(this.data.properties.length, zoom)) {
      const view = map.getBounds().pad(0.5);
      buckets = list.filter((p) => view.contains(latLngOf(p)));
    }
    const clusters = buildClusters(buckets, cell, this.opts.reknockDays, this.now());

    for (const cluster of clusters) {
      const radius = clusterRadius(cluster.n);
      const label = clusterLabel(this.filterState.filter, cluster.knockable);
      const icon = L.divIcon({
        className: '',
        html:
          `<div class="d2d-cluster" style="width:${radius * 2}px;height:${radius * 2}px">` +
          `<b>${cluster.n}</b><i>${label}</i></div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
      });
      const marker = L.marker([cluster.lat, cluster.lng], { icon });
      marker.on('click', () => map.setView([cluster.lat, cluster.lng], Math.min(MAP_MAX_FIT_ZOOM, zoom + 2)));
      this.clusterLayer.addLayer(marker);
    }
  }

  /** House number beside the pin at street level - the basemap does not draw them. */
  private labelPin(marker: L.CircleMarker, property: DoorMapProperty, zoom: number): void {
    const map = this.map;
    if (!map) return;
    const want =
      zoom >= PIN_LABEL_MIN_ZOOM && map.getBounds().pad(0.3).contains(latLngOf(property));
    if (want && !marker.getTooltip()) {
      const number = houseNumber(property.address);
      if (number) {
        marker.bindTooltip(number, {
          permanent: true,
          direction: 'right',
          offset: [6, 0],
          className: 'd2d-pin-label',
          interactive: false,
        });
      }
    } else if (!want && marker.getTooltip()) {
      marker.unbindTooltip();
    }
  }

  /** DoorBoss `renderMeMarker`: the rep's dot, an accuracy ring, and the day's trail when asked. */
  private renderMeMarker(): void {
    const map = this.map;
    if (!map) return;
    if (!this.myPos) {
      if (this.meMarker) {
        map.removeLayer(this.meMarker);
        this.meMarker = null;
      }
      if (this.accRing) {
        map.removeLayer(this.accRing);
        this.accRing = null;
      }
      this.renderTrail();
      return;
    }

    if (!this.meMarker) {
      this.meMarker = L.marker(this.myPos, {
        icon: L.divIcon({
          className: '',
          html: '<div class="d2d-me-dot"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(map);
    } else {
      this.meMarker.setLatLng(this.myPos);
    }

    if (this.accuracy > 12) {
      if (!this.accRing) {
        this.accRing = L.circle(this.myPos, {
          radius: this.accuracy,
          color: '#1e8cff',
          weight: 1,
          fillColor: '#1e8cff',
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(map);
      } else {
        this.accRing.setLatLng(this.myPos);
        this.accRing.setRadius(this.accuracy);
      }
    } else if (this.accRing) {
      map.removeLayer(this.accRing);
      this.accRing = null;
    }
    this.renderTrail();
  }

  private renderTrail(): void {
    const map = this.map;
    if (!map) return;
    if (!this.showMyTrail || this.trailPoints.length < 2) {
      if (this.trail) {
        map.removeLayer(this.trail);
        this.trail = null;
      }
      return;
    }
    if (!this.trail) {
      this.trail = L.polyline(this.trailPoints, {
        color: '#1e8cff',
        weight: 3,
        opacity: 0.5,
        interactive: false,
      }).addTo(map);
    } else {
      this.trail.setLatLngs(this.trailPoints);
    }
  }

  /** DoorBoss `drawRoute`: a dashed blue line from where the rep stands through every stop ahead. */
  private drawRoute(): void {
    const map = this.map;
    if (!map) return;
    if (this.routeLayer) {
      map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
    if (!this.route || !this.myPos) return;
    const points = routePolyline(this.myPos, this.route.plan);
    if (points.length < 2) return;
    this.routeLayer = L.polyline(points, { ...ROUTE_LINE, interactive: false }).addTo(map);
  }

  /** DoorBoss `drawNextRing`: an SVG ring so the CSS pulse works. */
  private drawNextRing(): void {
    const map = this.map;
    if (!map) return;
    if (this.nextRing) {
      map.removeLayer(this.nextRing);
      this.nextRing = null;
    }
    const id = this.nextId;
    if (!id) return;
    const property = this.data.properties.find((p) => p.id === id);
    if (!property || property.lat == null || property.lng == null) return;
    const zoom = map.getZoom();
    const radius = (zoom >= 18 ? 11 : zoom >= 17 ? 9 : zoom >= 16 ? 7 : 5.5) + 7;
    this.nextRing = L.circleMarker(latLngOf(property), {
      renderer: this.svgRenderer(),
      radius,
      color: '#f05a1a',
      weight: 3,
      fill: false,
      opacity: 0.95,
      interactive: false,
      className: 'd2d-next-ring',
    }).addTo(map);
    if (typeof this.nextRing.bringToBack === 'function') this.nextRing.bringToBack();
  }

  private svgRenderer(): L.SVG {
    if (!this.svg) this.svg = L.svg({ padding: 0.5 });
    return this.svg;
  }

  /* ---------- the long-press menu ---------- */

  private showContextMenu(e: L.LeafletMouseEvent): void {
    const map = this.map;
    const container = this.container;
    if (!map || !container || this.draw) return;

    this.hideContextMenu();
    const el = document.createElement('div');
    el.className = 'd2d-ctx';
    el.setAttribute('role', 'menu');

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.dataset.action = 'add';
    addButton.textContent = 'Add a house here';
    el.appendChild(addButton);

    if (this.opts.allowManualPosition) {
      const posButton = document.createElement('button');
      posButton.type = 'button';
      posButton.dataset.action = 'pos';
      posButton.textContent = 'Set my position here';
      el.appendChild(posButton);
    }

    const point = e.containerPoint;
    const size = map.getSize();
    el.style.left = `${clamp(point.x, 8, size.x - 220)}px`;
    el.style.top = `${clamp(point.y + 52, 60, size.y - 160)}px`;

    el.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      if (!button) return;
      const action = (button as HTMLButtonElement).dataset.action;
      this.hideContextMenu();
      const ll: LatLng = [e.latlng.lat, e.latlng.lng];
      if (action === 'add') this.opts.onAddHouseHere(ll);
      else if (action === 'pos') this.opts.onSetPositionHere?.(ll);
    });

    container.appendChild(el);
    this.ctxEl = el;
  }

  private hideContextMenu(): void {
    if (this.ctxEl?.parentNode) this.ctxEl.parentNode.removeChild(this.ctxEl);
    this.ctxEl = null;
  }

  /* ---------- tiles and the fallback ladder ---------- */

  private buildTiles(): void {
    const map = this.map;
    if (!map) return;

    const streets = BASEMAPS.streets;
    const satellite = BASEMAPS.satellite;

    this.tiles = L.tileLayer(streets.url, { maxZoom: streets.maxZoom, crossOrigin: true });
    this.sat = L.tileLayer(satellite.url, { maxZoom: satellite.maxZoom, crossOrigin: true });

    const noteLoaded = () => {
      this.tileState.loadedAny = true;
    };
    const onError = () => {
      const decision = tileErrorDecision(this.tileState);
      if (decision === 'ignore') return;
      if (decision === 'fallback') {
        this.swapToFallbackTiles();
        return;
      }
      this.goSchematic();
    };

    this.tiles.on('tileload', noteLoaded);
    this.sat.on('tileload', noteLoaded);
    this.tiles.on('tileerror', onError);
    this.sat.on('tileerror', onError);

    this.tiles.on('load', () => {
      if (!this.tileState.swapped && this.basemap === 'streets') this.opts.onNote(streets.attribution, true);
    });
    this.sat.on('load', () => {
      if (!this.tileState.swapped && this.basemap === 'satellite') this.opts.onNote(satellite.attribution, true);
    });

    (this.basemap === 'satellite' ? this.sat : this.tiles).addTo(map);

    // A map with errors and no successful tile: the host is blocked, not slow.
    this.failTimer = window.setTimeout(() => {
      if (!this.tileState.loadedAny && this.tileState.errCount > 0) this.goSchematic();
    }, TILE_FALLBACK_GRACE_MS);
  }

  /** The primary host is blocked: plain OpenStreetMap before giving up on real tiles entirely. */
  private swapToFallbackTiles(): void {
    const map = this.map;
    if (!map || !this.tiles) return;
    this.tileState.fellBack = true;
    this.tileState.errCount = 0;

    const wasOn = map.hasLayer(this.tiles);
    this.tiles.off('tileerror');
    this.tiles.off('tileload');
    this.tiles.off('load');
    if (wasOn) map.removeLayer(this.tiles);

    const replacement = L.tileLayer(BASEMAP_FALLBACK.url, {
      maxZoom: BASEMAP_FALLBACK.maxZoom,
      crossOrigin: true,
    });
    replacement.on('tileload', () => {
      this.tileState.loadedAny = true;
    });
    replacement.on('tileerror', () => {
      this.tileState.errCount += 1;
      if (tileErrorDecision(this.tileState) === 'schematic') this.goSchematic();
    });
    replacement.on('load', () => {
      if (!this.tileState.swapped && this.basemap === 'streets') this.opts.onNote(BASEMAP_FALLBACK.attribution, true);
    });
    this.tiles = replacement;
    if (wasOn) replacement.addTo(map);
  }

  /** No real tiles at all: the schematic grid plus streets drawn from the knock list. */
  private goSchematic(): void {
    const map = this.map;
    if (!map || this.tileState.swapped || this.tileState.loadedAny) return;
    this.tileState.swapped = true;
    this.schematic = true;

    if (this.tiles && map.hasLayer(this.tiles)) map.removeLayer(this.tiles);
    if (this.sat && map.hasLayer(this.sat)) map.removeLayer(this.sat);
    if (this.failTimer != null) window.clearTimeout(this.failTimer);
    this.failTimer = null;

    new SchematicLayer({ tileSize: 256, maxZoom: BASEMAP_FALLBACK.maxZoom }).addTo(map);
    this.streetLayer = new StreetLayer({
      data: () => ({ properties: this.data.properties, territories: this.data.territories }),
    }).addTo(map);
    this.opts.onNote(
      'The street map did not load (weak signal). Showing a simple map of your houses; reload to try the street map again.',
    );
    map.setView(map.getCenter(), Math.max(map.getZoom(), MAP_STREET_ZOOM));
    this.renderPins();
  }
}

/* ============================================================
   LOCAL HELPERS
   ============================================================ */


