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
}

export interface DoorBossHostOptions {
  /** Overrides merged over the app's own CONFIG by the extractor's seam. */
  config?: Record<string, unknown>;
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
          return {
            heartbeat: true,
            ai: { ...AI_DEFAULTS, ...((row.ai ?? {}) as Row) },
            apiKeys: [],
            webhooks: [],
            ...((row.settings ?? {}) as Row),
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
     * Merged over the app's own CONFIG by the extractor's seam. The service worker is switched
     * off because this runs inside Dial Smart's own bundle - a worker registered here would
     * cache the whole app - and the intake button is off because that route is not in this pack.
     */
    config: {
      noServiceWorker: true,
      intakeStart: false,
      ...options.config,
    },
  };
}

export default createDoorBossHost;
