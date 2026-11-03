/**
 * CoachPanel: live AI coach for a browser-phone call.
 *
 * - Subscribes to call_live_transcripts (Realtime INSERT, filtered by call_log_id;
 *   the publication + REPLICA IDENTITY are set by the P4a browser-phone migration).
 * - 2.5 s after the latest FINAL "contact" line it calls coach-suggest with the
 *   highest final seq seen, and shows:
 *     "Say this"                     (say_next)
 *     "We think this goes to"        (stage as disposition) with Accept / Change / Dismiss
 * - Every decision goes through coach-decide. The browser never writes
 *   coach_proposals directly and never moves a lead itself.
 * - When `ended` flips true the panel asks for one last suggestion covering the
 *   full transcript and shows every still-pending proposal with "Apply".
 *
 * Minimal shadcn UI, no new deps. Dropdown options are company-scoped
 * (organization_id) with a fallback to rows that still have NULL organization_id.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type Kind = 'say_next' | 'disposition' | 'stage' | 'next_action' | 'field_fill';
export type Status = 'pending' | 'accepted' | 'corrected' | 'dismissed' | 'expired';

export interface CoachProposal {
  id: string;
  kind: Kind;
  proposal: Record<string, any>;
  confidence: number | null;
  status: Status;
  batch_id: string;
  transcript_through_seq: number;
}

interface CoachPanelProps {
  callLogId: string;
  /** Optional; defaults to the current organization from OrganizationContext. */
  organizationId?: string | null;
  ended?: boolean;
  /**
   * Mirrors every proposal set this panel holds, so a parent can render the same
   * data in its own column (CallWorkspace's "The AI heard"). Optional and
   * additive: the panel behaves identically without it.
   */
  onProposals?: (proposals: CoachProposal[]) => void;
  /**
   * false = the parent renders field_fill itself (CallWorkspace shows per-field
   * Use / No rows). Defaults to true so existing callers are unchanged.
   */
  showFieldFill?: boolean;
}

interface Option { id: string; name: string; }

const DEBOUNCE_MS = 2500;
const KIND_LABEL: Record<Kind, string> = {
  say_next: 'Say this',
  disposition: 'Disposition',
  stage: 'Stage',
  next_action: 'Next step',
  field_fill: 'Fill fields',
};

