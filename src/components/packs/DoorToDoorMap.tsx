/**
 * Door to Door pack - the canvassing map screen.
 *
 * The rep's map view: their doors on a Leaflet canvas, the chips that thin them down, the
 * Knock next card, the three FABs (locate, plan a route, add a house), territory drawing and
 * the GPS pill. A port of DoorBoss's `#view-map` (docs/wholesale/doorboss-app/index.prod.html,
 * v22.6); the drawing and routing decisions live in `d2dMap.ts`, the Leaflet work in
 * `d2dMapEngine.ts`, the GPS in `useGeolocation.ts`, and this file is the screen that ties
 * them to Dial Smart's own database (d2d_properties / d2d_territories / d2d_knocks).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useGeolocation } from '@/hooks/useGeolocation';
import DoorMap, { type DoorMapHandle } from '@/components/packs/DoorMap';
import KnockDetailSheet from '@/components/packs/KnockDetailSheet';
import {
  D2DPackNotInstalledError,
  insertProperty,
  insertTerritory,
  loadAllProperties,
  loadMyMembership,
  loadTerritories,
  resolveOrganizationId,
  type D2DProperty,
  type D2DTerritory,
} from '@/lib/d2dApi';
import type { InstallerChoice } from '@/lib/d2dMap';
import type { NextView } from '@/lib/d2dMapEngine';
import type { LatLng } from '@/lib/geo';

/** Metres, in the units a canvasser thinks in (DoorBoss `fmtDist`). */
const formatMetres = (metres: number): string => {
  if (!Number.isFinite(metres)) return '—';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
};

