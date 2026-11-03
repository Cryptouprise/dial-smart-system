/**
 * Door to Door pack - the host the vendored DoorBoss app runs on.
 *
 * The app in ./app/app.js is DoorBoss's own bundle, kept byte-faithful. Everything in it that
 * used to be a network call now goes through exactly one function, `api(method, path, body, ms)`,
 * which the extractor rewired to `host.api`. This file is that function.
 *
 * It routes DoorBoss's REST paths onto Dial Smart's own Supabase - the nine d2d_* tables from
 *   20261102234500_door_to_door_core.sql      territories, properties, knocks
 *   20261103020000_door_to_door_workspace.sql settings, positions, messages, appointments,
 *                                             api keys, webhooks
 *   20261103023000_door_to_door_members.sql   d2d_company_members() - the company roster
 * - and hands rows back in DoorBoss's wire shape, so the app's own normalisers (ts/iso/normProp)
 * behave exactly as they did on DoorBoss. The offline queue, the IndexedDB house cache, the
 * retries and the client_id idempotency all stay inside app.js; none of that is re-implemented.
 *
 * Route contract, read off the app's data layer:
 *   GET    /me  /users  /settings  /goals  /me/ai  /keys  /webhooks/outbound
 *   GET    /properties[?since=]  /territories  /knocks?from=  /appointments?from=
 *   GET    /messages?property=  /positions  /positions/:user?day=
 *   POST   /users  /push/subscribe  /properties  /knocks  /messages  /territories
 *   POST   /territories/:id/claim  /appointments/:id  /keys  /webhooks/outbound
 *   POST   /heartbeat  /ai/brief
 *   PUT    /goals  /me/ai
 *   DELETE /keys/:id  /webhooks/outbound/:id  /territories/:id
 *
 * Two deliberate renames between DoorBoss's wire shape and the d2d_* columns:
 *   knock.created_at   <-> d2d_knocks.occurred_at     (named for what it is)
 *   heartbeat.accuracy <-> d2d_positions.accuracy_m
 * Every other field is column-for-column identical.
 *
 * Fields the app reads but the tables do not carry (territory.team_id, appointment.knock_id /
 * result / ghl_event_id) are returned as explicit nulls rather than omitted, because the app's
 * normalisers call methods on them and a missing key is not the same thing as a null one.
 */

import { supabase } from '@/integrations/supabase/client';
import { resolveOrganizationId } from '@/lib/d2dApi';
import { enrollDoorFollowUp } from './enroll';

/**
 * One documented loose handle for the d2d_* tables.
 *
 * The vendored app speaks loose JSON - its own wire shape, assembled by hand below - so this file
 * is a JSON interop boundary rather than a typed data layer. That matters here because
 * src/integrations/supabase/types.ts is generated from the local migration stack and was last
 * generated when only 20261102234500_door_to_door_core.sql existed: it carries d2d_territories,
 * d2d_properties and d2d_knocks, but not the six tables from 20261103020000_door_to_door_workspace.sql
 * (settings, positions, messages, appointments, api_keys, webhooks) and not the
 * d2d_company_members() function from 20261103023000_door_to_door_members.sql, all of which are
 * live in the database. Rather than hand-edit a generated file - which the next
 * `npm run check:schema-types` would overwrite - the tables are reached through this one cast, and
 * every result is narrowed back to Row immediately, so nothing untyped escapes this module.
 * Fixing the generated types properly is a separate, flagged job: it needs the local Supabase stack.
 */
interface LooseResult {
  data: unknown;
  error: unknown;
}

interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns?: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  is(column: string, value: unknown): LooseQuery;
  in(column: string, values: readonly unknown[]): LooseQuery;
  gt(column: string, value: unknown): LooseQuery;
  gte(column: string, value: unknown): LooseQuery;
  lt(column: string, value: unknown): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  limit(count: number): LooseQuery;
  single(): PromiseLike<LooseResult>;
  maybeSingle(): PromiseLike<LooseResult>;
}

interface LooseTable extends LooseQuery {
  insert(values: Row): LooseQuery;
  upsert(values: Row | readonly Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): LooseQuery;
  update(values: Row): LooseQuery;
  delete(): LooseQuery;
}

interface LooseClient {
  from(table: string): LooseTable;
  rpc(fn: string, args?: Row): PromiseLike<LooseResult>;
  /**
   * The one authenticated identity read this file makes: which rep is signed in. The real client is
   * typed for this and the narrower shape declared here is a true statement about it.
   */
  auth: {
    getUser(): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
}

const db = supabase as unknown as LooseClient;

/** The app's own palette, so a rep's colour matches on the board and on the map. */
const COLORS = ['#2b7fff', '#15a35a', '#7c5cff', '#e0a800', '#d64545', '#0b7a68'];

/**
 * Dial Smart's organization_users.role is free text (only 'owner' exists in production today)
 * while the app switches on DoorBoss's vocabulary. Map it explicitly: an owner must see the
 * management half of the app, and nobody should be promoted or demoted by accident.
 */
const ROLE_MAP: Record<string, 'admin' | 'manager' | 'rep'> = {
  owner: 'admin',
  admin: 'admin',
  manager: 'manager',
  supervisor: 'manager',
  lead: 'manager',
};

function roleOf(raw: unknown): 'admin' | 'manager' | 'rep' {
  return ROLE_MAP[String(raw ?? '').toLowerCase()] ?? 'rep';
}

const GOAL_DEFAULTS = { daily_knocks: 60, daily_contacts: 20, daily_appts: 2 };
const AI_DEFAULTS = { provider: 'company', key: '' };

/** Only the columns each table actually has: the app's objects carry demo-only extras. */
const PROPERTY_COLUMNS = [
  'lat', 'lng', 'address', 'city', 'state', 'zip',
  'owner_name', 'owner_phone', 'owner_email',
  'installer', 'installer_status', 'installer_closed', 'tier', 'permit_year', 'system_kw',
  'finance_co', 'source', 'territory_id', 'status', 'last_knock_at', 'last_knock_by',
  'callback_at', 'appointment_at', 'text_ok', 'ghl_contact_id', 'ghl_opportunity_id',
  'dnc', 'geocode_status', 'deleted_at', 'created_at',
] as const;

const KNOCK_COLUMNS = [
  'client_id', 'property_id', 'user_id', 'status', 'note', 'callback_at', 'appointment_at',
  'text_ok', 'lat', 'lng', 'accuracy_m', 'photo_urls', 'source', 'occurred_at', 'synced_at',
] as const;

const TERRITORY_COLUMNS = ['name', 'color', 'polygon', 'assigned_user_ids', 'reknock_days'] as const;
const MESSAGE_COLUMNS = ['property_id', 'user_id', 'to_user_id', 'body'] as const;
const APPOINTMENT_COLUMNS = ['property_id', 'user_id', 'at', 'status', 'note'] as const;
const WEBHOOK_COLUMNS = ['url', 'events', 'active'] as const;
const POSITION_COLUMNS = ['user_id', 'lat', 'lng', 'accuracy_m', 'fix_at', 'trail'] as const;

type Row = Record<string, unknown>;

const nowIso = () => new Date().toISOString();

/** The app works in epoch ms and converts ISO itself, so every timestamp leaves here as ISO. */
function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The app treats 401/403 as "your session is gone, sign in again" - it tests /: 40[13] / against
 * the error message - so the status has to survive inside the message text.
 */
export class D2DHostError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number, message: string) {
    super(`${method} ${path}: ${status} ${message}`);
    this.name = 'D2DHostError';
    this.status = status;
  }
}

function fail(method: string, path: string, status: number, message: string): never {
  throw new D2DHostError(method, path, status, message);
}

/** Every PostgREST call funnels through here, so a failure is always an Error the app can show. */
function unwrap<T>(method: string, path: string, res: LooseResult): T {
  if (res.error) {
    const error = res.error as { message?: string; code?: string; details?: string };
    const message = error.message ?? error.code ?? 'request failed';
    const status = /row-level security|permission denied|not authorized/i.test(message)
      ? 403
      : /jwt|token|unauthorized|not authenticated/i.test(message)
        ? 401
        : 400;
    fail(method, path, status, message);
  }
  return res.data as T;
}

function pick(row: Row, columns: readonly string[]): Row {
  const out: Row = {};
  for (const column of columns) if (row[column] !== undefined) out[column] = row[column];
  return out;
}

function asArray(body: unknown): Row[] {
  if (Array.isArray(body)) return body as Row[];
  if (body && typeof body === 'object') return [body as Row];
  return [];
}

/* Performance, competitions, the feed, the area card and the export guard --------------------
 *
 * The add-on layers in app/scripts.js - the leaderboard, the competitions card, at-risk, pace, the
 * team feed, the area card and the export guard - used to ask DoorBoss's own service at /perf/*,
 * /area/*, /audit/* and /billing/usage. Those routes are answered here instead, from the same
 * tables the rest of the app writes to, so every number is the rep's own live data rather than a
 * second copy of it that can drift.
 *
 * Two definitions are worth spelling out, because the app's own arithmetic is the spec:
 *
 *   doors    - knocks whose source is 'door'. A row written back after the fact (a GHL outcome, a
 *              signing recorded from the appointment) is not a door, and the app agrees: it filters
 *              on source === 'door' before counting anything (scripts.js:1360).
 *   contacts - those same door-sourced knocks whose status the app marks contact: true
 *              (callback, interested, appointment, signed, not_interested - scripts.js:47-53).
 *
 * Competitions, the feed's shout-outs and the export log have no table in the d2d_* schema. They
 * are small, company-scoped, low-volume records, so they live in one JSON key on the company's
 * settings row (d2d_settings.settings.ops) rather than in a fourth migration. That keeps the whole
 * port shippable without a database deploy. If they ever grow past a few hundred rows they should
 * become real tables; opsFrom and patchOps are the only two places that would have to change.
 * ------------------------------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/** The app's contact statuses (scripts.js:47-53). */
