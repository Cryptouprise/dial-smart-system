/**
 * CallWorkspace: the DoorBoss call workspace, ported natively into Dial Smart.
 *
 * Source of truth: `docs/wholesale/doorboss-call/call.html` (223 lines),
 * `call-content.js` (the coach words) and the port plan
 * `docs/wholesale/phases/CALL-SCREEN-PORT.md`. Rule (Charles, 10/21): bring the
 * whole workspace, never a stripped version. Nothing here is embedded or
 * iframed; every piece is Dial Smart's own.
 *
 * One screen, three columns, exactly like DoorBoss:
 *   Live transcript | The AI heard (Use / No) | Live coach (Avoid / Say instead / Next step)
 *
 * Where each piece comes from:
 *   transport     src/lib/voice/BrowserPhone.ts (Telnyx WebRTC / Twilio Voice SDK)
 *   transcript    call_live_transcripts via Realtime (BrowserPhone subscribes)
 *   rules coach   src/lib/coach/rules.ts + the pack's coachRules (local, instant)
 *   AI coach      CoachPanel (coach-suggest -> coach-decide)
 *   AI heard      the field_fill proposal, one Use / No per field
 *
 * "Use" on a field calls coach-decide with decision 'correct' and
 * `chosen: { fields: { <key>: <value> } }`, which coach-decide treats as the
 * effective payload (coach-decide/index.ts:167) and merges through
 * merge_custom_fields, so exactly one field lands. "No" is local only, which is
 * what DoorBoss does too (call.html:171 never posts on No).
 *
 * Consent gate (DoorBoss call.html:154-161, 206): nothing is transcribed or
 * recorded until the rep taps "Record" after the homeowner agrees. In PHONE mode
 * the provider starts recording and transcription server-side when the leg is
 * registered, so this switch currently gates what the screen shows and feeds the
 * coach. Making it stop provider recording needs voice-call-action
 * `record_start` / `transcription_start` (port plan line 26) - that is the one
 * open behavioural gap, stated here rather than hidden.
 *
 * Modes: 'phone' is wired end to end. 'video' and 'inperson' need the Daily
 * service (port plan build order step 5) and say so instead of pretending.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
import {
  BrowserPhone,
  type PhoneState,
  type TranscriptLine,
  type VoiceProvider,
} from '@/lib/voice/BrowserPhone';
import {
  COACH_ALWAYS_LINE,
  activeRules,
  bestMatch,
  chipLabel,
  fillTokens,
  pickEmpathy,
  topChips,
  type CoachRule,
  type TokenFill,
} from '@/lib/coach/rules';
import { coachContentForPack } from '@/lib/coach/packContent';
import type { PackId } from '@/lib/packs';
import { CoachPanel, type CoachProposal } from './CoachPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

export type CallMode = 'phone' | 'video' | 'inperson';

export interface CallWorkspaceProps {
  /** Pack whose coach words to use. Defaults to door_to_door. */
  packId?: PackId;
  /** Lead to attach the call to (voice-call verifies it belongs to the company). */
  leadId?: string | null;
  /** Who we are calling; prefills the To field. */
  phone?: string;
  /** Shown in the header and used for the {first} token. */
  contactName?: string;
  /** Extra header context, e.g. the Door to Door address. */
  context?: string;
  /** Installer name for the {installer} token. */
  installer?: string;
  /** Rep's own name for the {rep} token. */
  repName?: string;
  /** 'phone' is the wired transport; video/in-person need the Daily service. */
  mode?: CallMode;
  /** Called when a call ends, with its call_log_id (or null if none started). */
  onEnded?: (callLogId: string | null) => void;
}

interface CallerId {
  id: string;
  number: string;
  provider: string;
}

/** DoorBoss money fields get a $ and thousands separators (call.html:102). */
const MONEY_KEYS = new Set([
  'loan_amount',
  'loan_balance',
  'monthly_payment',
  'promised_monthly',
  'amount',
  'value',
  'price',
]);

const PROVIDER_LABEL: Record<VoiceProvider, string> = { telnyx: 'Telnyx', twilio: 'Twilio' };

function humanKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function fieldValue(key: string, value: unknown): string {
  if (typeof value === 'number' && MONEY_KEYS.has(key)) return `$${value.toLocaleString('en-US')}`;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function describeError(detail: unknown): string {
  if (!detail) return 'The call hit a problem.';
  const d = detail as { message?: string; errorMsg?: string; error_code?: string };
  return d.message || d.errorMsg || d.error_code || 'The call hit a problem.';
}

/** Read the server's message out of a FunctionsHttpError (its body is on .context). */
async function functionErrorMessage(err: unknown): Promise<string> {
  const e = err as { message?: string; context?: unknown };
  const ctx = e?.context as { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } } | undefined;
  try {
    const body = ctx?.clone ? await ctx.clone().json() : ctx?.json ? await ctx.json() : null;
    const msg = (body as { error?: unknown } | null)?.error;
    if (typeof msg === 'string' && msg) return msg;
  } catch {
    /* fall through */
  }
  return e?.message || 'Edge function call failed';
}

export function CallWorkspace({
  packId = 'door_to_door',
  leadId = null,
  phone,
  contactName,
  context,
  installer,
  repName,
  mode = 'phone',
  onEnded,
}: CallWorkspaceProps) {
  const orgId = useCurrentOrganizationId();

  const coach = useMemo(() => coachContentForPack(packId), [packId]);
  const rules = useMemo(() => activeRules(coach), [coach]);
  const chips = useMemo(() => topChips(coach, 8), [coach]);
  const seed = useMemo(() => Date.now() % 97, []);

  // --- setup ---------------------------------------------------------------
  const [provider, setProvider] = useState<VoiceProvider>('telnyx');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(phone ?? '');
  const [callerIds, setCallerIds] = useState<CallerId[]>([]);

  // --- call ----------------------------------------------------------------
  const phoneRef = useRef<BrowserPhone | null>(null);
  const callLogIdRef = useRef<string | null>(null);
  const txRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  const [phase, setPhase] = useState<'setup' | 'live' | 'ended'>('setup');
  const [state, setState] = useState<PhoneState>('disconnected');
  const [callLogId, setCallLogId] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [consented, setConsented] = useState(false);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [typed, setTyped] = useState('');
  const [active, setActive] = useState<CoachRule | null>(null);
  const [heardWhy, setHeardWhy] = useState<'' | 'heard' | 'typed'>('');
  const [proposals, setProposals] = useState<CoachProposal[]>([]);
  const [decided, setDecided] = useState<Record<string, 'used' | 'skipped'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armEnd, setArmEnd] = useState(0);

  const fill = useMemo<TokenFill>(
    () => ({ first: contactName ?? null, rep: repName ?? null, installer: installer ?? null }),
    [contactName, repName, installer],
  );

  const fillLine = useCallback((text: string | undefined) => fillTokens(text ?? '', fill), [fill]);

  // The rep's own caller IDs (phone_numbers RLS is own-rows-only).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      let query = supabase
        .from('phone_numbers')
        .select('id, number, provider')
        .eq('user_id', uid)
        .eq('status', 'active');
      if (orgId) query = query.eq('organization_id', orgId);
      const { data } = await query.order('number');
      if (cancelled) return;
      const rows = (data ?? []) as CallerId[];
      setCallerIds(rows);
      setFrom((prev) => {
        if (prev) return prev;
        const same = rows.find((r) => r.provider === provider) ?? rows[0];
        return same ? same.number : prev;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, provider]);

  // Never leave a live call behind when the tab unmounts.
  useEffect(() => () => void phoneRef.current?.disconnect(), []);

  const onLine = useCallback((line: TranscriptLine) => {
    setLines((prev) => {
      const next = [...prev, line];
      return next.length > 300 ? next.slice(next.length - 300) : next;
    });
  }, []);

  // Keep the transcript pinned to the bottom unless the rep scrolled up.
  useEffect(() => {
    const el = txRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  // DoorBoss fires the coach on what the HOMEOWNER said (call.html:147):
  // the last two contact lines. Rules never fire while consent is off.
  useEffect(() => {
    if (!consented || !rules.length) return;
    const contact = lines.filter((l) => l.is_final && l.speaker !== 'rep');
    if (!contact.length) return;
    const text = contact.slice(-2).map((l) => l.text).join(' ');
    const hit = bestMatch(text, rules);
    if (hit) {
      setActive(hit);
      setHeardWhy('heard');
    }
  }, [lines, consented, rules]);

  const submitTyped = useCallback(() => {
    const value = typed.trim();
    if (!value) return;
    const hit = bestMatch(value, rules);
    if (hit) {
      setActive(hit);
      setHeardWhy('typed');
    }
    setTyped('');
  }, [typed, rules]);

  const finish = useCallback(() => {
    setPhase('ended');
    setMuted(false);
    setHeld(false);
    onEnded?.(callLogIdRef.current);
  }, [onEnded]);

  const startCall = useCallback(async () => {
    if (mode !== 'phone') {
      setError('Video and in-person calls need the Daily service (next slice).');
      return;
    }
    if (!orgId) {
      setError('No company context on this session.');
      return;
    }
    if (!to.trim() || !from.trim()) {
      setError('Pick a caller ID and the number to dial.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Your session expired. Sign in again.');

      const { data: tokenData, error: tokenErr } = await supabase.functions.invoke('voice-token', {
        body: { provider, organization_id: orgId },
      });
      if (tokenErr) throw new Error(await functionErrorMessage(tokenErr));
      const providerToken = String(tokenData?.token ?? '');
      if (!providerToken) throw new Error('voice-token returned no token.');

      // The generated client holds the URL and publishable key as instance
      // fields; read them rather than duplicating the constants.
      const url = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl;
      const anonKey = (supabase as unknown as { supabaseKey?: string }).supabaseKey;
      if (!url || !anonKey) throw new Error('Supabase client is missing its URL or key.');

      const bp = new BrowserPhone(url, anonKey);
      phoneRef.current = bp;
      bp.onState((next, detail) => {
        setState(next);
        if (next === 'error') setError(describeError(detail));
        if (next === 'ended') finish();
      });
      bp.onTranscript(onLine);

      await bp.connect(provider, providerToken, orgId, accessToken);
      const result = await bp.call({ lead_id: leadId, to: to.trim(), from: from.trim() });
      callLogIdRef.current = result.call_log_id;
      setCallLogId(result.call_log_id);
      setLines([]);
      setDecided({});
      setActive(null);
      setHeardWhy('');
      setConsented(false);
      setPhase('live');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the call.');
      try {
        await phoneRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      phoneRef.current = null;
      callLogIdRef.current = null;
      setCallLogId(null);
      setPhase('setup');
    } finally {
      setBusy(false);
    }
  }, [mode, orgId, provider, to, from, leadId, onLine, finish]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    phoneRef.current?.mute(next);
    setMuted(next);
  }, [muted]);

  const toggleHold = useCallback(async () => {
    const bp = phoneRef.current;
    if (!bp) return;
    try {
      if (held) {
        await bp.unhold();
        setHeld(false);
      } else {
        await bp.hold();
        setHeld(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hold is not available on this provider.');
    }
  }, [held]);

  // Two-tap End (DoorBoss call.html:200-204): one stray tap must not hang up.
  const endCall = useCallback(() => {
    const now = Date.now();
    if (armEnd && now - armEnd < 4000) {
      setArmEnd(0);
      void phoneRef.current?.hangup();
      return;
    }
    setArmEnd(now);
    window.setTimeout(() => setArmEnd((prev) => (prev === now ? 0 : prev)), 4100);
  }, [armEnd]);

  const reset = useCallback(() => {
    setPhase('setup');
    setLines([]);
    setCallLogId(null);
    callLogIdRef.current = null;
    setConsented(false);
    setActive(null);
    setHeardWhy('');
    setProposals([]);
    setDecided({});
    setError(null);
    setMuted(false);
    setHeld(false);
    setState('disconnected');
  }, []);

  // CoachPanel mirrors its proposals so this screen can render "The AI heard".
  // Identity guard: the panel hands back the same array reference, so a repeated
  // call cannot re-render us in a loop.
  const handleProposals = useCallback((next: CoachProposal[]) => {
    setProposals((prev) => (prev === next ? prev : next));
  }, []);

  const decide = useCallback(
    async (proposalId: string, decision: 'accept' | 'correct' | 'dismiss', chosen?: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('coach-decide', {
          body: { proposal_id: proposalId, decision, chosen },
        });
        if (fnErr) {
          setError(await functionErrorMessage(fnErr));
          return false;
        }
        if (data?.error) {
          setError(String(data.error));
          return false;
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'coach-decide failed');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const fieldFill = useMemo(
    () => proposals.find((p) => p.kind === 'field_fill' && p.status === 'pending') ?? null,
    [proposals],
  );

  const fieldRows = useMemo(() => {
    const raw = (fieldFill?.proposal?.fields ?? {}) as Record<string, unknown>;
    return Object.entries(raw)
      .filter(([key, value]) => value !== null && value !== undefined && !decided[key])
      .map(([key, value]) => ({ key, value }));
  }, [fieldFill, decided]);

  const useField = useCallback(
    async (key: string, value: unknown) => {
      if (!fieldFill) return;
      // 'correct' + chosen.fields => coach-decide merges exactly this one field.
      const ok = await decide(fieldFill.id, 'correct', { fields: { [key]: value } });
      setDecided((prev) => ({ ...prev, [key]: ok ? 'used' : 'skipped' }));
    },
    [fieldFill, decide],
  );

  const statusText = useMemo(() => {
    if (phase === 'setup') return 'Ready to call';
    if (phase === 'ended') return 'Call ended';
    if (state === 'error') return 'Call failed';
    if (held) return 'On hold';
    if (state === 'connecting') return 'Connecting...';
    if (state === 'ringing') return 'Ringing...';
    if (state === 'answered') return 'On the call';
    return 'Starting...';
  }, [phase, state, held]);

  const consentText = consented
    ? 'Live transcript on (they agreed to record). The coach and the AI notes are reading the call.'
    : 'Tap "Record" once they say OK. The coach and the AI notes start only then.';

  const empathy = pickEmpathy(coach, seed);

  /* ---------- render ---------- */

  if (mode !== 'phone') {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm" data-testid="call-workspace-mode-notice">
        <div className="mb-1 font-semibold">
          {mode === 'inperson' ? 'In-person recording' : 'Video call'} is not wired yet
        </div>
        <p className="text-muted-foreground">
          The phone workspace is live. {mode === 'inperson' ? 'In-person' : 'Video'} needs the Daily service and is the
          next slice of this port (see <code className="rounded bg-muted px-1">docs/wholesale/phases/CALL-SCREEN-PORT.md</code>,
          build order step 5). Switch the mode to <span className="font-medium">phone</span> to use it now.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="call-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Door to Door call</span>
          <Badge variant="secondary" className="text-[11px]">
            {PROVIDER_LABEL[provider]}
          </Badge>
          {context ? <span className="text-xs text-muted-foreground">{context}</span> : null}
        </div>
        <span className="text-xs text-muted-foreground" data-testid="call-status">
          {statusText}
        </span>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {phase === 'setup' ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Start the call</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="call-to">Number to call</Label>
              <Input
                id="call-to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="+1 555 000 1234"
                autoComplete="off"
              />
              {contactName ? <span className="text-xs text-muted-foreground">{contactName}</span> : null}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="call-from">Caller ID</Label>
              {callerIds.length ? (
                <Select value={from} onValueChange={setFrom}>
                  <SelectTrigger id="call-from">
                    <SelectValue placeholder="Pick a number" />
                  </SelectTrigger>
                  <SelectContent>
                    {callerIds.map((c) => (
                      <SelectItem key={c.id} value={c.number}>
                        {c.number} ({c.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="call-from"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="+1 555 000 5678"
                  autoComplete="off"
                />
              )}
              <span className="text-xs text-muted-foreground">
                {callerIds.length ? 'Your own active numbers.' : 'No active numbers on your account: type one.'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="call-provider">Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as VoiceProvider)}>
                <SelectTrigger id="call-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telnyx">Telnyx</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button className="w-full" disabled={busy || !to.trim() || !from.trim()} onClick={() => void startCall()}>
                {busy ? 'Starting...' : 'Start call'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase !== 'setup' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={muted ? 'default' : 'outline'} onClick={toggleMute} disabled={phase !== 'live'}>
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button size="sm" variant={held ? 'default' : 'outline'} onClick={() => void toggleHold()} disabled={phase !== 'live'}>
              {held ? 'Resume' : 'Hold'}
            </Button>
            <Button
              size="sm"
              variant={consented ? 'default' : 'outline'}
              onClick={() => setConsented((v) => !v)}
              disabled={phase !== 'live'}
              title="Tap once the homeowner says it is OK"
            >
              {consented ? 'Recording' : 'Record'}
            </Button>
            <Button size="sm" variant="destructive" onClick={endCall} disabled={phase !== 'live'}>
              {armEnd ? 'Tap again to end' : 'End call'}
            </Button>
            <span className={`text-xs ${consented ? 'text-emerald-600' : 'text-muted-foreground'}`}>{consentText}</span>
          </div>

          <Separator />

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Live transcript */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live transcript</h4>
              <div
                ref={txRef}
                className="h-64 overflow-auto rounded-lg border bg-muted/30 p-2 text-sm"
                data-testid="call-transcript"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                }}
              >
                {lines.length === 0 ? (
                  <span className="text-muted-foreground">
                    {consented ? 'Listening...' : 'Nothing yet. Tap Record once they agree.'}
                  </span>
                ) : (
                  lines.map((l, i) => (
                    <div key={`${l.seq}-${i}`} className="my-0.5">
                      <span className="font-semibold text-muted-foreground">
                        {l.speaker === 'rep' ? 'You' : l.speaker === 'contact' ? 'Homeowner' : 'Call'}:{' '}
                      </span>
                      {l.text}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* The AI heard */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                The AI heard (tap Use to put it in the case file)
              </h4>
              <div className="flex flex-col gap-2" data-testid="call-ai-heard">
                {fieldRows.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Nothing yet.</span>
                ) : (
                  fieldRows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2"
                    >
                      <div className="min-w-0 text-sm">
                        <span className="font-medium">{humanKey(row.key)}: </span>
                        <span>{fieldValue(row.key, row.value)}</span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void useField(row.key, row.value)}
                        >
                          Use
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setDecided((prev) => ({ ...prev, [row.key]: 'skipped' }))}
                        >
                          No
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Live coach */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Live coach <span className="normal-case">(only you see this)</span>
              </h4>

              {active ? (
                <div className="flex flex-col gap-2" data-testid="call-coach-active">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Heard: {active.chip ?? active.id} {heardWhy === 'typed' ? '(typed)' : ''}
                    </span>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setActive(null);
                        setHeardWhy('');
                      }}
                    >
                      clear
                    </button>
                  </div>
                  <div className="rounded-lg border-l-4 border-l-red-500 bg-card p-2 text-sm">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Avoid</div>
                    <p>{fillLine(active.warn)}</p>
                  </div>
                  <div className="rounded-lg border-l-4 border-l-emerald-500 bg-card p-2 text-sm">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Say instead</div>
                    <p>{fillLine(active.say)}</p>
                  </div>
                  {active.next ? (
                    <div className="rounded-lg border-l-4 border-l-amber-500 bg-card p-2 text-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Next step</div>
                      <p>{fillLine(active.next)}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2" data-testid="call-coach-idle">
                  <div className="rounded-lg border bg-card p-2 text-sm">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Always</div>
                    <p>{COACH_ALWAYS_LINE}</p>
                  </div>
                  {empathy ? (
                    <div className="rounded-lg border-l-4 border-l-emerald-500 bg-card p-2 text-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        If they are frustrated
                      </div>
                      <p>{empathy}</p>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Listening to the homeowner. The coach shows what to avoid and what to say.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitTyped();
                    }
                  }}
                  placeholder="Or type what they said..."
                  aria-label="What the homeowner said"
                />
                <Button size="sm" variant="outline" onClick={submitTyped} disabled={!typed.trim()}>
                  Coach
                </Button>
              </div>

              {chips.length ? (
                <div className="flex flex-wrap gap-1.5" data-testid="call-coach-chips">
                  {chips.map((rule) => (
                    <Button
                      key={rule.id}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setActive(rule);
                        setHeardWhy('typed');
                      }}
                    >
                      {chipLabel(rule)}
                    </Button>
                  ))}
                </div>
              ) : null}

              {callLogId ? (
                <>
                  <Separator />
                  <CoachPanel
                    callLogId={callLogId}
                    organizationId={orgId ?? undefined}
                    ended={phase === 'ended'}
                    onProposals={handleProposals}
                    showFieldFill={false}
                  />
                </>
              ) : null}
            </div>
          </div>

          {phase === 'ended' ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <span className="text-sm text-muted-foreground">Call ended. Apply what the coach suggested, then start the next one.</span>
              <Button size="sm" variant="outline" onClick={reset}>
                New call
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default CallWorkspace;
