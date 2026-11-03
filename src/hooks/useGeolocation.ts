/**
 * The rep's position while they canvass - a port of DoorBoss's GPS block
 * (`startGps`, `setMyPos`'s meta handling, `stopGps`, `requestWake`, `noFixView`, the
 * visibilitychange re-arm and the consent gate).
 *
 * DoorBoss's rules, kept exactly:
 * - `enableHighAccuracy`, a 3 s cached fix and a 15 s timeout.
 * - A fix worse than 150 m is thrown away; three in a row and it is accepted (a rep indoors).
 * - No fix in 16 s, or the browser has no geolocation, or the rep said no: `noFixView` - the
 *   screen keeps the last real fix and shows the doors rather than an empty block.
 * - The trail keeps a point every 8 m, capped at 2000 points, and is only ever shown on request.
 * - The screen wake lock is taken while tracking and released the moment tracking stops.
 * - The watch is re-armed when the tab comes back to the foreground.
 *
 * Tracking only runs while this app is open: a browser cannot track in the background, which is
 * a platform rule rather than a bug (true background tracking needs the native wrapper).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/lib/geo';

/** Where the rep is: on, asking, refused, or running without a fix. */
export type GeoStatus = 'idle' | 'prompt' | 'on' | 'denied' | 'unavailable' | 'off';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  at: number;
}

export interface UseGeolocationResult {
  position: LatLng | null;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  /** 'prompt' means the screen should ask; nothing is watched until the rep allows it. */
  status: GeoStatus;
  trail: LatLng[];
  /** The rep allowed location on this device (remembered across sessions). */
  consent: boolean;
  /** Milliseconds since the last real fix, or null if there has never been one. */
  fixAgeMs: number | null;
  /** True once the watch is live and the wake lock is held. */
  tracking: boolean;
  /** "Allow location" - remembers the choice and starts the watch. */
  allow: () => void;
  /** "Not now" - runs without GPS until the rep changes their mind. */
  decline: () => void;
  /** Stop watching and release the wake lock (the Tracking pill's pause). */
  stop: () => void;
  /** Start again after a stop, or re-arm after a failure. */
  restart: () => void;
}

export const GPS_CONSENT_KEY = 'dialsmart.d2d.gps.consent';

/** A fix worse than this is a cell-tower guess, not a position. */
export const GPS_BAD_ACCURACY_M = 150;

/** How many bad fixes in a row to accept before believing one anyway. */
export const GPS_BAD_FIX_LIMIT = 3;

/** How long to wait for a first fix before showing the doors instead. */
export const GPS_FIRST_FIX_TIMEOUT_MS = 16000;

/** A trail point is only kept when the rep has moved this far. */
export const GPS_TRAIL_MIN_MOVE_M = 8;

/** The trail is capped so a long day cannot grow the page forever. */
export const GPS_TRAIL_MAX_POINTS = 2000;

