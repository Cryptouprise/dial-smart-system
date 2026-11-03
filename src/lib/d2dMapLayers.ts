/**
 * The two Leaflet canvas layers from DoorBoss, ported straight across.
 *
 * - `SchematicLayer` is the fallback basemap: a grid of blocks drawn on a canvas tile.
 *   DoorBoss shows it when no real tile has ever loaded (weak signal, ad-blocker, an Esri 429).
 * - `StreetLayer` draws the streets, territory blocks, house footprints and house numbers
 *   from the knock list itself. DoorBoss keeps it off in production; it exists so the map is
 *   still usable when real tiles are blocked.
 *
 * Both read the same CSS custom properties DoorBoss uses (`--map-bg`, `--map-line`,
 * `--map-block`, `--muted`, `--surface`) and fall back to the same colours when a var is missing.
 */
import L from 'leaflet';

import { canvasPad as viewportCanvasPad } from '@/lib/geo';
import { territoryPolygon, type MappableProperty, type MappableTerritory } from '@/lib/d2dMap';

/* ---------- palette ---------- */

export const MAP_BG = '#e6eaee';
export const MAP_LINE = '#cdd5dc';
export const MAP_BLOCK = '#f3f5f7';
export const MAP_TEXT = '#5a6773';
export const MAP_SURFACE = '#ffffff';

export interface MapPalette {
  bg: string;
  line: string;
  block: string;
  text: string;
  surface: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** The five colours both canvas layers draw with, resolved once per redraw. */
export function mapPalette(): MapPalette {
  return {
    bg: cssVar('--map-bg', MAP_BG),
    line: cssVar('--map-line', MAP_LINE),
    block: cssVar('--map-block', MAP_BLOCK),
    text: cssVar('--muted', MAP_TEXT),
    surface: cssVar('--surface', MAP_SURFACE),
  };
}

/* ---------- canvas padding ---------- */

/**
 * How far past the screen the pin canvas reaches, for the window we are in.
 * The formula lives in geo.ts (`canvasPad(width, height)`) so the map screen, the engine and
 * this module cannot drift apart; DoorBoss's default 10% left houses blank mid-drag (measured:
 * 237 of 424 pins gone after a 380 px drag), so it reaches 0.6 while staying under the browser's
 * canvas size limit (Leaflet draws at 2x on retina screens; over the limit nothing is drawn).
 */
export function canvasPad(
  winW = typeof window === 'undefined' ? 390 : window.innerWidth || 390,
  winH = typeof window === 'undefined' ? 760 : window.innerHeight || 760,
): number {
  return viewportCanvasPad(winW, winH);
}

/* ---------- the fallback grid ---------- */

/**
 * The schematic grid. One canvas tile: a background, blocks inset inside each cell, and a
 * grid of lines. Cell size and line weight step with the zoom so streets stay readable.
 */
export class SchematicLayer extends L.GridLayer {
  createTile(coords: L.Coords): HTMLCanvasElement {
    const tile = document.createElement('canvas');
    const size = this.getTileSize();
    tile.width = size.x;
    tile.height = size.y;

    const ctx = tile.getContext('2d');
    if (!ctx) return tile;

    const pal = mapPalette();
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, size.x, size.y);

    const z = coords.z;
    const step = z >= 18 ? 128 : z >= 17 ? 64 : z >= 16 ? 32 : z >= 15 ? 16 : 8;

    ctx.fillStyle = pal.block;
    for (let x = 0; x < size.x; x += step) {
      for (let y = 0; y < size.y; y += step) {
        const inset = Math.max(2, Math.round(step * 0.14));
        ctx.fillRect(x + inset, y + inset, step - inset * 2, step - inset * 2);
      }
    }

    ctx.strokeStyle = pal.line;
    ctx.lineWidth = z >= 17 ? 3 : z >= 15 ? 2 : 1;
    for (let x = 0; x <= size.x; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, size.y);
      ctx.stroke();
    }
    for (let y = 0; y <= size.y; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size.x, y + 0.5);
      ctx.stroke();
    }
    return tile;
  }
}

/* ---------- streets and houses drawn from the list ---------- */

export interface StreetLayerData {
  properties: MappableProperty[];
  territories: MappableTerritory[];
}

export interface StreetLayerOptions extends L.LayerOptions {
  /** Called on every redraw so the layer always draws the current list. */
  data: () => StreetLayerData;
}

interface Street {
  name: string;
  lat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Streets and house footprints drawn from the knock list. Only shown when real tiles are
 * blocked: it is a last resort so a rep in a dead zone still sees the shape of the block.
 */
export class StreetLayer extends L.Layer {
  declare options: StreetLayerOptions;

  private canvas: HTMLCanvasElement | null = null;
  private host: L.Map | null = null;
  private cache: Street[] | null = null;

  constructor(options: StreetLayerOptions) {
    super(options);
  }

