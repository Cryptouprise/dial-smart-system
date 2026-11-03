/**
 * Door to Door pack - the map host.
 *
 * This is the React half of the canvassing map: it owns the Leaflet container, the engine's
 * lifecycle, and the overlay the rep actually touches (filter chips, the Knock next card, the
 * three FABs, the draw bar and the basemap note). Every decision lives in `d2dMapEngine.ts` /
 * `d2dMap.ts`; this file only wires them to React state and forwards the rep's taps.
 *
 * A port of DoorBoss's `#view-map` section (docs/wholesale/doorboss-app/index.prod.html, v22.6):
 * `#filterChips`, `#mapNote`, `#drawBar`, `.map-fabs`, `#nextCard`.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Plus, Route as RouteIcon, Satellite } from 'lucide-react';

import {
  DEFAULT_BASEMAP,
  DEFAULT_MAP_FILTER_STATE,
  MAP_FILTERS,
  type BasemapId,
  type MapFilterState,
  type MappableTerritory,
} from '@/lib/d2dMap';
import {
  DoorMapEngine,
  type DoorMapData,
  type DoorMapProperty,
  type DrawView,
  type NextView,
  type StartRouteResult,
} from '@/lib/d2dMapEngine';
import type { LatLng } from '@/lib/geo';
import { statusMeta } from '@/lib/doorToDoor';

/** What the screen is allowed to ask the engine to do (Leaflet is imperative, so are we). */
export interface DoorMapHandle {
  centerOnMe: () => void;
  showOnMap: (propertyId: string) => boolean;
  startRoute: () => StartRouteResult;
  routeForInstaller: (installer: string | null) => StartRouteResult;
  setRouteInstaller: (installer: string | null) => void;
  hasRoute: () => boolean;
  routeRemaining: () => number;
  advanceRoute: (propertyId: string) => void;
  skipRouteStop: () => void;
  endRoute: () => void;
  startDraw: () => void;
  undoDraw: () => void;
  cancelDraw: () => void;
  finishDraw: () => LatLng[] | null;
  isDrawing: () => boolean;
  invalidateSize: () => void;
  setTrail: (points: LatLng[], visible: boolean) => void;
  getFilterState: () => MapFilterState;
  isSchematic: () => boolean;
}

export interface DoorMapProps {
  properties: DoorMapProperty[];
  territories: MappableTerritory[];
  me: { id: string } | null;
  isManager: boolean;
  myPos: LatLng | null;
  accuracy: number;
  trail: LatLng[];
  showTrail: boolean;
  reknockDays?: number;
  className?: string;

  onOpenProperty: (propertyId: string) => void;
  /** A bare map tap with nothing else to do - the screen closes its sheet. */
  onMapClick?: () => void;
  onAddHouseHere: (ll: LatLng) => void;
  onSetPositionHere?: (ll: LatLng) => void;
  onTerritoryDrawn: (polygon: LatLng[], inside: number) => void;
  onToast: (message: string) => void;
  /** The locate FAB. The screen decides whether to nudge the rep about GPS. */
  onLocate: () => void;
  /** The route FAB. The screen runs the installer chooser and the started/empty toasts. */
  onRouteRequested: () => void;
  /** The primary FAB - add a house where the rep is standing. */
  onAddAtMyPosition: () => void;

  onFilterStateChange?: (state: MapFilterState) => void;
  /** The Knock next card changed - the screen mirrors it for its own route strip. */
  onNextChange?: (next: NextView | null) => void;
  onSchematicChange?: (schematic: boolean) => void;
}

const CHIP_BASE =
  'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';
const CHIP_ON = 'border-primary bg-primary text-primary-foreground';
const CHIP_OFF = 'border-border bg-card/90 text-muted-foreground hover:text-foreground';
const FAB_BASE =
  'pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-lg transition-transform active:scale-95';