const TERRITORY_COLORS = ['#2b7fff', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#14b8a6'];

interface DraftHouse {
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const emptyHouse = (ll: LatLng | null): DraftHouse => ({
  lat: ll ? ll[0] : 0,
  lng: ll ? ll[1] : 0,
  address: '',
  city: '',
  state: 'CO',
  zip: '',
});

const DoorToDoorMap = () => {
  const { toast } = useToast();
  const mapRef = useRef<DoorMapHandle | null>(null);
  const geo = useGeolocation();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<D2DProperty[]>([]);
  const [territories, setTerritories] = useState<D2DTerritory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);

  const [next, setNext] = useState<NextView | null>(null);
  const [routeLeft, setRouteLeft] = useState<number | null>(null);
  const [showTrail, setShowTrail] = useState(false);

  const [selected, setSelected] = useState<D2DProperty | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [house, setHouse] = useState<DraftHouse | null>(null);
  const [savingHouse, setSavingHouse] = useState(false);

  const [choices, setChoices] = useState<InstallerChoice[] | null>(null);

  const [drawn, setDrawn] = useState<{ polygon: LatLng[]; inside: number } | null>(null);
  const [territoryName, setTerritoryName] = useState('');
  const [territoryColor, setTerritoryColor] = useState(TERRITORY_COLORS[0]);
  const [savingTerritory, setSavingTerritory] = useState(false);

  const [gpsAsk, setGpsAsk] = useState(false);
  const [gpsInfo, setGpsInfo] = useState(false);
  const askedRef = useRef(false);

  /* ---------- data ---------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotInstalled(false);
    try {
      let org = organizationId;
      if (!org) {
        org = await resolveOrganizationId();
        setOrganizationId(org);
      }

      const membership = await loadMyMembership();
      setUserId(membership?.userId ?? null);
      setRole(membership?.role ?? null);

      if (!org) {
        setRows([]);
        setTerritories([]);
        setError('No company is linked to your login yet, so there is no map to show.');
        return;
      }

      const [properties, territoryRows] = await Promise.all([
        loadAllProperties(org),
        loadTerritories(org).catch(() => [] as D2DTerritory[]),
      ]);
      setRows(properties);
      setTerritories(territoryRows);
    } catch (loadError) {
      if (loadError instanceof D2DPackNotInstalledError) {
        setNotInstalled(true);
        setRows([]);
        setTerritories([]);
      } else {
        setError(loadError instanceof Error ? loadError.message : 'The map could not load.');
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- GPS ---------- */

  useEffect(() => {
    if (askedRef.current) return;
    if (geo.status !== 'prompt' || geo.consent) return;
    askedRef.current = true;
    setGpsAsk(true);
  }, [geo.consent, geo.status]);

  const gpsLabel = useMemo(() => {
    if (!geo.consent) return 'GPS off';
    if (geo.status === 'denied') return 'GPS denied';
    if (geo.status === 'unavailable') return 'No GPS';
    if (!geo.position) return 'No fix';
    if (geo.fixAgeMs != null && geo.fixAgeMs > 60000) {
      return `Stale ${formatDistanceToNow(new Date(Date.now() - geo.fixAgeMs), { addSuffix: false })}`;
    }
    return geo.accuracy ? `Tracking ±${Math.round(geo.accuracy)} m` : 'Tracking';
  }, [geo.accuracy, geo.consent, geo.fixAgeMs, geo.position, geo.status]);

  const gpsTone = !geo.consent || !geo.position ? 'muted' : geo.fixAgeMs && geo.fixAgeMs > 60000 ? 'warn' : 'ok';

  /* ---------- route ---------- */

  const syncRoute = useCallback(() => {
    const handle = mapRef.current;
    if (!handle || !handle.hasRoute()) {
      setRouteLeft(null);
      return;
    }
    setRouteLeft(handle.routeRemaining());
  }, []);

  useEffect(() => {
    syncRoute();
  }, [next, syncRoute]);

  const onRouteRequested = useCallback(() => {
    const handle = mapRef.current;
    if (!handle) return;
    const result = handle.startRoute();
    if (result.kind === 'choose') {
      setChoices(result.choices);
      return;
    }
    if (result.kind === 'started') {
      setRouteLeft(result.doors);
      toast({
        title: `${result.doors} doors on your route`,
        description: `${formatMetres(result.distanceM)} of walking${result.due ? `, ${result.due} follow-up${result.due === 1 ? '' : 's'} due first` : ''}.`,
      });
      return;
    }
    if (result.kind === 'empty') {
      toast({ title: 'Nothing to walk', description: 'No doors match the filters you have on.' });
      return;
    }
    toast({
      title: 'No position yet',
      description: 'Turn on location so the route can start from where you are standing.',
    });
    setGpsAsk(true);
  }, [toast]);

  const pickInstaller = useCallback(
    (installer: string | null) => {
      const handle = mapRef.current;
      setChoices(null);
      if (!handle) return;
      const result = handle.routeForInstaller(installer);
      if (result.kind === 'started') {
        setRouteLeft(result.doors);
        toast({
          title: `${result.doors} doors on your route`,
          description: `${formatMetres(result.distanceM)} of walking.`,
        });
        return;
      }
      toast({ title: 'Nothing to walk', description: 'No doors match that installer.' });
    },
    [toast],
  );

  /* ---------- house + territory writes ---------- */

  const saveHouse = useCallback(async () => {
    if (!house || !organizationId) return;
    if (!house.address.trim()) {
      toast({ title: 'Address needed', description: 'Give the house a street address first.' });
      return;
    }
    setSavingHouse(true);
    try {
      const created = await insertProperty({
        organization_id: organizationId,
        address: house.address.trim(),
        city: house.city.trim() || null,
        state: house.state.trim() || null,
        zip: house.zip.trim() || null,
        lat: house.lat || null,
        lng: house.lng || null,
        source: 'map',
      });
      setRows((current) => [created, ...current]);
      setHouse(null);
      toast({ title: 'House added', description: created.address });
    } catch (saveError) {
      toast({
        title: 'Could not add the house',
        description: saveError instanceof Error ? saveError.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setSavingHouse(false);
    }
  }, [house, organizationId, toast]);

  const saveTerritory = useCallback(async () => {
    if (!drawn || !organizationId) return;
    if (!territoryName.trim()) {
      toast({ title: 'Name needed', description: 'Give the territory a name the team will know.' });
      return;
    }
    setSavingTerritory(true);
    try {
      const created = await insertTerritory({
        organization_id: organizationId,
        name: territoryName.trim(),
        color: territoryColor,
        polygon: drawn.polygon.map(([lat, lng]) => [lat, lng]),
        assigned_user_ids: userId ? [userId] : [],
      });
      setTerritories((current) => [...current, created]);
      setDrawn(null);
      setTerritoryName('');
      toast({
        title: 'Territory saved',
        description: `${created.name} · ${drawn.inside} door${drawn.inside === 1 ? '' : 's'} inside.`,
      });
    } catch (saveError) {
      toast({
        title: 'Could not save the territory',
        description: saveError instanceof Error ? saveError.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setSavingTerritory(false);
    }
  }, [drawn, organizationId, territoryColor, territoryName, toast, userId]);

  /* ---------- open a door ---------- */

  const openProperty = useCallback(
    (propertyId: string) => {
      const row = rows.find((r) => r.id === propertyId);
      if (!row) {
        toast({ title: 'That door is not on the map', description: 'Reload the map and try again.' });
        return;
      }
      setSelected(row);
      setSheetOpen(true);
    },
    [rows, toast],
  );

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  if (notInstalled) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" /> Door to Door is not installed yet
        </div>
        <p className="text-muted-foreground">
          The map needs the d2d tables. Apply
          <code className="mx-1 rounded bg-muted px-1">supabase/migrations/20261102234500_door_to_door_core.sql</code>
          and reload.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const pillClass =
    gpsTone === 'ok'
      ? 'border-emerald-500/40 text-emerald-600'
      : gpsTone === 'warn'
        ? 'border-amber-500/40 text-amber-600'
        : 'border-border text-muted-foreground';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          {rows.length} door{rows.length === 1 ? '' : 's'} on the map
        </h2>
        {routeLeft != null && (
          <Badge variant="secondary" className="gap-1">
            Route · {routeLeft} left
            <button
              type="button"
              className="ml-1 text-xs underline"
              onClick={() => {
                mapRef.current?.endRoute();
                setRouteLeft(null);
                toast({ title: 'Route ended' });
              }}
            >
              end
            </button>
          </Badge>
        )}
        {geo.consent && geo.trail.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowTrail((v) => !v)}>
            {showTrail ? 'Hide trail' : `Show trail (${geo.trail.length})`}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setChoices(null);
              mapRef.current?.startDraw();
            }}
          >
            Draw a territory
          </Button>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${pillClass}`}
            title="Location tracking"
            onClick={() => setGpsInfo(true)}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {gpsLabel}
          </button>
        </div>
      </div>

      <div className="relative h-[calc(100dvh-9.5rem)] min-h-[420px] overflow-hidden rounded-xl border">
        <DoorMap
          ref={mapRef}
          properties={rows}
          territories={territories}
          me={userId ? { id: userId } : null}
          isManager={role === 'owner' || role === 'admin'}
          myPos={geo.position}
          accuracy={geo.accuracy}
          trail={geo.trail}
          showTrail={showTrail}
          onOpenProperty={openProperty}
          onMapClick={() => setSheetOpen(false)}
          onAddHouseHere={(ll) => setHouse(emptyHouse(ll))}
          onSetPositionHere={(ll) => {
            toast({ title: 'Position set', description: `${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}` });
          }}
          onTerritoryDrawn={(polygon, inside) => {
            setDrawn({ polygon, inside });
            setTerritoryName('');
            setTerritoryColor(TERRITORY_COLORS[territories.length % TERRITORY_COLORS.length]);
          }}
          onToast={(message) => toast({ title: message })}
          onNextChange={(value) => {
            setNext(value);
            syncRoute();
          }}
          onLocate={() => {
            if (!geo.consent) {
              setGpsAsk(true);
              return;
            }
            if (!geo.position) {
              toast({ title: 'No fix yet', description: 'Stand still for a moment and try again.' });
              return;
            }
            mapRef.current?.centerOnMe();
          }}
          onRouteRequested={onRouteRequested}
          onAddAtMyPosition={() => {
            if (!geo.position) {
              toast({
                title: 'No position yet',
                description: 'Turn on location, or long-press the map to add a house there.',
              });
              return;
            }
            setHouse(emptyHouse(geo.position));
          }}
        />
      </div>

      <KnockDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        property={selected}
        organizationId={organizationId}
        userId={userId}
        onLogged={() => void load()}
      />

      {/* add a house */}
      <Dialog open={!!house} onOpenChange={(open) => !open && setHouse(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a house here</DialogTitle>
            <DialogDescription>
              {house ? `${house.lat.toFixed(5)}, ${house.lng.toFixed(5)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="d2d-address">Street address</Label>
              <Input
                id="d2d-address"
                value={house?.address ?? ''}
                onChange={(e) => setHouse((h) => (h ? { ...h, address: e.target.value } : h))}
                placeholder="1428 Elm St"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="d2d-city">City</Label>
                <Input
                  id="d2d-city"
                  value={house?.city ?? ''}
                  onChange={(e) => setHouse((h) => (h ? { ...h, city: e.target.value } : h))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d2d-state">State</Label>
                <Input
                  id="d2d-state"
                  value={house?.state ?? ''}
                  onChange={(e) => setHouse((h) => (h ? { ...h, state: e.target.value } : h))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d2d-zip">ZIP</Label>
                <Input
                  id="d2d-zip"
                  value={house?.zip ?? ''}
                  onChange={(e) => setHouse((h) => (h ? { ...h, zip: e.target.value } : h))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHouse(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveHouse()} disabled={savingHouse}>
              {savingHouse && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add house
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* installer chooser */}
      <Dialog open={!!choices} onOpenChange={(open) => !open && setChoices(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Whose doors are you walking?</DialogTitle>
            <DialogDescription>
              Pick an installer to keep the route on one story, or walk everything.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(choices ?? []).map((choice) => (
              <Button
                key={choice.installer}
                variant="outline"
                className="w-full justify-between"
                onClick={() => pickInstaller(choice.installer)}
              >
                <span>{choice.installer}</span>
                <span className="text-muted-foreground">
                  {choice.count} door{choice.count === 1 ? '' : 's'}
                </span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChoices(null)}>
              Cancel
            </Button>
            <Button onClick={() => pickInstaller(null)}>
              <Plus className="mr-2 h-4 w-4" /> Walk everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* name the territory */}
      <Dialog open={!!drawn} onOpenChange={(open) => !open && setDrawn(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name this territory</DialogTitle>
            <DialogDescription>
              {drawn
                ? `${drawn.polygon.length} corners · ${drawn.inside} door${drawn.inside === 1 ? '' : 's'} inside. The doors are not moved, the shape just groups them.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="d2d-territory-name">Name</Label>
              <Input
                id="d2d-territory-name"
                value={territoryName}
                onChange={(e) => setTerritoryName(e.target.value)}
                placeholder="Aurora North"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex gap-2">
                {TERRITORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colour ${color}`}
                    className={`h-7 w-7 rounded-full border-2 ${
                      territoryColor === color ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ background: color }}
                    onClick={() => setTerritoryColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDrawn(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveTerritory()} disabled={savingTerritory}>
              {savingTerritory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save territory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* location consent */}
      <Dialog open={gpsAsk} onOpenChange={setGpsAsk}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share your location while you work</DialogTitle>
            <DialogDescription>
              The map uses your phone's GPS to put you on the map, pick the next door, and show the
              team where you are while this app is open.
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            It stops the moment you close the app or lock the screen. Nothing is tracked outside work
            hours or outside this app.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setGpsAsk(false);
                geo.decline();
                toast({ title: 'Running without GPS' });
              }}
            >
              Not now
            </Button>
            <Button
              onClick={() => {
                setGpsAsk(false);
                geo.allow();
              }}
            >
              Allow location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* location detail */}
      <Dialog open={gpsInfo} onOpenChange={setGpsInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Location</DialogTitle>
            <DialogDescription>{gpsLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accuracy</span>
              <span>{geo.accuracy ? `${Math.round(geo.accuracy)} m` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last fix</span>
              <span>
                {geo.fixAgeMs != null
                  ? `${Math.round(geo.fixAgeMs / 1000)} s ago`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trail today</span>
              <span>{geo.trail.length} points</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tracking runs only while this app is open. Keep the screen on and the browser will keep
            the fix fresh.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGpsInfo(false)}>
              Close
            </Button>
            {geo.consent ? (
              <Button
                onClick={() => {
                  if (geo.tracking) {
                    geo.stop();
                  } else {
                    geo.restart();
                  }
                }}
              >
                {geo.tracking ? 'Pause tracking' : 'Resume'}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setGpsInfo(false);
                  geo.allow();
                }}
              >
                Turn on
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoorToDoorMap;