export function CoachPanel({
  callLogId,
  organizationId: organizationIdProp,
  ended = false,
  onProposals,
  showFieldFill = true,
}: CoachPanelProps) {
  const contextOrgId = useCurrentOrganizationId();
  const organizationId = organizationIdProp ?? contextOrgId ?? null;

  const [proposals, setProposals] = useState<CoachProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispositions, setDispositions] = useState<Option[]>([]);
  const [boards, setBoards] = useState<Option[]>([]);
  const [changing, setChanging] = useState(false);
  const [pickedDisposition, setPickedDisposition] = useState<string>('');
  const [pickedBoard, setPickedBoard] = useState<string>('');

  const debounceRef = useRef<number | null>(null);
  const lastSeqRef = useRef<number>(0);          // highest FINAL seq seen on this call
  const lastRequestedSeqRef = useRef<number>(-1); // seq the last coach-suggest covered
  const inFlightRef = useRef(false);

  // Reset per call.
  useEffect(() => {
    setProposals([]);
    setError(null);
    setChanging(false);
    lastSeqRef.current = 0;
    lastRequestedSeqRef.current = -1;
  }, [callLogId]);

  // Mirror the current proposal set to the parent (CallWorkspace's "AI heard").
  useEffect(() => {
    onProposals?.(proposals);
  }, [proposals, onProposals]);

  // Dropdown options: the company's dispositions and boards (stages), plus the
  // caller's own rows that have not been backfilled with organization_id yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const scope = organizationId
        ? `organization_id.eq.${organizationId}${uid ? `,and(organization_id.is.null,user_id.eq.${uid})` : ''}`
        : (uid ? `user_id.eq.${uid}` : null);
      if (!scope) return;

      const [{ data: disp }, { data: bds }] = await Promise.all([
        supabase.from('dispositions').select('id, name').or(scope).order('name'),
        supabase.from('pipeline_boards').select('id, name').or(scope).order('position', { ascending: true }),
      ]);
      if (cancelled) return;
      setDispositions(((disp ?? []) as Option[]));
      setBoards(((bds ?? []) as Option[]));
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const requestSuggest = useCallback(async (reason: 'contact_line' | 'call_ended') => {
    if (inFlightRef.current) return;
    const throughSeq = lastSeqRef.current;
    if (reason === 'contact_line' && throughSeq <= lastRequestedSeqRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('coach-suggest', {
        body: { call_log_id: callLogId, through_seq: throughSeq || undefined },
      });
      if (fnErr) throw new Error(await functionErrorMessage(fnErr));
      lastRequestedSeqRef.current = throughSeq;
      const rows = (data?.proposals ?? []) as CoachProposal[];
      if (rows.length) {
        setProposals(rows);
        setChanging(false);
        setPickedDisposition('');
        setPickedBoard('');
      }
      if (data?.error && !rows.length) setError(String(data.error));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'coach-suggest failed');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [callLogId]);

  // Realtime: final contact line -> debounce 2.5 s -> coach-suggest.
  useEffect(() => {
    const channel = supabase
      .channel(`coach-transcripts-${callLogId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_live_transcripts', filter: `call_log_id=eq.${callLogId}` },
        (payload) => {
          const row = payload.new as { speaker?: string; is_final?: boolean; seq?: number };
          if (!row?.is_final) return;
          if (typeof row.seq === 'number' && row.seq > lastSeqRef.current) lastSeqRef.current = row.seq;
          if (row.speaker !== 'contact') return;
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            void requestSuggest('contact_line');
          }, DEBOUNCE_MS);
        },
      )
      .subscribe();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [callLogId, requestSuggest]);

  // Call ended: one last pass over the full transcript, then show "Apply".
  useEffect(() => {
    if (!ended) return;
    if (debounceRef.current) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (lastSeqRef.current > lastRequestedSeqRef.current) void requestSuggest('call_ended');
  }, [ended, requestSuggest]);

  const decide = useCallback(async (
    proposalId: string,
    decision: 'accept' | 'correct' | 'dismiss',
    chosen?: Record<string, unknown>,
  ): Promise<boolean> => {
    setBusyId(proposalId);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('coach-decide', {
        body: { proposal_id: proposalId, decision, chosen },
      });
      // supabase-js surfaces non-2xx as a FunctionsHttpError whose body is on
      // error.context (a Response); read the server's message from there.
      if (fnErr) {
        setError(await functionErrorMessage(fnErr));
        return false;
      }
      if (data?.error) { setError(String(data.error)); return false; }
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? { ...p, status: data.status as Status } : p)));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'coach-decide failed');
      return false;
    } finally {
      setBusyId(null);
    }
  }, []);

  const byKind = useMemo(() => {
    const map: Partial<Record<Kind, CoachProposal>> = {};
    for (const p of proposals) map[p.kind] = p;
    return map;
  }, [proposals]);

  const sayNext = byKind.say_next;
  const disposition = byKind.disposition;
  const stage = byKind.stage;
  const nextAction = byKind.next_action;
  const fieldFill = byKind.field_fill;

  const routingPending = (disposition?.status === 'pending') || (stage?.status === 'pending');
  const pendingAll = proposals.filter((p) => p.status === 'pending');
  const showFinal = ended && pendingAll.length > 0;

  const acceptRouting = async () => {
    if (disposition?.status === 'pending' && disposition.proposal?.id) await decide(disposition.id, 'accept');
    if (stage?.status === 'pending' && stage.proposal?.board_id) await decide(stage.id, 'accept');
  };
  const dismissRouting = async () => {
    if (disposition?.status === 'pending') await decide(disposition.id, 'dismiss');
    if (stage?.status === 'pending') await decide(stage.id, 'dismiss');
  };
  const applyChange = async () => {
    let ok = true;
    if (disposition?.status === 'pending' && pickedDisposition) {
      const opt = dispositions.find((d) => d.id === pickedDisposition);
      if (opt) ok = (await decide(disposition.id, 'correct', { id: opt.id, name: opt.name })) && ok;
    }
    if (stage?.status === 'pending' && pickedBoard) {
      const opt = boards.find((b) => b.id === pickedBoard);
      if (opt) ok = (await decide(stage.id, 'correct', { board_id: opt.id, stage_id: opt.id, name: opt.name })) && ok;
    }
    if (ok) setChanging(false);
  };

  const pct = (c: number | null | undefined) => (typeof c === 'number' ? `${Math.round(c * 100)}%` : '');

  return (
    <div className="flex flex-col gap-3" data-testid="coach-panel">
      {loading && <div className="text-xs text-muted-foreground">Coach is thinking...</div>}
      {error && <div className="text-xs text-destructive" role="alert">{error}</div>}

      {sayNext && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Say this</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {sayNext.proposal?.text
              ? <p>{sayNext.proposal.text}</p>
              : <p className="text-muted-foreground">
                  {sayNext.proposal?.blocked_reason === 'house_rule'
                    ? 'Suggestion withheld: it touched price, timeline, legal outcome or payment. Keep it to listening and next steps.'
                    : 'No suggestion yet.'}
                </p>}
          </CardContent>
        </Card>
      )}

      {(disposition || stage) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">We think this goes to</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div>
              <span className="font-medium">{stage?.proposal?.name || 'no stage'}</span>
              {stage?.confidence != null && <span className="text-xs text-muted-foreground"> {pct(stage.confidence)}</span>}
              {' as '}
              <span className="font-medium">{disposition?.proposal?.name || 'no disposition'}</span>
              {disposition?.confidence != null && <span className="text-xs text-muted-foreground"> {pct(disposition.confidence)}</span>}
              {routingPending ? ' - correct?' : ''}
            </div>
            {disposition?.proposal?.reasoning && (
              <div className="text-xs text-muted-foreground">{disposition.proposal.reasoning}</div>
            )}

            {routingPending && !changing && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busyId !== null || (!disposition?.proposal?.id && !stage?.proposal?.board_id)} onClick={() => void acceptRouting()}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => setChanging(true)}>
                  Change
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => void dismissRouting()}>
                  Dismiss
                </Button>
              </div>
            )}

            {routingPending && changing && (
              <div className="flex flex-col gap-2">
                {disposition?.status === 'pending' && (
                  <Select value={pickedDisposition} onValueChange={setPickedDisposition}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Choose disposition" /></SelectTrigger>
                    <SelectContent>
                      {dispositions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {stage?.status === 'pending' && (
                  <Select value={pickedBoard} onValueChange={setPickedBoard}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Choose stage" /></SelectTrigger>
                    <SelectContent>
                      {boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busyId !== null || (!pickedDisposition && !pickedBoard)} onClick={() => void applyChange()}>
                    Apply change
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => setChanging(false)}>
                    Back
                  </Button>
                </div>
              </div>
            )}

            {!routingPending && (
              <div className="text-xs text-muted-foreground">
                {disposition && <span>disposition: {disposition.status}</span>}
                {disposition && stage && <span> / </span>}
                {stage && <span>stage: {stage.status}</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {((nextAction && nextAction.proposal?.type && nextAction.proposal.type !== 'none')
        || (showFieldFill && fieldFill && Object.keys(fieldFill.proposal?.fields ?? {}).length > 0)) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Also noticed</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
            {nextAction && nextAction.proposal?.type && nextAction.proposal.type !== 'none' && (
              <div>
                Next step: {nextAction.proposal.type}
                {nextAction.proposal.when_iso ? ` at ${new Date(nextAction.proposal.when_iso).toLocaleString()}` : ''}
                {nextAction.proposal.note ? ` - ${nextAction.proposal.note}` : ''}
                {nextAction.status !== 'pending' ? ` (${nextAction.status})` : ''}
              </div>
            )}
            {showFieldFill && fieldFill && Object.keys(fieldFill.proposal?.fields ?? {}).length > 0 && (
              <div>
                Fields: {Object.entries(fieldFill.proposal.fields as Record<string, unknown>)
                  .map(([k, v]) => `${k} = ${String(v)}`).join(', ')}
                {fieldFill.status !== 'pending' ? ` (${fieldFill.status})` : ''}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showFinal && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Call ended: apply what the coach suggested?</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {pendingAll.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="font-medium">{KIND_LABEL[p.kind]}:</span> {summarize(p)}
                </span>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" disabled={busyId !== null || !canApply(p)} onClick={() => void decide(p.id, 'accept')}>Apply</Button>
                  <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => void decide(p.id, 'dismiss')}>Skip</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function functionErrorMessage(err: unknown): Promise<string> {
  const e = err as { message?: string; context?: unknown };
  const ctx = e?.context as { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } } | undefined;
  try {
    const body = ctx?.clone ? await ctx.clone().json() : (ctx?.json ? await ctx.json() : null);
    const msg = (body as { error?: unknown } | null)?.error;
    if (typeof msg === 'string' && msg) return msg;
  } catch { /* fall through */ }
  return e?.message || 'Edge function call failed';
}

function canApply(p: CoachProposal): boolean {
  switch (p.kind) {
    case 'say_next': return Boolean(p.proposal?.text);
    case 'disposition': return Boolean(p.proposal?.id);
    case 'stage': return Boolean(p.proposal?.board_id);
    case 'next_action': return p.proposal?.type !== 'none';
    case 'field_fill': return Object.keys(p.proposal?.fields ?? {}).length > 0;
    default: return false;
  }
}

function summarize(p: CoachProposal): string {
  switch (p.kind) {
    case 'say_next': return String(p.proposal?.text || '(withheld)').slice(0, 90);
    case 'disposition': return p.proposal?.name || '(none)';
    case 'stage': return p.proposal?.name || '(none)';
    case 'next_action': return `${p.proposal?.type ?? 'none'}${p.proposal?.when_iso ? ` at ${new Date(p.proposal.when_iso).toLocaleString()}` : ''}`;
    case 'field_fill': return Object.keys(p.proposal?.fields ?? {}).join(', ') || '(none)';
    default: return '';
  }
}

export default CoachPanel;