  onAdd(map: L.Map): this {
    this.host = map;
    const canvas = L.DomUtil.create('canvas', 'leaflet-layer');
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '50';
    this.canvas = canvas;
    map.getPanes().overlayPane.appendChild(canvas);
    map.on('moveend zoomend resize', this.redraw, this);
    map.on('zoomstart', this.hide, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    if (this.canvas) L.DomUtil.remove(this.canvas);
    this.canvas = null;
    map.off('moveend zoomend resize', this.redraw, this);
    map.off('zoomstart', this.hide, this);
    this.host = null;
    return this;
  }

  /** Drop the cached street list and repaint. Call after the list changes. */
  invalidate(): void {
    this.cache = null;
    if (this.host) this.redraw();
  }

  private hide = (): void => {
    if (this.canvas) this.canvas.style.visibility = 'hidden';
  };

  /** One line per street name per territory, with at least three houses on it. */
  private streets(): Street[] {
    if (this.cache) return this.cache;

    const groups: Record<string, { name: string; pts: MappableProperty[] }> = {};
    for (const p of this.options.data().properties) {
      if (p.lat == null || p.lng == null) continue;
      const name = String(p.address || '').replace(/^\d+\s*/, '');
      const key = `${name}|${p.territory_id ?? ''}`;
      groups[key] ||= { name, pts: [] };
      groups[key].pts.push(p);
    }

    const out: Street[] = [];
    for (const key of Object.keys(groups)) {
      const s = groups[key];
      if (s.pts.length < 3) continue;
      const lat = s.pts.reduce((a, p) => a + (p.lat as number), 0) / s.pts.length;
      const lngs = s.pts.map((p) => p.lng as number);
      out.push({
        name: s.name,
        lat,
        minLng: Math.min(...lngs) - 0.0006,
        maxLng: Math.max(...lngs) + 0.0006,
      });
    }
    this.cache = out;
    return out;
  }

  private redraw = (): void => {
    const map = this.host;
    const canvas = this.canvas;
    if (!map || !canvas) return;

    const size = map.getSize();
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    canvas.style.visibility = 'visible';
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    const pal = mapPalette();
    const z = map.getZoom();
    const bounds = map.getBounds().pad(0.2);
    const toPt = (ll: L.LatLngExpression) => map.latLngToContainerPoint(ll);
    const { properties, territories } = this.options.data();

    // territory blocks
    for (const t of territories) {
      const ring = territoryPolygon(t);
      if (ring.length < 3) continue;
      ctx.beginPath();
      ring.forEach((ll, i) => {
        const q = toPt(ll as L.LatLngExpression);
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = pal.block;
      ctx.fill();
    }

    // streets, east to west
    const roadW = z >= 18 ? 18 : z >= 17 ? 12 : z >= 16 ? 7 : z >= 15 ? 4 : 2;
    ctx.lineCap = 'round';
    for (const s of this.streets()) {
      if (s.lat < bounds.getSouth() || s.lat > bounds.getNorth()) continue;
      const a = toPt([s.lat, s.minLng]);
      const e = toPt([s.lat, s.maxLng]);
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = roadW + 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.strokeStyle = pal.bg;
      ctx.lineWidth = roadW;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      if (z >= 16) {
        ctx.fillStyle = pal.text;
        ctx.font = `600 ${z >= 18 ? 12 : 11}px Barlow, system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        const x0 = Math.max(a.x, 8) + 6;
        if (x0 < e.x - 60) ctx.fillText(s.name, x0, a.y);
      }
    }

    // cross streets down the territory edges, north to south
    for (const t of territories) {
      const ring = territoryPolygon(t);
      if (ring.length < 3) continue;
      const lngs = ring.map((p) => p[1]);
      const lats = ring.map((p) => p[0]);
      for (const lng of [Math.min(...lngs), Math.max(...lngs)]) {
        const a = toPt([Math.min(...lats), lng]);
        const e = toPt([Math.max(...lats), lng]);
        ctx.strokeStyle = pal.line;
        ctx.lineWidth = roadW + 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        ctx.strokeStyle = pal.bg;
        ctx.lineWidth = roadW;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
    }

    // house footprints, plus the house number at street level
    if (z >= 16) {
      const w = z >= 18 ? 22 : z >= 17 ? 12 : 7;
      const h = Math.round(w * 0.8);
      ctx.fillStyle = pal.surface;
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 1;
      for (const p of properties) {
        if (p.lat == null || p.lng == null) continue;
        if (!bounds.contains([p.lat, p.lng])) continue;
        const q = toPt([p.lat, p.lng]);
        ctx.beginPath();
        ctx.rect(q.x - w / 2, q.y - h / 2, w, h);
        ctx.fill();
        ctx.stroke();
      }
      if (z >= 18) {
        ctx.fillStyle = pal.text;
        ctx.font = '500 9px Barlow, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const p of properties) {
          if (p.lat == null || p.lng == null) continue;
          if (!bounds.contains([p.lat, p.lng])) continue;
          const q = toPt([p.lat, p.lng]);
          ctx.fillText(String(p.address || '').split(' ')[0], q.x, q.y + h / 2 + 10);
        }
        ctx.textAlign = 'start';
      }
    }
  };
}