const CONTACT_STATUSES = new Set(['callback', 'interested', 'appointment', 'signed', 'not_interested']);

/** Appointment statuses that mean the homeowner actually sat down with a rep. */
const SAT_STATUSES = new Set(['held', 'sat', 'completed', 'signed']);

/** The five things the leaderboard and a competition can rank on. */
const METRICS = new Set(['doors', 'contacts', 'appts', 'sat', 'signed']);

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sodPlus(days: number): number {
  const d = new Date(startOfDay(Date.now()));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayStamp(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : null;
}

/**
 * The app sends its date bar as a window name, or as an explicit pair of days. This is the same
 * arithmetic as the app's own periodRange (scripts.js:1327) in local time, so the chip the rep taps
 * and the rows that come back always mean the same days.
 */
function windowRange(body: Row): { from: number; to: number } {
  const name = String(body.window ?? 'today');
  const dow = (new Date(startOfDay(Date.now())).getDay() + 6) % 7; // Monday = 0, the app's week
  if (name === 'yesterday') return { from: sodPlus(-1), to: sodPlus(0) };
  if (name === 'week') return { from: sodPlus(-dow), to: sodPlus(1) };
  if (name === 'lastweek') return { from: sodPlus(-dow - 7), to: sodPlus(-dow) };
  if (name === 'thismonth') {
    const first = new Date(startOfDay(Date.now()));
    first.setDate(1);
    return { from: first.getTime(), to: sodPlus(1) };
  }
  if (name === 'month') return { from: sodPlus(-29), to: sodPlus(1) }; // the app's rolling "30 days"
  if (name === 'range') {
    const a = dayStamp(String(body.from ?? ''));
    const b = dayStamp(String(body.to ?? ''));
    if (a !== null && b !== null) return { from: Math.min(a, b), to: Math.max(a, b) + DAY_MS };
  }
  return { from: sodPlus(0), to: sodPlus(1) };
}

const doorSourced = (knock: Row): boolean => String(knock.source ?? 'door') === 'door';

/** One rep's count for one metric, over whatever rows are handed in. */
function metricOf(metric: string, knocks: Row[], appointments: Row[]): number {
  if (metric === 'sat') return appointments.filter((a) => SAT_STATUSES.has(String(a.status ?? ''))).length;
  if (metric === 'signed') return knocks.filter((k) => String(k.status) === 'signed').length;
  if (metric === 'contacts') return knocks.filter((k) => doorSourced(k) && CONTACT_STATUSES.has(String(k.status))).length;
  if (metric === 'appts') return knocks.filter((k) => doorSourced(k) && String(k.status) === 'appointment').length;
  return knocks.filter(doorSourced).length;
}

interface RepStats {
  doors: number;
  appts: number;
  signed: number;
  days_active: number;
  streak: number;
  longest_streak: number;
  best_day: { n: number; day: string } | null;
  best_week: { n: number; week_of: string } | null;
  derby_wins: number;
}

/**
 * A rep's record, computed from their own knocks - nothing is hand-awarded. Each badge declares the
 * number to reach and the number reached, which is also how the "what is next" line is built, so a
 * badge and its progress note can never disagree.
 */
const BADGES: { id: string; label: string; how: string; need: number; of: (s: RepStats) => number }[] = [
  { id: 'first_door', label: 'First door', how: 'Knock your first door', need: 1, of: (s) => s.doors },
  { id: 'doors_50', label: '50 doors', how: 'Knock 50 doors', need: 50, of: (s) => s.doors },
  { id: 'doors_100', label: '100 doors', how: 'Knock 100 doors', need: 100, of: (s) => s.doors },
  { id: 'doors_500', label: '500 doors', how: 'Knock 500 doors', need: 500, of: (s) => s.doors },
  { id: 'doors_1000', label: '1,000 doors', how: 'Knock 1,000 doors', need: 1000, of: (s) => s.doors },
  { id: 'big_day_60', label: 'Big day: 60', how: 'Knock 60 doors in one day', need: 60, of: (s) => s.best_day?.n ?? 0 },
  { id: 'big_day_100', label: 'Big day: 100', how: 'Knock 100 doors in one day', need: 100, of: (s) => s.best_day?.n ?? 0 },
  { id: 'first_appt', label: 'First appointment', how: 'Set your first appointment', need: 1, of: (s) => s.appts },
  { id: 'appts_10', label: '10 appointments', how: 'Set 10 appointments', need: 10, of: (s) => s.appts },
  { id: 'first_signed', label: 'First signed', how: 'Sign your first home', need: 1, of: (s) => s.signed },
  { id: 'streak_3', label: '3-day streak', how: 'Knock 3 days in a row', need: 3, of: (s) => s.longest_streak },
  { id: 'streak_7', label: '7-day streak', how: 'Knock 7 days in a row', need: 7, of: (s) => s.longest_streak },
  { id: 'streak_14', label: '14-day streak', how: 'Knock 14 days in a row', need: 14, of: (s) => s.longest_streak },
  { id: 'week_250', label: '250-door week', how: 'Knock 250 doors in one week', need: 250, of: (s) => s.best_week?.n ?? 0 },
  { id: 'derby_win', label: 'Competition win', how: 'Win a competition', need: 1, of: (s) => s.derby_wins },
];

function repStats(knocks: Row[], derbyWins: number): RepStats {
  const byDay = new Map<string, number>();
  for (const knock of knocks) {
    if (!doorSourced(knock)) continue;
    const when = new Date(String(knock.occurred_at ?? '')).getTime();
    if (!Number.isFinite(when)) continue;
    const key = dayKey(when);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const days = [...byDay.keys()].sort();
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const key of days) {
    const at = dayStamp(key) as number;
    run = previous !== null && at - previous === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = at;
  }

  // A streak survives a day that has not been worked yet, so it counts back from yesterday while
  // today is still empty - which is how a rep would say it out loud.
  let streak = 0;
  let cursor = dayKey(Date.now());
  if (!byDay.has(cursor)) cursor = dayKey(sodPlus(-1));
  while (byDay.has(cursor)) {
    streak += 1;
    cursor = dayKey((dayStamp(cursor) as number) - DAY_MS);
  }

  let bestDay: RepStats['best_day'] = null;
  for (const [day, n] of byDay) if (!bestDay || n > bestDay.n) bestDay = { n, day };

  const byWeek = new Map<string, number>();
  for (const [day, n] of byDay) {
    const d = new Date(dayStamp(day) as number);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    const weekOf = dayKey(d.getTime());
    byWeek.set(weekOf, (byWeek.get(weekOf) ?? 0) + n);
  }
  let bestWeek: RepStats['best_week'] = null;
  for (const [weekOf, n] of byWeek) if (!bestWeek || n > bestWeek.n) bestWeek = { n, week_of: weekOf };

  return {
    doors: knocks.filter(doorSourced).length,
    appts: knocks.filter((k) => doorSourced(k) && String(k.status) === 'appointment').length,
    signed: knocks.filter((k) => String(k.status) === 'signed').length,
    days_active: byDay.size,
    streak,
    longest_streak: longest,
    best_day: bestDay,
    best_week: bestWeek,
    derby_wins: derbyWins,
  };
}

/** Metres between two [lat, lng] pairs - the same spherical law the app uses for "near me". */
function metresBetween(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A rep's display name, derived the same way the roster function derives it. */
function displayName(member: Row): string {
  const email = String(member.email ?? '');
  return String(member.name ?? '') || (email ? email.split('@')[0] : 'Rep');
}

interface OpsState {
  competitions: Row[];
  feed: Row[];
  exports: Row[];
}

/**
 * Competitions, the team feed and the export log, read out of the one JSON key they share. The
 * argument is the d2d_settings ROW, so the scratch key sits at row.settings.ops - one level in
 * from the row itself, which is also where patchOps puts it.
 */
function opsFrom(row: Row): OpsState {
  const settings = (row.settings ?? {}) as Row;
  const ops = (settings.ops ?? {}) as Row;
  const list = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
  return { competitions: list(ops.competitions), feed: list(ops.feed), exports: list(ops.exports) };
}

function feedRow(kind: string, text: string, extra: Row = {}): Row {
  return { kind, text, t: nowIso(), ...extra };
}

/**
 * Practice mode. The app sends "Start the practice: ..." and then the rep's answers. There is no
 * model behind this route, so it does what a ride-along manager does: holds the objection, and
 * answers with the approved line rather than inventing a new one.
 */
function practiceReply(question: string, homes: Row[]): Row {
  const bankrupt = homes.filter((home) => String(home.installer_status) === 'bankrupt').length;
  if (/^start the practice/i.test(question)) {
    return {
      answer:
        'Doorbell rings. The homeowner opens the door looking mildly annoyed: "Yeah? What do you want?" ' +
        'Say your opener. I will tell you what landed and what did not.',
    };
  }
  const words = question.split(/\s+/).filter(Boolean).length;
  const notes: string[] = [];
  if (words < 6) notes.push('That was short. Give them one sentence of context before you ask anything.');
  if (!question.includes('?')) notes.push('You never asked them a question, so the conversation has nowhere to go.');
  if (!/solar|panel|system|installer|warranty|service/i.test(question)) {
    notes.push('Name their solar system in the first sentence - it is the only reason they keep listening.');
  }
  if (/cancel/i.test(question)) notes.push('Never say "cancel your solar" at the door. It ends the conversation.');
  return {
    answer:
      (notes.length ? `${notes.join(' ')}\n\n` : 'That landed. ') +
      `Try it like this: "I want to make sure someone is still looking after the solar work ${
        bankrupt ? 'that installer' : 'they'
      } did - do you know who services it now?" ` +
      'Now they say: "The company that put it in went under. Nobody has called us in a year." Answer that one.',
  };
}

/* Wire shapes ------------------------------------------------------------------------------ */

function toProperty(row: Row): Row {
  return {
    ...row,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    last_knock_at: iso(row.last_knock_at),
    callback_at: iso(row.callback_at),
    appointment_at: iso(row.appointment_at),
    deleted_at: iso(row.deleted_at),
  };
}

function toKnock(row: Row): Row {
  return {
    id: row.id,
    client_id: row.client_id,
    property_id: row.property_id,
    user_id: row.user_id,
    status: row.status,
    note: row.note,
    callback_at: iso(row.callback_at),
    appointment_at: iso(row.appointment_at),
    text_ok: row.text_ok ?? false,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    photo_urls: row.photo_urls ?? [],
    source: row.source ?? 'door',
    created_at: iso(row.occurred_at),
    occurred_at: iso(row.occurred_at),
    received_at: iso(row.received_at),
    synced_at: iso(row.synced_at),
  };
}

function toTerritory(row: Row): Row {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    polygon: row.polygon ?? [],
    assigned_user_ids: row.assigned_user_ids ?? [],
    reknock_days: row.reknock_days,
    team_id: null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function toAppointment(row: Row): Row {
  return {
    id: row.id,
    property_id: row.property_id,
    user_id: row.user_id,
    at: iso(row.at),
    status: row.status ?? 'scheduled',
    note: row.note,
    knock_id: null,
    result: null,
    ghl_event_id: null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function toMessage(row: Row): Row {
  return {
    id: row.id,
    property_id: row.property_id,
    user_id: row.user_id,
    to_user_id: row.to_user_id,
    body: row.body,
    created_at: iso(row.created_at),
  };
}

function toPosition(row: Row): Row {
  return {
    user_id: row.user_id,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    accuracy_m: row.accuracy_m ?? null,
    fix_at: iso(row.fix_at),
    trail: row.trail ?? [],
    updated_at: iso(row.updated_at),
  };
}

function toUser(member: Row, index: number): Row {
  const email = String(member.email ?? '');
  return {
    id: member.id,
    name: member.name || (email ? email.split('@')[0] : 'Rep'),
    email,
    role: roleOf(member.role),
    color: COLORS[index % COLORS.length],
    team_id: null,
    super_admin: String(member.role ?? '').toLowerCase() === 'owner',
  };
}

/* Tokens ----------------------------------------------------------------------------------- */

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function mintToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `dbk_${body}`;
}

/**
 * The list view shows a key it can never recover (only a hash is stored), so it gets the
 * readable prefix plus a mask - never a token, and never the hash.
 */
function maskedKey(prefix: string): string {
  return `${prefix}\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7`;
}

/* The host --------------------------------------------------------------------------------- */

export interface DoorBossHost {
  api(method: string, path: string, body?: unknown, ms?: number): Promise<unknown>;
  config: Record<string, unknown>;
  /** Where this app serves its own static assets (the deck slides live under `<base>/deck/`). */
  assets: { base: string };
}

export interface DoorBossHostOptions {
  /** Overrides merged over the app's own CONFIG by the extractor's seam. */
  config?: Record<string, unknown>;
  /** Where this app serves its own static assets. Defaults to `/d2d`. */
  assetsBase?: string;
}

export function createDoorBossHost(options: DoorBossHostOptions = {}): DoorBossHost {
  let orgPromise: Promise<string | null> | null = null;
  let rosterCache: { at: number; rows: Row[] } | null = null;

  /** Resolved once per session; a failure is not cached, so a later sign-in can recover. */
  async function organizationId(method: string, path: string): Promise<string> {
    if (!orgPromise) orgPromise = resolveOrganizationId();
    const id = await orgPromise;
    if (!id) {
      orgPromise = null;
      fail(
        method,
        path,
        403,
        'this account has no company yet - Door to Door is scoped to a company, so ask an owner to add you',
      );
    }
    return id;
  }

  async function roster(method: string, path: string): Promise<Row[]> {
    if (rosterCache && Date.now() - rosterCache.at < 60_000) return rosterCache.rows;
    const org = await organizationId(method, path);
    const rows = unwrap<Row[]>(
      method,
      path,
      await db.rpc('d2d_company_members', { p_organization_id: org }),
    );
    rosterCache = { at: Date.now(), rows: rows ?? [] };
    return rosterCache.rows;
  }

  /** The app's `settings` object plus the AI config, which lives in its own column. */
  async function settingsRow(method: string, path: string): Promise<Row> {
    const org = await organizationId(method, path);
    const existing = unwrap<Row | null>(
      method,
      path,
      await db.from('d2d_settings').select('*').eq('organization_id', org).maybeSingle(),
    );
    if (existing) return existing;
    return unwrap<Row>(
      method,
      path,
      await db
        .from('d2d_settings')
        .upsert({ organization_id: org }, { onConflict: 'organization_id' })
        .select('*')
        .single(),
    );
  }

  async function patchSettings(method: string, path: string, patch: Row): Promise<Row> {
    const org = await organizationId(method, path);
    return unwrap<Row>(
      method,
      path,
      await db
        .from('d2d_settings')
        .upsert({ organization_id: org, ...patch }, { onConflict: 'organization_id' })
        .select('*')
        .single(),
    );
  }

  /** The app sends `/properties` a list of houses it added while offline; one-by-one is honest. */
  async function pushProperties(method: string, path: string, body: unknown): Promise<Row> {
    const org = await organizationId(method, path);
    const incoming = asArray(body);
    let added = 0;
    let updated = 0;
    let skipped = 0;

    const addresses = incoming
      .map((row) => String(row.address ?? '').trim())
      .filter((address) => address.length > 0);

    // Match on the table's own identity (company + address + zip). The unique index behind it is
    // an expression index, which PostgREST cannot target with on_conflict, so this matches first.
    const existing = addresses.length
      ? unwrap<Row[]>(
          method,
          path,
          await db
            .from('d2d_properties')
            .select('id, address, zip')
            .eq('organization_id', org)
            .in('address', addresses),
        )
      : [];

    const byKey = new Map<string, string>(
      existing.map((row) => [
        `${String(row.address).toLowerCase()}|${String(row.zip ?? '')}`,
        String(row.id),
      ]),
    );

    for (const row of incoming) {
      const address = String(row.address ?? '').trim();
      if (!address) {
        skipped += 1;
        continue;
      }
      const fields = pick(row, PROPERTY_COLUMNS);
      fields.address = address;
      const key = `${address.toLowerCase()}|${String(row.zip ?? '')}`;
      const id = byKey.get(key);

      if (id) {
        // status / last_knock_at belong to the knock trigger; never fight it from here.
        delete fields.status;
        delete fields.last_knock_at;
        delete fields.last_knock_by;
        unwrap(method, path, await db.from('d2d_properties').update(fields).eq('id', id));
        updated += 1;
      } else {
        const inserted = unwrap<Row[]>(
          method,
          path,
          await db
            .from('d2d_properties')
            .insert({ organization_id: org, ...fields })
            .select('id'),
        );
        if (inserted[0]) byKey.set(key, String(inserted[0].id));
        added += 1;
      }
    }

    return { added, updated, skipped };
  }

  /**
   * A follow-up booked at a door is also a Dial Smart follow-up. The knock upload calls this once
   * the knocks are stored: the homeowner becomes a lead and the callback is queued where the dialer
   * already looks, so nobody re-types a doorstep into the CRM.
   *
   * It never throws and never blocks a knock - see enroll.ts for the consent gate, and for why a
   * failure here is not the rep's problem.
   */
  async function syncDoorFollowUps(rows: Row[]): Promise<void> {
    const booked = rows.filter(
      (row) =>
        (String(row.status) === 'callback' && row.callback_at) ||
        (String(row.status) === 'appointment' && row.appointment_at),
    );
    if (!booked.length) return;

    // One row per house, last wins: a batch can carry two knocks for the same door.
    const latest = new Map<string, Row>();
    for (const row of booked) latest.set(String(row.property_id), row);

    const org = await organizationId('POST', '/knocks');
    const auth = await db.auth.getUser();
    const userId = auth.data.user?.id;
    if (!userId) return;

    const res = await db
      .from('d2d_properties')
      .select('id, address, city, state, zip, owner_name, owner_phone, text_ok, dnc')
      .in('id', [...latest.keys()]);
    if (res.error) return;
    const houses = new Map(((res.data ?? []) as Row[]).map((house) => [String(house.id), house]));

    for (const [propertyId, knock] of latest) {
      const house = houses.get(propertyId);
      if (!house) continue;
      await enrollDoorFollowUp(db, {
        organizationId: org,
        userId,
        propertyId,
        address: asText(house.address),
        city: asText(house.city),
        state: asText(house.state),
        zip: asText(house.zip),
        ownerName: asText(house.owner_name),
        ownerPhone: asText(house.owner_phone),
        // The knock carries what the rep tapped; the house carries what the table kept. Either one
        // is consent - a house the rep just spoke to is never skipped over a stale column.
        textOk: knock.text_ok === true || house.text_ok === true,
        dnc: house.dnc === true,
        dueAt: String(knock.callback_at ?? knock.appointment_at),
        note: asText(knock.note),
      }).catch(() => 'failed');
    }
  }

  /** A trimmed string, or null. The d2d tables use '' and null interchangeably for "not set". */
  function asText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }

  /**
   * The knock queue replays rows the phone recorded offline, and it depends on getting a
   * per-row answer: anything it is not told about stays queued. PostgREST reports one error
   * for the whole batch, so a failed batch is reported back row by row and nothing is marked
   * sent. `client_id` is what makes the retry safe - it is UNIQUE on the table.
   */
  async function pushKnocks(method: string, path: string, body: unknown): Promise<Row[]> {
    const org = await organizationId(method, path);
    const incoming = asArray(body).map((row) => {
      const fields = pick(row, KNOCK_COLUMNS);
      fields.organization_id = org;
      fields.occurred_at = iso(row.created_at ?? row.occurred_at) ?? nowIso();
      fields.synced_at = nowIso();
      if (fields.accuracy_m !== undefined && fields.accuracy_m !== null) {
        fields.accuracy_m = Math.round(Number(fields.accuracy_m)) || null;
      }
      return fields;
    });

    if (!incoming.length) return [];

    const res = await db
      .from('d2d_knocks')
      .upsert(incoming, { onConflict: 'client_id', ignoreDuplicates: true })
      .select('id, client_id, synced_at');

    if (res.error) {
      const message = (res.error as { message?: string }).message ?? 'knock upload failed';
      return incoming.map((row) => ({
        client_id: row.client_id,
        failed_client_id: row.client_id,
        error: message,
      }));
    }

    const saved = (res.data ?? []) as Row[];
    const seen = new Set(saved.map((row) => String(row.client_id)));

    // A follow-up booked at a door is also a Dial Smart follow-up: the homeowner becomes a lead and
    // the callback is queued where the dialer already looks. Best effort on purpose, and awaited so
    // it cannot be cut off mid-flight - see syncDoorFollowUps, and enroll.ts for what it writes.
    await syncDoorFollowUps(incoming).catch(() => undefined);

    // A row PostgREST ignored was already on the server under the same client_id, which is a
    // success for the queue: it is safely stored, so confirm it rather than leaving it queued.
    return incoming.map((row) => ({
      id: null,
      client_id: row.client_id,
      synced_at: nowIso(),
      stored: seen.has(String(row.client_id)),
    }));
  }

  /**
   * `/ai/brief` on DoorBoss is a model call. Here it is composed from the house's own record:
   * deterministic, free, and it cannot invent a fact about a customer's home.
   */
  function composeBrief(row: Row | undefined, method: string, path: string): Row {
    if (!row) fail(method, path, 404, 'no such house');
    const property = row as Row;
    const lines: string[] = [];
    const where = [property.address, property.city, property.state].filter(Boolean).join(', ');
    lines.push(`${where}${property.zip ? ` ${property.zip}` : ''}`);

    const owner = [property.owner_name, property.owner_phone].filter(Boolean).join(' - ');
    if (owner) lines.push(`Owner on file: ${owner}`);
    else lines.push('No owner on file yet.');

    const installed = property.installer
      ? `${property.installer}${property.installer_status ? ` (${property.installer_status})` : ''}`
      : 'Installer unknown';
    lines.push(`Installer: ${installed}`);

    if (property.tier && property.tier !== 'none') lines.push(`Tier: ${property.tier}`);
    if (property.system_kw) lines.push(`System: ${property.system_kw} kW`);
    if (property.permit_year) lines.push(`Permit year: ${property.permit_year}`);
    if (property.finance_co) lines.push(`Finance company: ${property.finance_co}`);

    const last = iso(property.last_knock_at);
    lines.push(
      last
        ? `Last knocked ${new Date(last).toLocaleDateString()} (${property.status}).`
        : 'Never knocked.',
    );
    if (property.callback_at) {
      lines.push(`Callback booked for ${new Date(String(property.callback_at)).toLocaleString()}.`);
    }
    if (property.dnc) lines.push('Flagged do not contact - leave this one alone.');
    if (property.text_ok) lines.push('Homeowner agreed to be texted.');

    const headline = last
      ? `${property.status === 'appointment' ? 'Appointment set' : String(property.status)} - ${property.address}`
      : `Not knocked yet - ${property.address}`;

    return { headline, lines };
  }

  /* Performance, competitions, the feed, the area card and the export guard -------------------
   * Everything below answers a route an add-on layer in app/scripts.js calls. The shapes are the
   * app's own - each one is read straight out of the card that consumes it - so a field renamed
   * here shows up as a blank on the board rather than as an error. That is why they are spelled
   * out one by one instead of being built generically.
   */

  async function ops(method: string, path: string): Promise<OpsState> {
    return opsFrom(await settingsRow(method, path));
  }

  async function patchOps(method: string, path: string, next: OpsState): Promise<OpsState> {
    const current = await settingsRow(method, path);
    const settings = { ...((current.settings ?? {}) as Row), ops: next };
    return opsFrom(await patchSettings(method, path, { settings }));
  }

  /** Who is asking. The app hides manager controls from reps; these routes refuse them as well. */
  async function whoIsAsking(
    method: string,
    path: string,
  ): Promise<{ id: string; name: string; role: 'admin' | 'manager' | 'rep'; owner: boolean }> {
    const rows = await roster(method, path);
    const auth = await db.auth.getUser();
    const account = auth.data.user;
    const id = String(account?.id ?? '');
    const mine = rows.find((row) => String(row.id) === id);
    return {
      id,
      name: mine ? displayName(mine) : account?.email ? account.email.split('@')[0] : 'Rep',
      role: roleOf(mine?.role),
      owner: String(mine?.role ?? '').toLowerCase() === 'owner',
    };
  }

  /** Knocks and appointments for one company in a half-open window, in the shape the counters want. */
  async function windowed(
    method: string,
    path: string,
    from: number,
    to: number,
    userId?: string,
  ): Promise<{ knocks: Row[]; appointments: Row[] }> {
    const org = await organizationId(method, path);
    const knockQuery = db
      .from('d2d_knocks')
      .select('user_id, status, source, occurred_at, property_id')
      .eq('organization_id', org)
      .gte('occurred_at', new Date(from).toISOString())
      .lt('occurred_at', new Date(to).toISOString())
      .limit(50000);
    const apptQuery = db
      .from('d2d_appointments')
      .select('user_id, status, at, property_id')
      .eq('organization_id', org)
      .gte('at', new Date(from).toISOString())
      .lt('at', new Date(to).toISOString())
      .limit(50000);
    const knocks = unwrap<Row[]>(method, path, await (userId ? knockQuery.eq('user_id', userId) : knockQuery));
    const appointments = unwrap<Row[]>(method, path, await (userId ? apptQuery.eq('user_id', userId) : apptQuery));
    return { knocks, appointments };
  }

  async function perfBoard(method: string, path: string, body: Row): Promise<Row> {
    const metric = String(body.metric ?? 'doors');
    if (!METRICS.has(metric)) fail(method, path, 400, `unknown metric: ${metric}`);

    const { from, to } = windowRange(body);
    const rows = await roster(method, path);
    const who = await whoIsAsking(method, path);
    const { knocks, appointments } = await windowed(method, path, from, to);

    const knocksBy = new Map<string, Row[]>();
    for (const knock of knocks) {
      const id = String(knock.user_id ?? '');
      const bucket = knocksBy.get(id);
      if (bucket) bucket.push(knock);
      else knocksBy.set(id, [knock]);
    }
    const apptsBy = new Map<string, Row[]>();
    for (const appointment of appointments) {
      const id = String(appointment.user_id ?? '');
      const bucket = apptsBy.get(id);
      if (bucket) bucket.push(appointment);
      else apptsBy.set(id, [appointment]);
    }

    // A cohort is the month a rep joined. Rookies comparing themselves to someone in their fourth
    // year is the fastest way to make a board nobody reads.
    const cohortOf = (member: Row): string => {
      const joined = iso(member.joined_at);
      if (!joined) return '';
      const d = new Date(joined);
      return `${d.getFullYear()}-${d.getMonth()}`;
    };

    const counted = rows.map((member, index) => ({
      id: String(member.id),
      name: displayName(member),
      color: COLORS[index % COLORS.length],
      n: metricOf(metric, knocksBy.get(String(member.id)) ?? [], apptsBy.get(String(member.id)) ?? []),
      cohort: cohortOf(member),
      rank: 0,
    }));

    const me = rows.find((member) => String(member.id) === who.id);
    const myCohort = me ? cohortOf(me) : '';
    const cohortOn = body.cohort === true && myCohort !== '';
    const ranked = (cohortOn ? counted.filter((row) => row.cohort === myCohort) : counted)
      .slice()
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    ranked.forEach((row, index) => {
      row.rank = index + 1;
    });

    const top = ranked.filter((row) => row.n > 0).slice(0, 10);
    const mine = ranked.find((row) => row.id === who.id);
    if (mine && !top.some((row) => row.id === who.id)) top.push(mine);

    return {
      rows: top.map((row) => ({ id: row.id, rank: row.rank, name: row.name, color: row.color, n: row.n, me: row.id === who.id })),
      total: ranked.length,
      cohort: cohortOn,
      cohort_name: me && myCohort ? new Date(String(me.joined_at)).toLocaleDateString([], { month: 'long', year: 'numeric' }) : '',
      as_of: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
  }

  async function perfBadges(method: string, path: string, body: Row): Promise<Row> {
    const who = await whoIsAsking(method, path);
    const wanted = String(body.rep_id ?? '') || who.id;
    if (String(body.rep_id ?? '') && who.role === 'rep') fail(method, path, 403, 'a rep only sees their own record');

    const rows = await roster(method, path);
    const member = rows.find((row) => String(row.id) === wanted);
    const org = await organizationId(method, path);
    const knocks = unwrap<Row[]>(
      method,
      path,
      await db
        .from('d2d_knocks')
        .select('status, source, occurred_at')
        .eq('organization_id', org)
        .eq('user_id', wanted)
        .limit(50000),
    );

    const state = await ops(method, path);
    const wins = state.competitions.filter((c) => String((c.winner as Row | null)?.id ?? '') === wanted).length;
    const stats = repStats(knocks, wins);

    const badges = BADGES.map((spec) => ({
      id: spec.id,
      label: spec.label,
      how: spec.how,
      earned: spec.of(stats) >= spec.need,
    }));
    const next = BADGES.map((spec) => ({ spec, left: spec.need - spec.of(stats) }))
      .filter((entry) => entry.left > 0)
      .sort((a, b) => a.left - b.left)
      .slice(0, 3)
      .map((entry) => `${entry.spec.label} - ${entry.left} to go`);

    return {
      name: member ? displayName(member) : 'Rep',
      badges,
      profile: stats,
      earned: badges.filter((badge) => badge.earned).length,
      next,
    };
  }

  async function perfCompetitions(method: string, path: string): Promise<Row> {
    const state = await ops(method, path);
    if (!state.competitions.length) return { competitions: [] };

    const rows = await roster(method, path);
    const who = await whoIsAsking(method, path);

    const starts = state.competitions.map((c) => new Date(String(c.start ?? '')).getTime()).filter(Number.isFinite);
    const ends = state.competitions.map((c) => new Date(String(c.end ?? '')).getTime()).filter(Number.isFinite);
    const from = starts.length ? Math.min(...starts) : Date.now() - 90 * DAY_MS;
    const to = Math.max(ends.length ? Math.max(...ends) : Date.now(), Date.now());

    const { knocks, appointments } = await windowed(method, path, from, to);

    const competitions: Row[] = [];
    let dirty = false;

    for (const comp of state.competitions) {
      const id = String(comp.id ?? '');
      const start = new Date(String(comp.start ?? '')).getTime();
      const end = new Date(String(comp.end ?? '')).getTime();
      const metric = String(comp.metric ?? 'doors');
      const kind = String(comp.kind ?? 'leaderboard');
      const target = Number(comp.target ?? 0);

      const knocksIn = knocks.filter((k) => {
        const t = new Date(String(k.occurred_at ?? '')).getTime();
        return t >= start && t < end;
      });
      const apptsIn = appointments.filter((a) => {
        const t = new Date(String(a.at ?? '')).getTime();
        return t >= start && t < end;
      });

      const standings = rows
        .map((member, index) => {
          const memberId = String(member.id);
          return {
            id: memberId,
            name: displayName(member),
            color: COLORS[index % COLORS.length],
            n: metricOf(
              metric,
              knocksIn.filter((k) => String(k.user_id) === memberId),
              apptsIn.filter((a) => String(a.user_id) === memberId),
            ),
            rank: 0,
            hit: false,
          };
        })
        .filter((entry) => entry.n > 0);
      standings.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
      standings.forEach((entry, index) => {
        entry.rank = index + 1;
        entry.hit = kind === 'milestone' && entry.n >= target;
      });

      const active = !comp.winner && Date.now() < end;
      let winner = (comp.winner ?? null) as Row | null;
      if (!comp.winner && !active) {
        // Nobody pressed End, so the dates decide it - the same answer the End button would give.
        const first = kind === 'milestone' ? standings.find((entry) => entry.hit) : standings[0];
        winner = first ? { id: first.id, name: first.name } : { id: null, name: 'nobody' };
        dirty = true;
      }

      const mine = standings.find((entry) => entry.id === who.id);
      competitions.push({
        id,
        name: comp.name,
        metric,
        kind,
        target,
        prize: comp.prize ?? '',
        team_only: comp.team_only === true,
        start: comp.start,
        end: comp.end,
        active,
        winner,
        standings: standings.slice(0, 8).map((entry) => ({ id: entry.id, rank: entry.rank, name: entry.name, n: entry.n, hit: entry.hit })),
        my_rank: mine ? mine.rank : null,
      });
    }

    if (dirty) {
      // Write the names in, so the winner is decided once and does not move when the window shifts.
      await patchOps(method, path, {
        ...state,
        competitions: competitions.map((comp) => ({
          ...(state.competitions.find((stored) => String(stored.id) === String(comp.id)) ?? {}),
          winner: comp.winner,
        })),
      });
    }

    return { competitions };
  }

  async function perfCompete(method: string, path: string, body: Row): Promise<Row> {
    const who = await whoIsAsking(method, path);
    if (who.role === 'rep') fail(method, path, 403, 'only a manager can run a competition');

    const state = await ops(method, path);

    if (String(body.action ?? '') === 'end') {
      const id = String(body.id ?? '');
      const comp = state.competitions.find((entry) => String(entry.id) === id);
      if (!comp) fail(method, path, 404, 'no such competition');
      // Bring the end forward; the next read names the winner and writes it down.
      await patchOps(method, path, {
        ...state,
        competitions: state.competitions.map((entry) =>
          String(entry.id) === id ? { ...entry, end: nowIso(), winner: null } : entry,
        ),
      });
      const settled = await perfCompetitions(method, path);
      const ended = (settled.competitions as Row[]).find((entry) => String(entry.id) === id) ?? {};
      const winner = (ended.winner ?? {}) as Row;
      const after = await ops(method, path);
      await patchOps(method, path, {
        ...after,
        feed: [feedRow('winner', `${String(winner.name ?? 'nobody')} won ${String(comp.name ?? 'the competition')}`), ...after.feed].slice(0, 60),
      });
      return { ok: true, competition: ended };
    }

    const name = String(body.name ?? '').trim().slice(0, 60);
    if (name.length < 3) fail(method, path, 400, 'give the competition a name');
    const metric = String(body.metric ?? 'doors');
    if (!METRICS.has(metric)) fail(method, path, 400, `unknown metric: ${metric}`);
    const kind = String(body.kind ?? 'leaderboard') === 'milestone' ? 'milestone' : 'leaderboard';
    const target = Math.max(0, Math.floor(Number(body.target ?? 0) || 0));
    if (kind === 'milestone' && target < 1) fail(method, path, 400, 'give the milestone a target number');
    const days = Math.min(90, Math.max(1, Math.floor(Number(body.days ?? 7) || 7)));

    const competition = {
      id: `c_${Math.random().toString(36).slice(2, 10)}`,
      name,
      metric,
      kind,
      target,
      prize: String(body.prize ?? '').slice(0, 120),
      team_only: String(body.scope ?? '') === 'team',
      // A competition a manager starts at 6pm still means "from the start of today", so the doors
      // knocked this morning count. An exact-second start would silently ignore the day so far.
      start: new Date(startOfDay(Date.now())).toISOString(),
      end: new Date(startOfDay(Date.now()) + days * DAY_MS).toISOString(),
      winner: null,
      created_by: who.id,
    };
    await patchOps(method, path, { ...state, competitions: [competition, ...state.competitions].slice(0, 20) });
    return { ok: true, competition };
  }

  async function perfShout(method: string, path: string, body: Row): Promise<Row> {
    const who = await whoIsAsking(method, path);
    if (who.role === 'rep') fail(method, path, 403, 'only a manager can post to the team feed');
    const text = String(body.text ?? '').trim().slice(0, 200);
    if (!text) fail(method, path, 400, 'nothing to post');
    const state = await ops(method, path);
    await patchOps(method, path, { ...state, feed: [feedRow('shout', text, { by: who.name }), ...state.feed].slice(0, 60) });
    return { ok: true };
  }

  async function perfFeed(method: string, path: string): Promise<Row> {
    const rows = await roster(method, path);
    const state = await ops(method, path);
    const names = new Map(rows.map((member) => [String(member.id), displayName(member)]));

    // Ninety days covers both halves of the card: what happened lately, and each rep's best day. A
    // "personal best" is only claimed inside that window, and the sentence says so.
    const { knocks } = await windowed(method, path, Date.now() - 90 * DAY_MS, Date.now() + DAY_MS);
    const recent = knocks.filter((knock) => {
      const t = new Date(String(knock.occurred_at ?? '')).getTime();
      return t >= Date.now() - 2 * DAY_MS;
    });

    const propertyIds = [...new Set(recent.map((knock) => String(knock.property_id ?? '')).filter(Boolean))];
    const org = await organizationId(method, path);
    const addresses = propertyIds.length
      ? new Map(
          unwrap<Row[]>(
            method,
            path,
            await db.from('d2d_properties').select('id, address').eq('organization_id', org).in('id', propertyIds.slice(0, 400)),
          ).map((property) => [String(property.id), String(property.address ?? '')]),
        )
      : new Map<string, string>();

    const events: Row[] = [];
    for (const knock of recent) {
      const status = String(knock.status);
      if (status !== 'appointment' && status !== 'signed') continue;
      const who = names.get(String(knock.user_id ?? '')) ?? 'A rep';
      const where = addresses.get(String(knock.property_id ?? '')) || 'a home';
      events.push(
        feedRow(status === 'signed' ? 'signed' : 'appointment', status === 'signed' ? `${who} signed ${where}` : `${who} set an appointment at ${where}`, {
          t: iso(knock.occurred_at) ?? nowIso(),
        }),
      );
    }

    const byDay = new Map<string, number>();
    for (const knock of knocks) {
      if (!doorSourced(knock)) continue;
      const t = new Date(String(knock.occurred_at ?? '')).getTime();
      if (!Number.isFinite(t)) continue;
      const key = `${String(knock.user_id ?? '')}|${dayKey(t)}`;
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const bestByUser = new Map<string, number>();
    for (const [key, n] of byDay) {
      const userId = key.split('|')[0];
      bestByUser.set(userId, Math.max(bestByUser.get(userId) ?? 0, n));
    }
    const today = dayKey(Date.now());
    for (const [key, n] of byDay) {
      const [userId, day] = key.split('|');
      if (day !== today || n < 5 || n !== bestByUser.get(userId)) continue;
      events.push(feedRow('personal_best', `${names.get(userId) ?? 'A rep'} knocked ${n} doors - their best day in 90 days`, { t: nowIso() }));
    }

    for (const stored of state.feed) events.push(stored);
    events.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    return { events: events.slice(0, 40) };
  }

  async function perfRisk(method: string, path: string): Promise<Row> {
    const who = await whoIsAsking(method, path);
    if (who.role === 'rep') fail(method, path, 403, 'only a manager sees who needs a call');

    const rows = await roster(method, path);
    const { knocks } = await windowed(method, path, Date.now() - 35 * DAY_MS, Date.now() + DAY_MS);
    const dow = (new Date(startOfDay(Date.now())).getDay() + 6) % 7;
    const weekStart = sodPlus(-dow);

    const atRisk: Row[] = [];
    for (const member of rows) {
      const id = String(member.id);
      const mine = knocks.filter((knock) => String(knock.user_id) === id && doorSourced(knock));
      if (!mine.length) continue;

      const times = mine.map((knock) => new Date(String(knock.occurred_at ?? '')).getTime()).filter(Number.isFinite);
      if (!times.length) continue;
      const last = Math.max(...times);
      const thisWeek = times.filter((t) => t >= weekStart).length;
      const usual = Math.round(times.filter((t) => t >= weekStart - 28 * DAY_MS && t < weekStart).length / 4);

      const flags: string[] = [];
      // A rep with no prior week to compare against is new, not slumping.
      if (usual > 0 && Date.now() - last > 48 * 3_600_000) flags.push('dark 48 h');
      if (usual >= 20 && thisWeek < usual * 0.6) flags.push('slumping');
      if (!flags.length) continue;

      atRisk.push({ id, name: displayName(member), flags, this_week: thisWeek, usual_week: usual });
    }

    atRisk.sort((a, b) => Number(b.usual_week) - Number(a.usual_week));
    return { at_risk: atRisk, checked: rows.length };
  }

  async function perfPace(method: string, path: string, body: Row): Promise<Row> {
    const who = await whoIsAsking(method, path);
    const goals = { ...GOAL_DEFAULTS, ...((body.goals ?? {}) as Row) };
    const { knocks } = await windowed(method, path, sodPlus(0), sodPlus(1), who.id);

    const done: Record<string, number> = {
      doors: metricOf('doors', knocks, []),
      contacts: metricOf('contacts', knocks, []),
      appts: metricOf('appts', knocks, []),
    };
    const goal: Record<string, number> = {
      doors: Math.max(1, Number(goals.daily_knocks) || GOAL_DEFAULTS.daily_knocks),
      contacts: Math.max(1, Number(goals.daily_contacts) || GOAL_DEFAULTS.daily_contacts),
      appts: Math.max(1, Number(goals.daily_appts) || GOAL_DEFAULTS.daily_appts),
    };

    // Pace is measured against a canvassing day, 8am to 8pm, so "behind" means behind the day and
    // not behind a clock that started at midnight.
    const dayStart = new Date(startOfDay(Date.now()));
    dayStart.setHours(8, 0, 0, 0);
    const dayEnd = new Date(startOfDay(Date.now()));
    dayEnd.setHours(20, 0, 0, 0);
    const now = Date.now();
    const hoursLeft = Math.max(0, Math.round(((dayEnd.getTime() - now) / 3_600_000) * 10) / 10);
    const elapsed = Math.min(1, Math.max(0, (now - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())));

    const pace: Row = {};
    for (const key of ['doors', 'contacts', 'appts']) {
      const target = goal[key];
      const reached = done[key];
      const status = reached >= target ? 'ahead' : reached >= target * elapsed ? 'on pace' : 'behind';
      pace[key] = {
        done: reached,
        goal: target,
        status,
        need_per_hour: status === 'behind' && hoursLeft > 0 ? Math.ceil(((target - reached) / hoursLeft) * 10) / 10 : null,
      };
    }

    return { day: new Date().toLocaleDateString([], { weekday: 'long' }), hours_left: hoursLeft, pace };
  }

  async function billingUsage(method: string, path: string): Promise<Row> {
    const who = await whoIsAsking(method, path);
    if (who.role !== 'admin') fail(method, path, 403, 'only an admin sees usage');

    const rows = await roster(method, path);
    // Nothing in this pack is metered today, so the only quantity worth reporting is seats - and
    // they are not billed. Real metering is a change on Dial Smart's side, not in this file.
    return {
      month: new Date().toLocaleDateString([], { month: 'long', year: 'numeric' }),
      plans: { default: { name: 'Included' } },
      enforce: false,
      rows: [{ team: 'company', kind: 'seat', qty: rows.length, billable_usd: 0 }],
      total_billable_usd: 0,
      total_our_cost_usd: 0,
    };
  }

  async function areaPlan(method: string, path: string, body: Row): Promise<Row> {
    const who = await whoIsAsking(method, path);
    if (who.role === 'rep') fail(method, path, 403, 'only a manager sees the area card');

    const zip = String(body.zip ?? '').replace(/\D/g, '').slice(0, 5);
    if (zip.length !== 5) fail(method, path, 400, 'type a 5-digit ZIP');
    const orphanedOnly = body.orphaned_only !== false;

    const org = await organizationId(method, path);
    const homes = unwrap<Row[]>(
      method,
      path,
      await db
        .from('d2d_properties')
        .select('id, owner_phone, installer_status')
        .eq('organization_id', org)
        .eq('zip', zip)
        .is('deleted_at', null)
        .limit(20000),
    );

    const noPhone = homes.filter((home) => !String(home.owner_phone ?? '').trim());
    const orphaned = noPhone.filter((home) => String(home.installer_status ?? '') === 'bankrupt');
    const wanted = orphanedOnly ? orphaned.length : noPhone.length;

    // Skip tracing needs an address-to-cell provider and this pack has none wired up. The card gets
    // the real counts and is told plainly why the button is not offered - better than a button that
    // fails, and better than a phone number that was never bought.
    // Three honest answers: there is something to trace, there are un-phoned homes but none of
    // them are the orphaned ones being filtered for, or the ZIP really is fully covered.
    let note: string;
    if (wanted > 0) {
      note = `${wanted} home${wanted === 1 ? '' : 's'} could be traced, but skip tracing is not wired into this app yet.`;
    } else if (noPhone.length > 0) {
      note = `${noPhone.length} home${noPhone.length === 1 ? '' : 's'} have no phone, but none of them have a bankrupt installer.`;
    } else {
      note = 'Every home in this ZIP already has a phone on file.';
    }

    return {
      zip,
      homes: homes.length,
      no_phone: noPhone.length,
      orphaned_no_phone: orphaned.length,
      will_trace: 0,
      est_cost: 0,
      cap_left: 0,
      note,
    };
  }

  async function auditRecord(method: string, path: string, body: Row): Promise<Row> {
    const who = await whoIsAsking(method, path);
    const state = await ops(method, path);
    const entry = {
      t: nowIso(),
      rep: who.name,
      file: String(body.file ?? '').slice(0, 60),
      rows: Math.max(0, Math.floor(Number(body.rows ?? 0) || 0)),
      refused: !who.owner,
    };
    await patchOps(method, path, { ...state, exports: [entry, ...state.exports].slice(0, 50) });
    // The export log is a record, not a gate: the app refuses a non-owner locally, and this agrees
    // with it so the log cannot claim an export that did not happen.
    return { ok: !entry.refused, refused: entry.refused };
  }

  /**
   * The Ask panel. The app's own Me-tab coach already answers from the rep's numbers with no model
   * in the loop (scripts.js:1744 says so in as many words), and this does the same thing for the
   * same reason: a canvasser asking "which installers went under" wants the count that is in the
   * database, not a sentence that might be about a different company's doors.
   */
  async function ask(method: string, path: string, body: Row): Promise<Row> {
    const who = await whoIsAsking(method, path);
    const question = String(body.question ?? '').trim().slice(0, 500);
    const mode = String(body.mode ?? '');
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const here: [number, number] | null =
      Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? [lat, lng] : null;

    const org = await organizationId(method, path);
    const homes = unwrap<Row[]>(
      method,
      path,
      await db
        .from('d2d_properties')
        .select('id, address, lat, lng, status, installer, installer_status, owner_phone, zip, tier')
        .eq('organization_id', org)
        .is('deleted_at', null)
        .limit(20000),
    );

    if (mode === 'practice') return practiceReply(question, homes);

    const near = (radiusM: number) =>
      here
        ? homes.filter(
            (home) => home.lat != null && home.lng != null && metresBetween(here, [Number(home.lat), Number(home.lng)]) <= radiusM,
          )
        : [];

    if (/\broute\b|\bwalk\b|\bmap out\b/i.test(question)) {
      if (!here) return { answer: 'Turn on GPS (the pill at the top) and I will lay out a walking route from where you are standing.' };
      const inReach = near(800).filter((home) => String(home.status) !== 'do_not_knock');
      if (!inReach.length) return { answer: 'No doors left to knock within half a mile of you.' };
      return {
        answer: `${inReach.length} doors within half a mile. Tap Plan the route and I will put the closest ${Math.min(12, inReach.length)} in walking order.`,
        action: { type: 'map', where: 'near', radius_m: 800, limit: 12, filter: 'knockable_bankrupt', route: true },
      };
    }

    if (/\bhow many\b|\bwithin\b|\bnear(?:by| me)?\b|\bhalf a mile\b|\bhow far\b/i.test(question)) {
      if (!here) return { answer: 'Turn on GPS and I will count the doors around you.' };
      // "half a mile" contains "a mile", so half has to be tested before one.
      const miles = /quarter/i.test(question)
        ? 0.25
        : /\bhalf (?:a )?mile\b/i.test(question)
          ? 0.5
          : /\b(?:one|1|a) mile\b/i.test(question)
            ? 1
            : 0.5;
      const radius = Math.round(miles * 1609.34);
      const inReach = near(radius);
      const knockable = inReach.filter((home) => ['unknocked', 'not_home', 'callback', 'interested'].includes(String(home.status)));
      const bankrupt = inReach.filter((home) => String(home.installer_status) === 'bankrupt');
      return {
        answer: `${inReach.length} homes within ${miles} mile${miles === 1 ? '' : 's'} of you. ${knockable.length} are still knockable and ${bankrupt.length} have a bankrupt installer.`,
        action: { type: 'map', where: 'near', radius_m: radius, limit: 12, filter: 'knockable_bankrupt' },
      };
    }

    if (/bankrupt|installer|went under|out of business|orphan/i.test(question)) {
      const bankrupt = homes.filter((home) => String(home.installer_status) === 'bankrupt');
      const byInstaller = new Map<string, number>();
      for (const home of bankrupt) {
        const name = String(home.installer ?? '').trim() || 'Unknown installer';
        byInstaller.set(name, (byInstaller.get(name) ?? 0) + 1);
      }
      const top = [...byInstaller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const unknocked = bankrupt.filter((home) => String(home.status) === 'unknocked').length;
      return {
        answer:
          `${bankrupt.length} homes in your data have a bankrupt installer; ${unknocked} of them have not been knocked yet.` +
          (top.length ? ` Biggest: ${top.map(([name, count]) => `${name} (${count})`).join(', ')}.` : ''),
      };
    }

    if (/pitch|what (?:do i|should i) say|script|opener|opening/i.test(question)) {
      const byInstaller = new Map<string, number>();
      for (const home of homes.filter((entry) => String(entry.installer_status) === 'bankrupt')) {
        const name = String(home.installer ?? '').trim() || 'the original installer';
        byInstaller.set(name, (byInstaller.get(name) ?? 0) + 1);
      }
      const topInstaller = [...byInstaller.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        answer: topInstaller
          ? `Most of your orphaned-installer homes are ${topInstaller[0]} (${topInstaller[1]} homes). Open with the fact, not the offer: "I want to make sure someone is still looking after the solar work ${topInstaller[0]} did - do you know who services it now?" For homes with a permit and no panels: "Are you still paying for a system that never got turned on?" Then book a 20-minute contract review. Never say "cancel your solar" at the door.`
          : 'No orphaned-installer homes in your data. Open by asking how their solar system is working and who looks after it now, then book the review.',
      };
    }

    if (/how am i|my (?:numbers|stats|day)|today|how many (?:doors|contacts|appointments|appts|signed)|how did i do/i.test(question)) {
      const { knocks, appointments } = await windowed(method, path, sodPlus(0), sodPlus(1), who.id);
      const doors = metricOf('doors', knocks, []);
      const contacts = metricOf('contacts', knocks, []);
      const set = metricOf('appts', knocks, []);
      const sat = metricOf('sat', [], appointments);
      const signed = metricOf('signed', knocks, []);
      return { answer: `Today: ${doors} doors, ${contacts} contacts, ${set} appointment${set === 1 ? '' : 's'} set, ${sat} sat, ${signed} signed.` };
    }

    return {
      answer:
        'I can answer from your own doors: how many are within half a mile, which installers went under, what your numbers are today, what to say at the door, and I can map out a walking route. Try "how many doors within half a mile".',
    };
  }

  async function api(method: string, path: string, body?: unknown): Promise<unknown> {
    const verb = String(method || 'GET').toUpperCase();
    const split = path.indexOf('?');
    const route = split < 0 ? path : path.slice(0, split);
    const query = new URLSearchParams(split < 0 ? '' : path.slice(split + 1));
    const parts = route.split('/').filter(Boolean);
    const head = parts[0] ?? '';

    switch (head) {
      /* Identity ---------------------------------------------------------------------------- */
      case 'me': {
        if (parts[1] === 'ai') {
          if (verb === 'PUT') {
            const incoming = asArray(body)[0] ?? {};
            const current = await settingsRow(verb, path);
            const stored = (current.ai ?? {}) as Row;
            const key = String(incoming.key ?? '');
            // The app sends back the mask it rendered when the rep did not retype the key.
            const nextKey = key.startsWith('\u2022') ? String(stored.key ?? '') : key;
            const row = await patchSettings(verb, path, {
              ai: { ...AI_DEFAULTS, ...stored, provider: incoming.provider ?? 'company', key: nextKey },
            });
            return row.ai ?? AI_DEFAULTS;
          }
          const current = await settingsRow(verb, path);
          return { ...AI_DEFAULTS, ...((current.ai ?? {}) as Row) };
        }

        const rows = await roster(verb, path);
        const auth = await db.auth.getUser();
        const account = auth.data.user;
        const mine = rows.find((row) => String(row.id) === String(account?.id ?? ''));
        if (mine) return toUser(mine, rows.indexOf(mine));
        if (!account) fail(verb, path, 401, 'not signed in');
        return {
          id: account.id,
          name: account.email ? account.email.split('@')[0] : 'Rep',
          email: account.email ?? '',
          role: 'rep',
          color: COLORS[0],
          team_id: null,
          super_admin: false,
        };
      }

      case 'users': {
        if (verb === 'GET') {
          const rows = await roster(verb, path);
          return rows.map((row, index) => toUser(row, index));
        }
        // Adding a rep is a company membership change, which belongs to the Dial Smart team
        // screen and not to this pack, so it is refused rather than half-done.
        return fail(
          verb,
          path,
          403,
          'reps are added from Dial Smart\u2019s team screen, not from Door to Door',
        );
      }

      /* Settings and goals ------------------------------------------------------------------- */
      case 'settings': {
        if (verb === 'GET') {
          const row = await settingsRow(verb, path);
          // `ops` is this file's own scratch key (competitions, feed, export log). It is not part
          // of the settings object the app reads, so it is dropped rather than spread out.
          const settings = { ...((row.settings ?? {}) as Row) };
          delete settings.ops;
          return {
            heartbeat: true,
            ai: { ...AI_DEFAULTS, ...((row.ai ?? {}) as Row) },
            apiKeys: [],
            webhooks: [],
            ...settings,
          };
        }
        const patch = asArray(body)[0] ?? {};
        const row = await patchSettings(verb, path, { settings: patch });
        return row.settings ?? {};
      }

      case 'goals': {
        if (verb === 'GET') {
          const row = await settingsRow(verb, path);
          return { ...GOAL_DEFAULTS, ...((row.goals ?? {}) as Row) };
        }
        const patch = asArray(body)[0] ?? {};
        const row = await patchSettings(verb, path, { goals: patch });
        return row.goals ?? {};
      }

      /* The canvassing data ------------------------------------------------------------------- */
      case 'properties': {
        if (verb === 'POST') return pushProperties(verb, path, body);
        const org = await organizationId(verb, path);
        let q = db
          .from('d2d_properties')
          .select('*')
          .eq('organization_id', org)
          .is('deleted_at', null)
          .order('updated_at', { ascending: true })
          .limit(5000);
        const since = query.get('since');
        if (since) q = q.gt('updated_at', since);
        const rows = unwrap<Row[]>(verb, path, await q);
        return rows.map(toProperty);
      }

      case 'knocks': {
        if (verb === 'POST') return pushKnocks(verb, path, body);
        const org = await organizationId(verb, path);
        let q = db
          .from('d2d_knocks')
          .select('*')
          .eq('organization_id', org)
          .order('occurred_at', { ascending: true })
          .limit(20000);
        const from = query.get('from');
        if (from) q = q.gte('occurred_at', from);
        const rows = unwrap<Row[]>(verb, path, await q);
        return rows.map(toKnock);
      }

      case 'territories': {
        if (verb === 'GET') {
          const org = await organizationId(verb, path);
          const rows = unwrap<Row[]>(
            verb,
            path,
            await db.from('d2d_territories').select('*').eq('organization_id', org),
          );
          return rows.map(toTerritory);
        }

        const org = await organizationId(verb, path);

        if (parts[2] === 'claim') {
          const id = parts[1];
          const current = unwrap<Row | null>(
            verb,
            path,
            await db.from('d2d_territories').select('assigned_user_ids').eq('id', id).maybeSingle(),
          );
          if (!current) fail(verb, path, 404, 'no such territory');
          const auth = await db.auth.getUser();
          const who = String(auth.data.user?.id ?? '');
          const list = Array.isArray(current.assigned_user_ids)
            ? (current.assigned_user_ids as unknown[]).map(String)
            : [];
          if (who && !list.includes(who)) list.push(who);
          const row = unwrap<Row>(
            verb,
            path,
            await db
              .from('d2d_territories')
              .update({ assigned_user_ids: list })
              .eq('id', id)
              .select('*')
              .single(),
          );
          return toTerritory(row);
        }

        if (verb === 'DELETE') {
          unwrap(verb, path, await db.from('d2d_territories').delete().eq('id', parts[1]));
          return null;
        }

        const fields = pick(asArray(body)[0] ?? {}, TERRITORY_COLUMNS);
        const row = unwrap<Row>(
          verb,
          path,
          await db
            .from('d2d_territories')
            .insert({ organization_id: org, ...fields })
            .select('*')
            .single(),
        );
        return toTerritory(row);
      }

      case 'appointments': {
        const org = await organizationId(verb, path);

        if (verb === 'GET') {
          let q = db
            .from('d2d_appointments')
            .select('*')
            .eq('organization_id', org)
            .order('at', { ascending: true })
            .limit(5000);
          const from = query.get('from');
          if (from) q = q.gte('at', from);
          const rows = unwrap<Row[]>(verb, path, await q);
          return rows.map(toAppointment);
        }

        // POST /appointments/:id - the rep records what happened at the appointment.
        const id = parts[1];
        if (!id) fail(verb, path, 400, 'appointment id is required');
        const incoming = asArray(body)[0] ?? {};
        const fields = pick(incoming, ['at', 'status', 'note']);
        if (fields.at !== undefined) fields.at = iso(fields.at);
        const row = unwrap<Row>(
          verb,
          path,
          await db.from('d2d_appointments').update(fields).eq('id', id).select('*').single(),
        );
        return toAppointment(row);
      }

      case 'messages': {
        const org = await organizationId(verb, path);

        if (verb === 'GET') {
          let q = db
            .from('d2d_messages')
            .select('*')
            .eq('organization_id', org)
            .order('created_at', { ascending: true })
            .limit(2000);
          const property = query.get('property');
          if (property) q = q.eq('property_id', property);
          const rows = unwrap<Row[]>(verb, path, await q);
          return rows.map(toMessage);
        }

        const incoming = asArray(body)[0] ?? {};
        const auth = await db.auth.getUser();
        const fields = pick(incoming, MESSAGE_COLUMNS);
        fields.user_id = incoming.user_id ?? auth.data.user?.id ?? null;
        const row = unwrap<Row>(
          verb,
          path,
          await db
            .from('d2d_messages')
            .insert({ organization_id: org, ...fields })
            .select('*')
            .single(),
        );
        return toMessage(row);
      }

      /* Where everyone is ---------------------------------------------------------------------- */
      case 'positions': {
        const org = await organizationId(verb, path);

        if (parts[1]) {
          // /positions/:user?day= - the breadcrumb trail behind one rep.
          const row = unwrap<Row | null>(
            verb,
            path,
            await db
              .from('d2d_positions')
              .select('trail')
              .eq('organization_id', org)
              .eq('user_id', parts[1])
              .maybeSingle(),
          );
          const trail = Array.isArray(row?.trail) ? (row?.trail as Row[]) : [];
          const day = query.get('day');
          const points = trail
            .map((point) => ({
              at: iso(point.at),
              lat: point.lat ?? null,
              lng: point.lng ?? null,
              accuracy_m: point.accuracy_m ?? point.accuracy ?? null,
            }))
            .filter((point) => point.at !== null);
          if (!day) return points;
          return points.filter((point) => String(point.at).slice(0, 10) === day);
        }

        const rows = unwrap<Row[]>(
          verb,
          path,
          await db.from('d2d_positions').select('*').eq('organization_id', org),
        );
        return rows.map(toPosition);
      }

      case 'heartbeat': {
        const org = await organizationId(verb, path);
        const auth = await db.auth.getUser();
        const incoming = asArray(body)[0] ?? {};
        const fields = pick(incoming, POSITION_COLUMNS);
        fields.user_id = incoming.user_id ?? auth.data.user?.id;
        fields.fix_at = iso(incoming.fix_at) ?? nowIso();
        if (fields.accuracy_m !== undefined && fields.accuracy_m !== null) {
          fields.accuracy_m = Number(fields.accuracy_m) || null;
        }
        unwrap(
          verb,
          path,
          await db
            .from('d2d_positions')
            .upsert({ organization_id: org, ...fields }, { onConflict: 'organization_id,user_id' }),
        );
        return { ok: true };
      }

      /* Keys and webhooks ---------------------------------------------------------------------- */
      case 'keys': {
        const org = await organizationId(verb, path);

        if (verb === 'GET') {
          const rows = unwrap<Row[]>(
            verb,
            path,
            await db
              .from('d2d_api_keys')
              .select('id, label, prefix, created_at, last_used_at, revoked_at')
              .eq('organization_id', org)
              .is('revoked_at', null)
              .order('created_at', { ascending: false }),
          );
          return rows.map((row) => ({
            id: row.id,
            label: row.label,
            key: maskedKey(String(row.prefix ?? '')),
            prefix: row.prefix,
            created_at: iso(row.created_at),
            last_used_at: iso(row.last_used_at),
          }));
        }

        if (verb === 'DELETE') {
          unwrap(
            verb,
            path,
            await db
              .from('d2d_api_keys')
              .update({ revoked_at: nowIso() })
              .eq('id', parts[1])
              .eq('organization_id', org),
          );
          return null;
        }

        const incoming = asArray(body)[0] ?? {};
        const token = mintToken();
        const auth = await db.auth.getUser();
        const row = unwrap<Row>(
          verb,
          path,
          await db
            .from('d2d_api_keys')
            .insert({
              organization_id: org,
              user_id: incoming.user_id ?? auth.data.user?.id ?? null,
              label: incoming.label ?? 'Key',
              prefix: token.slice(0, 12),
              token_hash: await sha256Hex(token),
            })
            .select('id, label, prefix, created_at')
            .single(),
        );
        // The only time the token itself ever leaves this function.
        return { id: row.id, label: row.label, key: token, created_at: iso(row.created_at) };
      }

      case 'webhooks': {
        const org = await organizationId(verb, path);

        if (verb === 'GET') {
          const rows = unwrap<Row[]>(
            verb,
            path,
            await db
              .from('d2d_webhooks')
              .select('*')
              .eq('organization_id', org)
              .order('created_at', { ascending: false }),
          );
          return rows.map((row) => ({
            id: row.id,
            url: row.url,
            events: row.events ?? [],
            active: row.active ?? true,
            created_at: iso(row.created_at),
          }));
        }

        if (verb === 'DELETE') {
          unwrap(
            verb,
            path,
            await db.from('d2d_webhooks').delete().eq('id', parts[2]).eq('organization_id', org),
          );
          return null;
        }

        const fields = pick(asArray(body)[0] ?? {}, WEBHOOK_COLUMNS);
        const row = unwrap<Row>(
          verb,
          path,
          await db
            .from('d2d_webhooks')
            .insert({ organization_id: org, ...fields })
            .select('*')
            .single(),
        );
        return { id: row.id, url: row.url, events: row.events ?? [], active: row.active ?? true };
      }

      /* Performance, competitions, the feed, the area card and the export guard ------------------ */
      case 'perf': {
        const sub = parts[1] ?? '';
        if (sub === 'board') return perfBoard(verb, path, asArray(body)[0] ?? {});
        if (sub === 'badges') return perfBadges(verb, path, asArray(body)[0] ?? {});
        if (sub === 'competitions') return perfCompetitions(verb, path);
        if (sub === 'compete') return perfCompete(verb, path, asArray(body)[0] ?? {});
        if (sub === 'shout') return perfShout(verb, path, asArray(body)[0] ?? {});
        if (sub === 'feed') return perfFeed(verb, path);
        if (sub === 'risk') return perfRisk(verb, path);
        if (sub === 'pace') return perfPace(verb, path, asArray(body)[0] ?? {});
        fail(verb, path, 404, `Door to Door has no route for ${route}`);
        break;
      }

      case 'area': {
        const sub = parts[1] ?? '';
        if (sub === 'plan') return areaPlan(verb, path, asArray(body)[0] ?? {});
        // Skip tracing has no provider in this pack, so the card is told rather than left to spin.
        if (sub === 'trace') fail(verb, path, 400, 'skip tracing is not wired into this app yet');
        if (sub === 'jobs') return { jobs: [] };
        fail(verb, path, 404, `Door to Door has no route for ${route}`);
        break;
      }

      case 'billing': {
        if (parts[1] === 'usage') return billingUsage(verb, path);
        fail(verb, path, 404, `Door to Door has no route for ${route}`);
        break;
      }

      case 'audit': {
        if (parts[1] === 'exports') return { items: (await ops(verb, path)).exports.slice(0, 10) };
        if (parts[1] === 'export') return auditRecord(verb, path, asArray(body)[0] ?? {});
        fail(verb, path, 404, `Door to Door has no route for ${route}`);
        break;
      }

      case 'ask': {
        return ask(verb, path, asArray(body)[0] ?? {});
      }

      /* The call panel ------------------------------------------------------------------------ */
      /* The video call window is not in this pack (the app opens it only when the host exposes
         `video`), but the panel around it still asks four things, so they are answered here rather
         than left to reach the DoorBoss service. */
      case 'video': {
        const sub = parts[1] ?? '';
        if (sub === 'recordings') return { recordings: [] };
        if (sub === 'room') return { ok: true };
        if (sub === 'recording') fail(verb, path, 400, 'recordings are not wired into this app yet');
        if (sub === 'complete') fail(verb, path, 400, 'the intake record is not wired into this app yet');
        fail(verb, path, 404, `Door to Door has no route for ${route}`);
        break;
      }

      /* Side doors ---------------------------------------------------------------------------- */
      case 'push': {
        // The app registers a push subscription so reminders fire while it is closed. Dial Smart
        // has no push worker for this pack yet, so it is accepted and parked rather than faked.
        return { ok: false, reason: 'push is not wired up for this pack yet' };
      }

      case 'ai': {
        const org = await organizationId(verb, path);
        const propertyId = String(asArray(body)[0]?.property_id ?? '');
        if (!propertyId) fail(verb, path, 400, 'property_id is required');
        const row = unwrap<Row | null>(
          verb,
          path,
          await db
            .from('d2d_properties')
            .select('*')
            .eq('id', propertyId)
            .eq('organization_id', org)
            .maybeSingle(),
        );
        return composeBrief(row ?? undefined, verb, path);
      }

      default:
        fail(verb, path, 404, `Door to Door has no route for ${route}`);
    }

    fail(verb, path, 500, 'unreachable');
  }

  return {
    api,
    /**
     * Merged over the app's own CONFIG by the extractor's seam. The service worker is switched off
     * because this runs inside Dial Smart's own bundle (a worker registered here would cache the whole
     * app), the intake button is off because that route is not in this pack, and the after-call writer
     * is off for the same reason - it posts the case file to that intake route.
     */
    config: {
      noServiceWorker: true,
      intakeStart: false,
      afterCall: false,
      ghl: false,   // GoHighLevel is optional: true only for a client who runs on GHL
      ...options.config,
    },

    /**
     * Where this app serves its own static assets. The vendored app builds its deck slide URLs
     * from this, so the pitch deck is served by Dial Smart instead of the DoorBoss service.
     */
    assets: {
      base: options.assetsBase || '/d2d',
    },
  };
}

export default createDoorBossHost;
