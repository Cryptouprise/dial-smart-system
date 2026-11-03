/**
 * Door to Door pack - pure geometry.
 *
 * A direct port of the geo helpers in the DoorBoss map (docs/wholesale/doorboss-app/index.prod.html):
 * haversine, point-in-polygon, the canvas padding rule and plain lat/lng bounds. No Leaflet, no
 * Supabase, no DOM - so the map screen, the route planner and the tests all share one implementation.
 */

export type LatLng = [number, number];

export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

const EARTH_RADIUS_M = 6371000;

/** Metres between two [lat, lng] points. Ported from DoorBoss `haversine`. */
export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Total walking distance of an ordered list of stops, starting from `start`. */
export function pathLength(start: LatLng, stops: LatLng[]): number {
  let total = 0;
  let prev = start;
  for (const stop of stops) {
    total += haversine(prev, stop);
    prev = stop;
  }
  return total;
}

/** Is `pt` inside `poly`? Ray casting, same edge rule as DoorBoss `pointInPoly`. */
export function pointInPoly(pt: LatLng, poly: LatLng[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0];
    const xi = poly[i][1];
    const yj = poly[j][0];
    const xj = poly[j][1];
    const intersect = yi > pt[0] !== yj > pt[0] && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** A row that can be put on a map. DoorBoss `hasLL`: a house with no real position is never a pin. */
export function hasLatLng(p: { lat: number | null; lng: number | null } | null | undefined): boolean {
  if (!p) return false;
  const { lat, lng } = p;
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Narrow a row to the form the geometry helpers need. */
export function latLngOf(p: { lat: number | null; lng: number | null }): LatLng {
  return [p.lat as number, p.lng as number];
}

export function boundsOf(points: LatLng[]): GeoBounds | null {
  if (!points.length) return null;
  let south = points[0][0];
  let north = points[0][0];
  let west = points[0][1];
  let east = points[0][1];
  for (const [lat, lng] of points) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  return { south, west, north, east };
}

/** Grow a box by a fraction of its own size, matching Leaflet's `pad(0.08)`. */
export function padBounds(b: GeoBounds, factor: number): GeoBounds {
  const dLat = (b.north - b.south) * factor || 0.0005;
  const dLng = (b.east - b.west) * factor || 0.0005;
  return {
    south: b.south - dLat,
    north: b.north + dLat,
    west: b.west - dLng,
    east: b.east + dLng,
  };
}

export function boundsContain(b: GeoBounds, ll: LatLng): boolean {
  return ll[0] >= b.south && ll[0] <= b.north && ll[1] >= b.west && ll[1] <= b.east;
}

export function boundsCenter(b: GeoBounds): LatLng {
  return [(b.south + b.north) / 2, (b.west + b.east) / 2];
}

/** The [south-west, north-east] pair Leaflet wants for `latLngBounds`. */
export function boundsToLeaflet(b: GeoBounds): [LatLng, LatLng] {
  return [
    [b.south, b.west],
    [b.north, b.east],
  ];
}

/**
 * How far past the viewport the pin canvas reaches. Leaflet's default (10%) left a rep's houses blank
 * mid-drag, so DoorBoss widened it to cover the pins it keeps (renderPins pad 0.6) while staying under
 * the browser canvas size limit - a retina canvas over the limit draws nothing at all.
 */
export function canvasPad(viewportWidth: number, viewportHeight: number): number {
  const w = Math.max(viewportWidth || 390, 320);
  const h = Math.max(viewportHeight || 760, 320);
  const raw = Math.floor(((Math.sqrt(14e6 / (4 * w * h)) - 1) / 2) * 100) / 100;
  return Math.max(0.1, Math.min(0.6, raw));
}

/** The house number at the front of a street address ("15420 E Jewell Ave" -> "15420"). */
export function houseNumber(address: string | null | undefined): string {
  const first = String(address ?? '')
    .trim()
    .split(/\s+/)[0];
  return /^\d/.test(first) ? first : '';
}
