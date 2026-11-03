import { describe, expect, it } from 'vitest';

import {
  boundsCenter,
  boundsContain,
  boundsOf,
  boundsToLeaflet,
  canvasPad,
  hasLatLng,
  haversine,
  houseNumber,
  latLngOf,
  padBounds,
  pathLength,
  pointInPoly,
} from '@/lib/geo';

describe('haversine', () => {
  it('is zero for the same point', () => {
    expect(haversine([39.7392, -104.9903], [39.7392, -104.9903])).toBe(0);
  });

  it('measures one degree of latitude at about 111 km', () => {
    expect(haversine([0, 0], [1, 0])).toBeGreaterThan(111_000);
    expect(haversine([0, 0], [1, 0])).toBeLessThan(111_400);
  });

  it('is symmetric', () => {
    const a: [number, number] = [39.7392, -104.9903];
    const b: [number, number] = [39.6975, -104.8262];
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
  });

  it('matches a known city pair', () => {
    // Denver to Boulder is about 39 km as the crow flies.
    const d = haversine([39.7392, -104.9903], [40.015, -105.2705]);
    expect(d / 1000).toBeGreaterThan(37);
    expect(d / 1000).toBeLessThan(41);
  });
});

describe('pointInPoly', () => {
  const square: [number, number][] = [
    [0, 0],
    [0, 2],
    [2, 2],
    [2, 0],
  ];

  it('accepts a point inside', () => {
    expect(pointInPoly([1, 1], square)).toBe(true);
  });

  it('rejects a point outside', () => {
    expect(pointInPoly([3, 3], square)).toBe(false);
    expect(pointInPoly([-1, 1], square)).toBe(false);
  });

  it('rejects a degenerate polygon', () => {
    expect(pointInPoly([0, 0], [])).toBe(false);
    expect(pointInPoly([0, 0], [[0, 0]])).toBe(false);
    expect(
      pointInPoly(
        [0, 0],
        [
          [0, 0],
          [1, 1],
        ],
      ),
    ).toBe(false);
  });

  it('handles a concave shape', () => {
    // An L shape with the notch cut out of the top-right.
    const l: [number, number][] = [
      [0, 0],
      [0, 3],
      [1, 3],
      [1, 1],
      [3, 1],
      [3, 0],
    ];
    expect(pointInPoly([0.5, 2], l)).toBe(true);
    expect(pointInPoly([2, 0.5], l)).toBe(true);
    expect(pointInPoly([2, 2], l)).toBe(false);
  });
});

describe('hasLatLng', () => {
  it('accepts a real pair', () => {
    expect(hasLatLng({ lat: 39.7, lng: -104.8 })).toBe(true);
  });

  it('rejects nulls, missing rows and non-finite values', () => {
    expect(hasLatLng(null)).toBe(false);
    expect(hasLatLng(undefined)).toBe(false);
    expect(hasLatLng({ lat: null, lng: -104.8 })).toBe(false);
    expect(hasLatLng({ lat: 39.7, lng: null })).toBe(false);
    expect(hasLatLng({ lat: Number.NaN, lng: -104.8 })).toBe(false);
    expect(hasLatLng({ lat: Number.POSITIVE_INFINITY, lng: 0 })).toBe(false);
  });

  it('rejects values a text column could sneak in', () => {
    expect(hasLatLng({ lat: '' as unknown as number, lng: 0 })).toBe(false);
    expect(hasLatLng({ lat: '39.7' as unknown as number, lng: -104.8 })).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(hasLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(hasLatLng({ lat: 0, lng: 181 })).toBe(false);
  });
});

describe('latLngOf', () => {
  it('returns a Leaflet-style tuple', () => {
    expect(latLngOf({ lat: 1, lng: 2 })).toEqual([1, 2]);
  });
});

describe('bounds', () => {
  const points: [number, number][] = [
    [1, 5],
    [-2, 9],
    [4, 3],
  ];

  it('is null with no points', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('finds the extremes', () => {
    expect(boundsOf(points)).toEqual({ south: -2, west: 3, north: 4, east: 9 });
  });

  it('contains the points it was built from', () => {
    const b = boundsOf(points);
    expect(b).not.toBeNull();
    for (const p of points) expect(boundsContain(b!, p)).toBe(true);
    expect(boundsContain(b!, [0, 0])).toBe(false);
  });

  it('pads by a fraction of its own size', () => {
    const b = padBounds({ south: 0, west: 0, north: 2, east: 2 }, 0.5);
    expect(b.south).toBe(-1);
    expect(b.north).toBe(3);
    expect(b.west).toBe(-1);
    expect(b.east).toBe(3);
  });

  it('gives a degenerate box a floor so a single door still zooms in', () => {
    const b = padBounds({ south: 1, west: 1, north: 1, east: 1 }, 0.08);
    expect(b.north - b.south).toBeGreaterThan(0);
    expect(b.east - b.west).toBeGreaterThan(0);
  });

  it('centres and converts to the Leaflet pair', () => {
    const b = { south: 0, west: 0, north: 2, east: 4 };
    expect(boundsCenter(b)).toEqual([1, 2]);
    expect(boundsToLeaflet(b)).toEqual([
      [0, 0],
      [2, 4],
    ]);
  });
});

describe('canvasPad', () => {
  it('widens the canvas on a phone', () => {
    expect(canvasPad(390, 760)).toBe(0.6);
  });

  it('stays inside the browser canvas limit on a big desktop', () => {
    const pad = canvasPad(2560, 1440);
    expect(pad).toBeGreaterThanOrEqual(0.1);
    expect(pad).toBeLessThanOrEqual(0.6);
  });

  it('falls back to phone dimensions when the viewport is unknown', () => {
    expect(canvasPad(0, 0)).toBe(0.6);
  });
});

describe('houseNumber', () => {
  it('reads the leading number', () => {
    expect(houseNumber('15420 E Jewell Ave')).toBe('15420');
  });

  it('returns empty for a street with no number', () => {
    expect(houseNumber('E Jewell Ave')).toBe('');
    expect(houseNumber('')).toBe('');
    expect(houseNumber(null)).toBe('');
    expect(houseNumber(undefined)).toBe('');
  });

  it('trims before reading', () => {
    expect(houseNumber('  42 Main St ')).toBe('42');
  });
});

describe('pathLength', () => {
  it('is zero with no stops', () => {
    expect(pathLength([0, 0], [])).toBe(0);
  });

  it('sums the legs from the start', () => {
    const start: [number, number] = [0, 0];
    const total = pathLength(start, [
      [1, 0],
      [2, 0],
    ]);
    expect(total).toBeCloseTo(haversine([0, 0], [1, 0]) * 2, 3);
  });
});