function readConsent(): boolean {
  try {
    return localStorage.getItem(GPS_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeConsent(): void {
  try {
    localStorage.setItem(GPS_CONSENT_KEY, '1');
  } catch {
    /* private mode: consent lasts for the session */
  }
}

function hasGeolocation(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/** Straight-line metres, for the 8 m trail filter only (the map uses `geo.haversine`). */
function quickDistance(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * 111_320;
  const dLng = (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function useGeolocation(): UseGeolocationResult {
  const [consent, setConsent] = useState<boolean>(() => readConsent());
  const [status, setStatus] = useState<GeoStatus>(() => (hasGeolocation() ? 'prompt' : 'unavailable'));
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [trail, setTrail] = useState<LatLng[]>([]);
  const [tracking, setTracking] = useState(false);

  const watchRef = useRef<number | null>(null);
  const failTimerRef = useRef<number | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const badFixesRef = useRef(0);
  const gotFixRef = useRef(false);
  /** Lets the event handlers stop touching state after the screen unmounts. */
  const aliveRef = useRef(true);

  const clearWatch = useCallback(() => {
    if (watchRef.current != null && hasGeolocation()) {
      try {
        navigator.geolocation.clearWatch(watchRef.current);
      } catch {
        /* the watch is already gone */
      }
    }
    watchRef.current = null;
    if (failTimerRef.current != null) window.clearTimeout(failTimerRef.current);
    failTimerRef.current = null;
  }, []);

  const releaseWake = useCallback(() => {
    try {
      void wakeRef.current?.release();
    } catch {
      /* already released */
    }
    wakeRef.current = null;
  }, []);

  const requestWake = useCallback(async () => {
    const wakeLock = typeof navigator === 'undefined' ? undefined : navigator.wakeLock;
    if (!wakeLock || wakeRef.current) return;
    try {
      const sentinel = await wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        wakeRef.current = null;
      });
      wakeRef.current = sentinel;
    } catch {
      // A denied wake lock is fine: the screen just sleeps like any other page.
      wakeRef.current = null;
    }
  }, []);

  /** DoorBoss `noFixView`: never leave the rep looking at an empty block. */
  const noFix = useCallback(
    (reason: 'denied' | 'unavailable' | 'off') => {
      if (gotFixRef.current) return; // a real fix already arrived; keep it
      setStatus(reason);
      setTracking(false);
      releaseWake();
    },
    [releaseWake],
  );

  const start = useCallback(() => {
    if (!hasGeolocation()) {
      noFix('unavailable');
      return;
    }
    clearWatch();
    gotFixRef.current = false;
    badFixesRef.current = 0;

    const onFail = (error: GeolocationPositionError | null) => {
      const denied = !!error && error.code === 1;
      noFix(denied ? 'denied' : 'unavailable');
    };

    try {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const c = pos.coords;
          // Ignore a couple of wild fixes (cell-tower triangulation) before believing one.
          if (c.accuracy > GPS_BAD_ACCURACY_M) {
            badFixesRef.current += 1;
            if (badFixesRef.current < GPS_BAD_FIX_LIMIT) return;
          }
          badFixesRef.current = 0;
          gotFixRef.current = true;
          if (!aliveRef.current) return;

          const next: GeoFix = {
            lat: c.latitude,
            lng: c.longitude,
            accuracy: c.accuracy,
            heading: c.heading == null || Number.isNaN(c.heading) ? null : c.heading,
            speed: c.speed == null || Number.isNaN(c.speed) ? null : c.speed,
            at: Date.now(),
          };
          setFix(next);
          setStatus('on');
          setTracking(true);

          const ll: LatLng = [next.lat, next.lng];
          setTrail((points) => {
            const last = points[points.length - 1];
            if (last && quickDistance(last, ll) <= GPS_TRAIL_MIN_MOVE_M) return points;
            const grown = [...points, ll];
            return grown.length > GPS_TRAIL_MAX_POINTS ? grown.slice(grown.length - GPS_TRAIL_MAX_POINTS) : grown;
          });
        },
        onFail,
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
      );

      // No fix in 16 s is a dead zone, not a slow phone.
      const mine = watchRef.current;
      failTimerRef.current = window.setTimeout(() => {
        if (!gotFixRef.current && watchRef.current === mine) onFail(null);
      }, GPS_FIRST_FIX_TIMEOUT_MS);
    } catch {
      onFail(null);
    }
    void requestWake();
  }, [clearWatch, noFix, requestWake]);

  const stop = useCallback(() => {
    clearWatch();
    releaseWake();
    setTracking(false);
    setStatus((current) => (current === 'prompt' || current === 'denied' || current === 'unavailable' ? current : 'off'));
  }, [clearWatch, releaseWake]);

  const allow = useCallback(() => {
    writeConsent();
    setConsent(true);
    setStatus('on');
    start();
  }, [start]);

  const decline = useCallback(() => {
    noFix('off');
  }, [noFix]);

  const restart = useCallback(() => {
    setStatus('on');
    start();
  }, [start]);

  // Start watching as soon as the rep has already allowed it on this device.
  useEffect(() => {
    aliveRef.current = true;
    if (consent && hasGeolocation()) start();
    return () => {
      aliveRef.current = false;
      clearWatch();
      releaseWake();
    };
  }, [consent, start, clearWatch, releaseWake]);

  // Coming back to the foreground re-arms the watch and the wake lock (the browser drops both).
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      if (consent) {
        if (watchRef.current == null) start();
        void requestWake();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [consent, start, requestWake]);

  // Fix age, so the Tracking pill can say "last seen 9 min ago" without a new fix arriving.
  const [fixAgeMs, setFixAgeMs] = useState<number | null>(null);
  useEffect(() => {
    if (!fix) {
      setFixAgeMs(null);
      return;
    }
    const update = () => setFixAgeMs(Date.now() - fix.at);
    update();
    const id = window.setInterval(update, 15000);
    return () => window.clearInterval(id);
  }, [fix]);

  const position: LatLng | null = fix ? [fix.lat, fix.lng] : null;

  return {
    position,
    accuracy: fix?.accuracy ?? 0,
    heading: fix?.heading ?? null,
    speed: fix?.speed ?? null,
    status,
    trail,
    consent,
    fixAgeMs,
    tracking,
    allow,
    decline,
    stop,
    restart,
  };
}
