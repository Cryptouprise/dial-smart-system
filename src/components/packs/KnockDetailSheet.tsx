
import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  D2D_KNOCK_STATUSES,
  D2D_INSTALLER_STATUS_LABELS,
  D2D_TIER_LABELS,
  statusMeta,
} from '@/lib/doorToDoor';
import { loadKnocksForProperty, logKnock, type D2DKnock, type D2DProperty } from '@/lib/d2dApi';

interface KnockDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: D2DProperty | null;
  organizationId: string | null;
  userId: string | null;
  /** Called after a knock is recorded, so the list can refresh its denormalized status. */
  onLogged: () => void;
}

const relative = (value: string | null): string => {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return formatDistanceToNow(date, { addSuffix: true });
};

const MetaRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium break-words">{value || '—'}</span>
  </div>
);

/**
 * One door: everything known about it, its knock history, and the form a rep uses
 * standing on the porch. Recording a knock is the only write; the database then
 * updates the property's status, last_knock_at and follow-up dates.
 */
const KnockDetailSheet = ({
  open,
  onOpenChange,
  property,
  organizationId,
  userId,
  onLogged,
}: KnockDetailSheetProps) => {
  const { toast } = useToast();
  const [history, setHistory] = useState<D2DKnock[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<string>('not_home');
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [appointmentAt, setAppointmentAt] = useState('');
  const [textOk, setTextOk] = useState(false);

  const refreshHistory = useCallback(async () => {
    if (!property) return;
    setHistoryLoading(true);
    try {
      setHistory(await loadKnocksForProperty(property.id));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [property]);

  useEffect(() => {
    if (!open || !property) return;
    setStatus('not_home');
    setNote('');
    setCallbackAt('');
    setAppointmentAt('');
    setTextOk(false);
    void refreshHistory();
  }, [open, property, refreshHistory]);

  const submit = async () => {
    if (!property || !organizationId || !userId) return;
    setSaving(true);
    try {
      await logKnock({
        organization_id: organizationId,
        property_id: property.id,
        user_id: userId,
        status: status as (typeof D2D_KNOCK_STATUSES)[number],
        note: note.trim() || null,
        callback_at: status === 'callback' && callbackAt ? new Date(callbackAt).toISOString() : null,
        appointment_at:
          status === 'appointment' && appointmentAt ? new Date(appointmentAt).toISOString() : null,
        text_ok: textOk,
        source: 'door',
      });
      toast({
        title: 'Knock recorded',
        description: `${property.address} — ${statusMeta(status).label}`,
      });
      await refreshHistory();
      onLogged();
    } catch (error) {
      toast({
        title: 'Could not record the knock',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const canWrite = Boolean(organizationId && userId);
  const meta = statusMeta(property?.status ?? 'unknocked');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-6">{property?.address ?? 'Door'}</SheetTitle>
          <SheetDescription>
            {[property?.city, property?.state, property?.zip].filter(Boolean).join(', ') || 'No city on file'}
          </SheetDescription>
        </SheetHeader>

        {property && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={meta.badge}>
                {meta.label}
              </Badge>
              {property.text_ok && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  OK to text
                </Badge>
              )}
              {property.dnc && (
                <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30">
                  Do not contact
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">Last knock {relative(property.last_knock_at)}</span>
            </div>

            <div className="rounded-lg border p-3">
              <MetaRow label="Owner" value={property.owner_name} />
              <MetaRow label="Phone" value={property.owner_phone} />
              <MetaRow label="Installer" value={property.installer} />
              <MetaRow
                label="Installer status"
                value={D2D_INSTALLER_STATUS_LABELS[property.installer_status] ?? property.installer_status}
              />
              <MetaRow label="Signal" value={D2D_TIER_LABELS[property.tier] ?? property.tier} />
              <MetaRow label="Permit year" value={property.permit_year} />
              <MetaRow label="System size" value={property.system_kw} />
              <MetaRow label="Finance company" value={property.finance_co} />
              <MetaRow label="Source" value={property.source} />
              <MetaRow
                label="Callback due"
                value={property.callback_at ? new Date(property.callback_at).toLocaleString() : null}
              />
              <MetaRow
                label="Appointment"
                value={property.appointment_at ? new Date(property.appointment_at).toLocaleString() : null}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Log this knock</h3>
              <div className="space-y-1">
                <Label htmlFor="d2d-knock-status">Result</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="d2d-knock-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {D2D_KNOCK_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {statusMeta(value).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {status === 'callback' && (
                <div className="space-y-1">
                  <Label htmlFor="d2d-callback">Come back on</Label>
                  <Input
                    id="d2d-callback"
                    type="datetime-local"
                    value={callbackAt}
                    onChange={(event) => setCallbackAt(event.target.value)}
                  />
                </div>
              )}

              {status === 'appointment' && (
                <div className="space-y-1">
                  <Label htmlFor="d2d-appointment">Appointment at</Label>
                  <Input
                    id="d2d-appointment"
                    type="datetime-local"
                    value={appointmentAt}
                    onChange={(event) => setAppointmentAt(event.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="d2d-note">Note</Label>
                <Textarea
                  id="d2d-note"
                  rows={3}
                  placeholder="What did they say?"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={textOk} onCheckedChange={(value) => setTextOk(value === true)} />
                They said it is OK to text them
              </label>

              <Button className="w-full" onClick={submit} disabled={!canWrite || saving}>
                {saving ? 'Saving…' : 'Save knock'}
              </Button>
              {!canWrite && (
                <p className="text-xs text-muted-foreground">
                  Sign in and be a member of a company to record knocks.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">History</h3>
              {historyLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
              {!historyLoading && history.length === 0 && (
                <p className="text-xs text-muted-foreground">No knocks recorded on this door yet.</p>
              )}
              <ul className="space-y-2">
                {history.map((knock) => (
                  <li key={knock.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={statusMeta(knock.status).badge}>
                        {statusMeta(knock.status).label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{relative(knock.occurred_at)}</span>
                    </div>
                    {knock.note && <p className="mt-1 text-xs text-muted-foreground">{knock.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default KnockDetailSheet;