const DoorMap = forwardRef<DoorMapHandle, DoorMapProps>(function DoorMap(props, ref) {
  const {
    properties,
    territories,
    me,
    isManager,
    myPos,
    accuracy,
    trail,
    showTrail,
    reknockDays,
    className,
    onOpenProperty,
    onMapClick,
    onAddHouseHere,
    onSetPositionHere,
    onTerritoryDrawn,
    onToast,
    onLocate,
    onRouteRequested,
    onAddAtMyPosition,
    onFilterStateChange,
    onNextChange,
    onSchematicChange,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DoorMapEngine | null>(null);
  const [engine, setEngine] = useState<DoorMapEngine | null>(null);

  /** The engine is built once, so it reads the latest props through this ref, never a stale closure. */
  const latest = useRef(props);
  latest.current = props;

  const [filterState, setFilterState] = useState<MapFilterState>(DEFAULT_MAP_FILTER_STATE);
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const [schematic, setSchematic] = useState(false);
  const [routeInstaller, setRouteInstaller] = useState<string | null>(null);
  const [next, setNext] = useState<NextView | null>(null);
  const [draw, setDraw] = useState<DrawView | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const syncFilterState = useCallback(
    (state: MapFilterState) => {
      setFilterState(state);
      latest.current.onFilterStateChange?.(state);
    },
    [],
  );

  /* ---------- the engine, mounted once ---------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container || engineRef.current) return;

    const instance = new DoorMapEngine({
      isManager: () => latest.current.isManager,
      me: latest.current.me,
      allowManualPosition: !!latest.current.onSetPositionHere,
      reknockDays: latest.current.reknockDays,
      onOpenProperty: (id) => latest.current.onOpenProperty(id),
      onAddHouseHere: (ll) => latest.current.onAddHouseHere(ll),
      onSetPositionHere: (ll) => latest.current.onSetPositionHere?.(ll),
      onToast: (message) => latest.current.onToast(message),
      onMapClick: () => latest.current.onMapClick?.(),
      onNote: (text) => setNote(text),
      onNext: (value) => {
        setNext(value);
        latest.current.onNextChange?.(value);
      },
      onDraw: (value) => setDraw(value),
      onTerritoryDrawn: (polygon, inside) => latest.current.onTerritoryDrawn(polygon, inside),
      onFilterState: (state) => syncFilterState(state),
    });

    instance.mount(container);
    engineRef.current = instance;
    setEngine(instance);

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => instance.invalidateSize());
    observer?.observe(container);
    const onResize = () => instance.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      instance.destroy();
      engineRef.current = null;
      setEngine(null);
    };
  }, [syncFilterState]);

  // The rep's doors and territories, and the view they open on.
  useEffect(() => {
    if (!engine) return;
    const data: DoorMapData = { properties, territories };
    engine.setData(data);
    engine.startView();
  }, [engine, properties, territories]);

  useEffect(() => {
    if (!engine) return;
    engine.setMyPos(myPos, accuracy);
  }, [engine, myPos, accuracy]);

  useEffect(() => {
    if (!engine) return;
    engine.setTrail(trail, showTrail);
  }, [engine, trail, showTrail]);

  /* ---------- imperative surface for the screen ---------- */

  useImperativeHandle(
    ref,
    (): DoorMapHandle => ({
      centerOnMe: () => engineRef.current?.centerOnMe(),
      showOnMap: (id) => engineRef.current?.showOnMap(id) ?? false,
      startRoute: () => engineRef.current?.startRoute() ?? { kind: 'no-position' },
      routeForInstaller: (installer) =>
        engineRef.current?.routeForInstaller(installer) ?? { kind: 'no-position' },
      setRouteInstaller: (installer) => {
        engineRef.current?.setRouteInstaller(installer);
        setRouteInstaller(installer);
      },
      hasRoute: () => engineRef.current?.hasRoute() ?? false,
      routeRemaining: () => engineRef.current?.routeRemaining() ?? 0,
      advanceRoute: (id) => engineRef.current?.advanceRoute(id),
      skipRouteStop: () => engineRef.current?.skipRouteStop(),
      endRoute: () => {
        engineRef.current?.endRoute();
        setRouteInstaller(null);
      },
      startDraw: () => engineRef.current?.startDraw(),
      undoDraw: () => engineRef.current?.undoDraw(),
      cancelDraw: () => engineRef.current?.cancelDraw(),
      finishDraw: () => engineRef.current?.finishDraw() ?? null,
      isDrawing: () => engineRef.current?.isDrawing() ?? false,
      invalidateSize: () => engineRef.current?.invalidateSize(),
      setTrail: (points, visible) => engineRef.current?.setTrail(points, visible),
      getFilterState: () => engineRef.current?.getFilterState() ?? DEFAULT_MAP_FILTER_STATE,
      isSchematic: () => engineRef.current?.isSchematic() ?? false,
    }),
    [],
  );

  /* ---------- chips ---------- */

  const applyFilter = useCallback(
    (patch: Partial<MapFilterState>) => {
      const instance = engineRef.current;
      if (!instance) return;
      instance.setFilterState(patch);
      syncFilterState(instance.getFilterState());
    },
    [syncFilterState],
  );

  const toggleBasemap = useCallback(() => {
    const instance = engineRef.current;
    if (!instance) return;
    instance.toggleBasemap();
    setBasemap(instance.getBasemap());
    setSchematic(instance.isSchematic());
    latest.current.onSchematicChange?.(instance.isSchematic());
  }, []);

  const chips = useMemo(
    () => (
      <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MAP_FILTERS.map((def) => (
          <button
            key={def.id}
            type="button"
            className={`${CHIP_BASE} ${filterState.filter === def.id ? CHIP_ON : CHIP_OFF}`}
            onClick={() => applyFilter({ filter: def.id })}
          >
            {def.label}
          </button>
        ))}
        <button
          type="button"
          className={`${CHIP_BASE} ${filterState.mine ? CHIP_ON : CHIP_OFF}`}
          onClick={() => applyFilter({ mine: !filterState.mine })}
        >
          My territory
        </button>
        <button
          type="button"
          className={`${CHIP_BASE} ${
            filterState.bankruptOnly ? CHIP_ON : 'border-destructive text-destructive'
          }`}
          onClick={() =>
            applyFilter({ bankruptOnly: !filterState.bankruptOnly, inBusinessOnly: false })
          }
        >
          ● Bankrupt installer
        </button>
        <button
          type="button"
          className={`${CHIP_BASE} ${filterState.inBusinessOnly ? CHIP_ON : CHIP_OFF}`}
          onClick={() =>
            applyFilter({ inBusinessOnly: !filterState.inBusinessOnly, bankruptOnly: false })
          }
        >
          In business
        </button>
        {routeInstaller !== null && (
          <button
            type="button"
            className={`${CHIP_BASE} ${CHIP_ON}`}
            title="Stop walking only this installer's houses"
            onClick={() => {
              engineRef.current?.setRouteInstaller(null);
              setRouteInstaller(null);
            }}
          >
            Route: {routeInstaller || 'all'}
          </button>
        )}
        <button
          type="button"
          className={`${CHIP_BASE} ${basemap === 'satellite' ? CHIP_ON : CHIP_OFF} ${
            schematic ? 'opacity-50' : ''
          }`}
          onClick={toggleBasemap}
        >
          <Satellite className="mr-1 inline h-3 w-3" />
          Satellite
        </button>
      </div>
    ),
    [
      applyFilter,
      basemap,
      filterState.bankruptOnly,
      filterState.filter,
      filterState.inBusinessOnly,
      filterState.mine,
      routeInstaller,
      schematic,
      toggleBasemap,
    ],
  );

  const nextMeta = next ? statusMeta(next.status) : null;

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ''}`}>
      <div ref={containerRef} className="absolute inset-0" aria-label="Territory map" />

      {/* filter chips */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[800] p-2">{chips}</div>

      {/* basemap note ("the street map did not load...") */}
      {note && (
        <div className="absolute inset-x-2 top-12 z-[800] rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow">
          {note}
        </div>
      )}

      {/* draw bar */}
      {draw && (
        <div className="absolute inset-x-2 bottom-32 z-[800] flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg">
          <span className="flex-1 text-xs">
            {draw.corners < 3
              ? `Tap the map to add corners (${draw.corners})`
              : `${draw.corners} corners · ${draw.inside} doors inside`}
          </span>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs"
            onClick={() => engineRef.current?.undoDraw()}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs"
            onClick={() => engineRef.current?.cancelDraw()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            disabled={draw.corners < 3}
            onClick={() => engineRef.current?.finishDraw()}
          >
            Finish
          </button>
        </div>
      )}

      {/* FABs */}
      <div className="absolute right-3 bottom-24 z-[800] flex flex-col gap-2.5">
        <button type="button" className={FAB_BASE} aria-label="Center on me" onClick={onLocate}>
          <Crosshair className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={FAB_BASE}
          aria-label="Plan a route"
          onClick={onRouteRequested}
        >
          <RouteIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={`${FAB_BASE} border-primary bg-primary text-primary-foreground`}
          aria-label="Add a house at my position"
          onClick={onAddAtMyPosition}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Knock next card */}
      {next && (
        <div className="absolute bottom-24 left-3 right-20 z-[800] flex items-center gap-2 rounded-lg border border-border border-l-4 border-l-primary bg-card/95 p-3 shadow-lg">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: nextMeta?.color ?? '#888888' }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{next.title}</div>
            <div className="truncate text-xs text-muted-foreground">{next.subtitle}</div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            onClick={() => onOpenProperty(next.id)}
          >
            Open
          </button>
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-2 text-xs text-muted-foreground"
            aria-label="Skip this house"
            title="Not this one: show the next house"
            onClick={() => engineRef.current?.skipNext()}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
});

export default DoorMap;
