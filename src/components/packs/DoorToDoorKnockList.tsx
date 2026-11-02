
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, DoorOpen, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  D2D_INSTALLER_STATUS_LABELS,
  D2D_STATUSES,
  D2D_TIER_LABELS,
  formatPercent,
  isActionableNow,
  safeRate,
  statusMeta,
  summarizeKnockList,
  type D2DStatus,
} from '@/lib/doorToDoor';
import {
  D2DPackNotInstalledError,
  insertProperty,
  loadProperties,
  loadTerritories,
  resolveOrganizationId,
  type D2DProperty,
  type D2DTerritory,
} from '@/lib/d2dApi';
import KnockDetailSheet from '@/components/packs/KnockDetailSheet';

type StatusFilter = 'all' | 'action' | D2DStatus;

const ALL = 'all';

const StatTile = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <div className="rounded-lg border bg-card/60 p-3">
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-2xl font-semibold tabular-nums">{value}</div>
    {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
  </div>
);

/**
 * Door to Door pack - the knock list.
 *
 * The list a canvasser works from: every door for the company, its status, and one tap
 * to log what happened. Backed by d2d_properties / d2d_knocks in Dial Smart's own
 * database (see supabase/migrations/20261102234500_door_to_door_core.sql).
 */
const DoorToDoorKnockList = () => {
  const { toast } = useToast();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<D2DProperty[]>([]);
  const [territories, setTerritories] = useState<D2DTerritory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [territoryFilter, setTerritoryFilter] = useState<string>(ALL);

  const [selected, setSelected] = useState<D2DProperty | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    address: '',
    city: '',
    state: 'CO',
    zip: '',
    owner_name: '',
    owner_phone: '',
    installer_status: 'unknown',
    tier: 'none',
  });

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

      const { data: userData } = await (await import('@/integrations/supabase/client')).supabase.auth.getUser();
      setUserId(userData?.user?.id ?? null);

      if (!org) {
        setRows([]);
        setTerritories([]);
        setError('No company is linked to your login yet, so there is no knock list to show.');
        return;
      }

      const [properties, territoryRows] = await Promise.all([
        loadProperties(org),
        loadTerritories(org).catch(() => [] as D2DTerritory[]),
      ]);
      setRows(properties);
      setTerritories(territoryRows);
    } catch (loadError) {
      if (loadError instanceof D2DPackNotInstalledError) {
        setNotInstalled(true);
        setRows([]);
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Could not load the knock list.');
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
    // Intentionally once on mount: `load` re-resolves the company when it is missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'action') {
        if (!isActionableNow(row)) return false;
      } else if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }
      if (territoryFilter !== ALL && row.territory_id !== territoryFilter) return false;
      if (!needle) return true;
      const haystack = [row.address, row.city, row.zip, row.owner_name, row.owner_phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, search, statusFilter, territoryFilter]);

  const summary = useMemo(() => summarizeKnockList(rows), [rows]);

  const addDoor = async () => {
    if (!organizationId) return;
    if (!draft.address.trim()) {
      toast({ title: 'Address is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await insertProperty({
        organization_id: organizationId,
        address: draft.address.trim(),
        city: draft.city.trim() || null,
        state: draft.state.trim() || null,
        zip: draft.zip.trim() || null,
        owner_name: draft.owner_name.trim() || null,
        owner_phone: draft.owner_phone.trim() || null,
        installer_status: draft.installer_status,
        tier: draft.tier,
        source: 'Rep added',
      });
      toast({ title: 'Door added', description: draft.address.trim() });
      setAddOpen(false);
      setDraft({
        address: '',
        city: '',
        state: 'CO',
        zip: '',
        owner_name: '',
        owner_phone: '',
        installer_status: 'unknown',
        tier: 'none',
      });
      await load();
    } catch (addError) {
      toast({
        title: 'Could not add the door',
        description:
          addError instanceof Error
            ? addError.message.includes('duplicate')
              ? 'That address and ZIP is already on the list.'
              : addError.message
            : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && rows.length === 0 && !notInstalled && !error) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (notInstalled) {
    return (
      <Card className="bg-card/80">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Knock list needs its database tables</CardTitle>
          </div>
          <CardDescription>
            The Door to Door pack is enabled, but its tables are not in this database yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Apply this migration, then reload:</p>
          <code className="block rounded bg-muted px-2 py-1 text-xs">
            supabase/migrations/20261102234500_door_to_door_core.sql
          </code>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Check again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <DoorOpen className="h-5 w-5 text-primary" /> Knock list
          </h2>
          <p className="text-sm text-muted-foreground">
            Every door this company owns, and what happened at it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add door
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Doors" value={summary.doors} />
        <StatTile label="Knocked" value={summary.knocked} hint={`${summary.remaining} left`} />
        <StatTile
          label="Contacts"
          value={summary.contacts}
          hint={`${formatPercent(safeRate(summary.contacts, summary.knocked || summary.doors))} of knocks`}
        />
        <StatTile label="Callbacks" value={summary.callbacks} />
        <StatTile label="Appointments" value={summary.appointments} />
        <StatTile label="Signed" value={summary.signed} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search address, owner or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="action">Work these next</SelectItem>
            {D2D_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {statusMeta(status).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {territories.length > 0 && (
          <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All territories</SelectItem>
              {territories.map((territory) => (
                <SelectItem key={territory.id} value={territory.id}>
                  {territory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {!error && rows.length === 0 && (
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle className="text-lg">No doors yet</CardTitle>
            <CardDescription>
              Add a door by hand to try it, or bring your list in. Importing a CSV lands next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add the first door
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && rows.length > 0 && (
        <Card className="bg-card/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Address</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Installer</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Last knock</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const meta = statusMeta(row.status);
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                        onClick={() => {
                          setSelected(row);
                          setSheetOpen(true);
                        }}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.address}</div>
                          <div className="text-xs text-muted-foreground">
                            {[row.city, row.state, row.zip].filter(Boolean).join(', ')}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{row.owner_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{row.owner_phone || ''}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{row.installer || '—'}</div>
                          <div className="text-xs text-muted-foreground">
                            {D2D_INSTALLER_STATUS_LABELS[row.installer_status] ?? row.installer_status}
                            {' · '}
                            {D2D_TIER_LABELS[row.tier] ?? row.tier}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={meta.badge}>
                            {meta.label}
                          </Badge>
                          {row.text_ok && (
                            <span className="ml-2 text-xs text-emerald-600">text OK</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.last_knock_at
                            ? formatDistanceToNow(new Date(row.last_knock_at), { addSuffix: true })
                            : 'never'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No doors match these filters.</p>
            )}
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Showing {filtered.length} of {rows.length} doors
            </p>
          </CardContent>
        </Card>
      )}

      <KnockDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        property={selected}
        organizationId={organizationId}
        userId={userId}
        onLogged={() => void load()}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a door</DialogTitle>
            <DialogDescription>Anything left blank can be filled in later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="d2d-address">Address</Label>
              <Input
                id="d2d-address"
                value={draft.address}
                onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                placeholder="1234 Elm St"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="d2d-city">City</Label>
                <Input
                  id="d2d-city"
                  value={draft.city}
                  onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d2d-state">State</Label>
                <Input
                  id="d2d-state"
                  value={draft.state}
                  onChange={(event) => setDraft({ ...draft, state: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d2d-zip">ZIP</Label>
                <Input
                  id="d2d-zip"
                  value={draft.zip}
                  onChange={(event) => setDraft({ ...draft, zip: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="d2d-owner">Owner</Label>
                <Input
                  id="d2d-owner"
                  value={draft.owner_name}
                  onChange={(event) => setDraft({ ...draft, owner_name: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d2d-phone">Phone</Label>
                <Input
                  id="d2d-phone"
                  value={draft.owner_phone}
                  onChange={(event) => setDraft({ ...draft, owner_phone: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="d2d-installer-status">Installer status</Label>
                <Select
                  value={draft.installer_status}
                  onValueChange={(value) => setDraft({ ...draft, installer_status: value })}
                >
                  <SelectTrigger id="d2d-installer-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(D2D_INSTALLER_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="d2d-tier">Signal</Label>
                <Select value={draft.tier} onValueChange={(value) => setDraft({ ...draft, tier: value })}>
                  <SelectTrigger id="d2d-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(D2D_TIER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addDoor} disabled={saving}>
              {saving ? 'Saving…' : 'Add door'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoorToDoorKnockList;
