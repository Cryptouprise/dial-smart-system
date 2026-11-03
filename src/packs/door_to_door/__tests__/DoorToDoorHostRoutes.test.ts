import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The 15 routes the add-on layers call were answered from scratch in host.ts (perf, area, ask,
 * audit, billing). Typecheck cannot tell whether a leaderboard ranks the right way, so this drives
 * the real host against a small fake Supabase and checks the arithmetic and the refusals.
 *
 * The fixtures are shaped like real rows: two reps who joined the same month, a third who has gone
 * quiet, and knocks that mix door-sourced rows with a row written back from GHL - because treating
 * that write-back as a door is the one mistake the app's own counting is careful to avoid.
 */

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };

interface Query extends PromiseLike<Result> {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: unknown): Query;
  in(column: string, values: readonly unknown[]): Query;
  gt(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lt(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(count: number): Query;
  single(): Promise<Result>;
  maybeSingle(): Promise<Result>;
  insert(values: Row): Query;
  upsert(values: Row | Row[], options?: { onConflict?: string }): Query;
  update(values: Row): Query;
  delete(): Query;
}

const ORG = 'org-1';

const { fake, reset, signInAs } = vi.hoisted(() => {
  const HOUR = 3_600_000;
  const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

  const tables: Record<string, Row[]> = {};
  let current: { id: string; email: string } = { id: 'user-1', email: 'dana@example.com' };

  const roster = () => [
    { id: 'user-1', name: 'Dana', email: 'dana@example.com', role: 'owner', joined_at: '2026-01-05T00:00:00.000Z' },
    { id: 'user-2', name: 'Marcus', email: 'marcus@example.com', role: 'rep', joined_at: '2026-01-20T00:00:00.000Z' },
    { id: 'user-3', name: 'Priya', email: 'priya@example.com', role: 'rep', joined_at: '2026-01-20T00:00:00.000Z' },
  ];

  const knock = (user: string, property: string, status: string, source: string, occurred: string): Row => ({
    organization_id: ORG,
    user_id: user,
    property_id: property,
    status,
    source,
    occurred_at: occurred,
  });

  const home = (id: string, address: string, lat: number, lng: number, installer?: string, zip?: string): Row => ({
    organization_id: ORG,
    id,
    address,
    lat,
    lng,
    status: 'unknocked',
    installer: installer ?? null,
    installer_status: installer ? 'bankrupt' : null,
    owner_phone: null,
    zip: zip ?? null,
    deleted_at: null,
  });

  function build(): Record<string, Row[]> {
    const knocks: Row[] = [
      // Dana, today: three door-sourced knocks, one of them the appointment.
      knock('user-1', 'prop-1', 'unknocked', 'door', ago(3)),
      knock('user-1', 'prop-2', 'not_home', 'door', ago(2.5)),
      knock('user-1', 'prop-3', 'appointment', 'door', ago(2)),
      // A row written back from GHL. It is a signing, but it is not a door.
      knock('user-1', 'prop-4', 'signed', 'ghl', ago(1.5)),
      // Marcus, today: five doors, nothing else.
      knock('user-2', 'prop-5', 'not_home', 'door', ago(4)),
      knock('user-2', 'prop-6', 'not_home', 'door', ago(3.8)),
      knock('user-2', 'prop-7', 'not_home', 'door', ago(3.6)),
      knock('user-2', 'prop-8', 'not_home', 'door', ago(3.4)),
      knock('user-2', 'prop-9', 'not_home', 'door', ago(3.2)),
      // Priya: a steady 24 doors a week for a month, then almost nothing.
      knock('user-3', 'prop-20', 'not_home', 'door', ago(5)),
      knock('user-3', 'prop-21', 'not_home', 'door', ago(4.5)),
    ];
    for (let week = 1; week <= 4; week += 1) {
      for (let i = 0; i < 24; i += 1) {
        knocks.push(knock('user-3', `prop-${100 + week * 24 + i}`, 'not_home', 'door', ago(week * 168 + i * 0.1)));
      }
    }

    return {
      d2d_settings: [{ organization_id: ORG, settings: {}, goals: {}, ai: {} }],
      d2d_properties: [
        home('prop-1', '1 Oak St', 33.1, -96.1, undefined, '75001'),
        home('prop-2', '2 Oak St', 33.1005, -96.1005, undefined, '75001'),
        home('prop-3', '12 Oak St', 33.11, -96.11),
        home('prop-4', '14 Oak St', 33.12, -96.12),
        home('prop-9', '9 Bankrupt Way', 33.1002, -96.1002, 'SunRun'),
        home('prop-10', '10 Bankrupt Way', 33.1003, -96.1003, 'SunRun'),
        home('prop-11', '11 Bankrupt Way', 33.1004, -96.1004, 'Titan'),
      ],
      d2d_appointments: [
        { organization_id: ORG, user_id: 'user-1', property_id: 'prop-3', status: 'held', at: ago(1) },
        { organization_id: ORG, user_id: 'user-2', property_id: 'prop-5', status: 'no_show', at: ago(1) },
      ],
      d2d_knocks: knocks,
      d2d_territories: [],
      d2d_messages: [],
      d2d_positions: [],
      d2d_api_keys: [],
      d2d_webhooks: [],
    };
  }

  function makeQuery(table: string): Query {
    const filters: ((row: Row) => boolean)[] = [];
    let take = Number.POSITIVE_INFINITY;
    const api = {} as Query;
    const picked = () => (tables[table] ?? []).filter((row) => filters.every((test) => test(row)));
    Object.assign(api, {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters.push((row) => String(row[column]) === String(value));
        return api;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (value === null ? row[column] === null || row[column] === undefined : row[column] === value));
        return api;
      },
      in: (column: string, values: readonly unknown[]) => {
        const wanted = values.map(String);
        filters.push((row) => wanted.includes(String(row[column])));
        return api;
      },
      gt: (column: string, value: unknown) => {
        filters.push((row) => String(row[column]) > String(value));
        return api;
      },
      gte: (column: string, value: unknown) => {
        filters.push((row) => String(row[column]) >= String(value));
        return api;
      },
      lt: (column: string, value: unknown) => {
        filters.push((row) => String(row[column]) < String(value));
        return api;
      },
      order: () => api,
      limit: (count: number) => {
        take = count;
        return api;
      },
      single: () => Promise.resolve({ data: picked().slice(0, take)[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: picked().slice(0, take)[0] ?? null, error: null }),
      insert: (values: Row) => {
        (tables[table] ??= []).push({ ...values });
        return api;
      },
      upsert: (values: Row | Row[]) => {
        const list = (tables[table] ??= []);
        for (const value of Array.isArray(values) ? values : [values]) {
          const found = list.find((row) => row.organization_id === value.organization_id);
          if (found) Object.assign(found, value);
          else list.push({ ...value });
        }
        return api;
      },
      update: (values: Row) => {
        for (const row of picked()) Object.assign(row, values);
        return api;
      },
      delete: () => {
        tables[table] = (tables[table] ?? []).filter((row) => !filters.every((test) => test(row)));
        return api;
      },
      then: (onfulfilled: (value: Result) => unknown, onrejected?: (reason: unknown) => unknown) => {
        const settled: Promise<Result> = Promise.resolve({ data: picked().slice(0, take).map((row) => ({ ...row })), error: null });
        return settled.then(onfulfilled, onrejected);
      },
    });
    return api;
  }

  const fake = {
    from: (table: string) => makeQuery(table),
    rpc: () => Promise.resolve({ data: roster(), error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: current }, error: null }) },
  };

  return {
    fake,
    reset: () => {
      for (const key of Object.keys(tables)) delete tables[key];
      Object.assign(tables, build());
      current = { id: 'user-1', email: 'dana@example.com' };
    },
    signInAs: (id: string, email: string) => {
      current = { id, email };
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: fake }));
vi.mock('@/lib/d2dApi', () => ({ resolveOrganizationId: async () => ORG }));

import { createDoorBossHost } from '../host';

const host = createDoorBossHost();

beforeEach(() => reset());

describe('host routes the add-on layers call', () => {
  it('ranks the board by the chosen metric and counts only door-sourced knocks', async () => {
    const doors = (await host.api('POST', '/perf/board', { metric: 'doors', window: 'today' })) as Row;
    const rows = doors.rows as Row[];

    expect(rows[0]).toMatchObject({ name: 'Marcus', n: 5, rank: 1 });
    // Dana has four rows today, but the GHL write-back is not a door.
    expect(rows[1]).toMatchObject({ name: 'Dana', n: 3, rank: 2, me: true });

    const appts = (await host.api('POST', '/perf/board', { metric: 'appts', window: 'today' })) as Row;
    const apptRows = appts.rows as Row[];
    expect(apptRows).toHaveLength(1);
    expect(apptRows[0]).toMatchObject({ name: 'Dana', n: 1 });
  });

  it('counts a sat appointment from the appointments table, not from knocks', async () => {
    const board = (await host.api('POST', '/perf/board', { metric: 'sat', window: 'today' })) as Row;
    const rows = board.rows as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Dana', n: 1 });
  });

  it('rejects an unknown metric instead of guessing one', async () => {
    await expect(host.api('POST', '/perf/board', { metric: 'vibes' })).rejects.toMatchObject({ status: 400 });
  });

  it('scopes the board to the rep\u2019s own cohort when asked', async () => {
    const board = (await host.api('POST', '/perf/board', { metric: 'doors', window: 'today', cohort: true })) as Row;
    // All three reps joined the same month, so nobody is filtered out - but the flag is honoured.
    expect(board.cohort).toBe(true);
    expect(board.cohort_name).toBe('January 2026');
    expect((board.rows as Row[]).length).toBeGreaterThan(0);
  });

  it('measures pace against the day\u2019s goals and says ahead when the goal is met', async () => {
    const pace = (await host.api('POST', '/perf/pace', { goals: { daily_knocks: 1, daily_contacts: 1, daily_appts: 1 } })) as Row;
    const doors = (pace.pace as Row).doors as Row;
    expect(doors).toMatchObject({ done: 3, goal: 1, status: 'ahead', need_per_hour: null });

    const behind = (await host.api('POST', '/perf/pace', { goals: { daily_knocks: 500 } })) as Row;
    expect(((behind.pace as Row).doors as Row).status).toBe('behind');
  });

  it('builds the feed from what actually happened, and names the home', async () => {
    const feed = (await host.api('GET', '/perf/feed')) as Row;
    const events = feed.events as Row[];
    const appointment = events.find((event) => event.kind === 'appointment');
    expect(appointment).toBeDefined();
    expect(String(appointment?.text)).toBe('Dana set an appointment at 12 Oak St');
  });

  it('flags the rep who has gone quiet and leaves the others alone', async () => {
    const risk = (await host.api('GET', '/perf/risk')) as Row;
    const atRisk = risk.at_risk as Row[];
    expect(atRisk).toHaveLength(1);
    expect(atRisk[0]).toMatchObject({ name: 'Priya', flags: ['slumping'], usual_week: 24 });
  });

  it('refuses the risk list to a rep', async () => {
    signInAs('user-2', 'marcus@example.com');
    await expect(host.api('GET', '/perf/risk')).rejects.toMatchObject({ status: 403 });
  });

  it('awards badges from the rep\u2019s own record', async () => {
    const badges = (await host.api('POST', '/perf/badges', {})) as Row;
    expect(badges.name).toBe('Dana');
    expect((badges.profile as Row).doors).toBe(3);
    const earned = (badges.badges as Row[]).filter((badge) => badge.earned).map((badge) => badge.id);
    expect(earned).toContain('first_door');
    expect(earned).not.toContain('doors_1000');
  });

  it('counts the doors around the rep, and the bankrupt installers among them', async () => {
    const answer = (await host.api('POST', '/ask', {
      question: 'how many doors are within half a mile of me',
      lat: 33.1,
      lng: -96.1,
    })) as Row;
    expect(String(answer.answer)).toContain('5 homes within 0.5 miles');
    expect(String(answer.answer)).toContain('3 have a bankrupt installer');
    expect((answer.action as Row).type).toBe('map');
  });

  it('answers the installer question with the counts that are in the database', async () => {
    const answer = (await host.api('POST', '/ask', { question: 'which installers went bankrupt?' })) as Row;
    expect(String(answer.answer)).toContain('3 homes in your data have a bankrupt installer');
    expect(String(answer.answer)).toContain('SunRun (2)');
  });

  it('answers the pitch question with the approved door line', async () => {
    const answer = (await host.api('POST', '/ask', { question: 'what should I say at the door?' })) as Row;
    expect(String(answer.answer)).toContain('SunRun');
    expect(String(answer.answer)).toContain('cancel your solar');
  });

  it('answers today\u2019s numbers for the rep asking', async () => {
    const answer = (await host.api('POST', '/ask', { question: 'how am I doing today' })) as Row;
    expect(String(answer.answer)).toContain('3 doors');
    expect(String(answer.answer)).toContain('1 appointment set');
  });

  it('says plainly when skip tracing has no provider rather than pretending', async () => {
    await expect(host.api('POST', '/area/trace', { zip: '75001' })).rejects.toMatchObject({ status: 400 });
  });

  it('counts the homes in a ZIP for the area card, and says why the trace button is off', async () => {
    const orphanedOnly = (await host.api('POST', '/area/plan', { zip: '75001' })) as Row;
    expect(orphanedOnly).toMatchObject({ zip: '75001', homes: 2, no_phone: 2, orphaned_no_phone: 0, will_trace: 0 });
    expect(String(orphanedOnly.note)).toContain('2 homes have no phone');

    const anyHome = (await host.api('POST', '/area/plan', { zip: '75001', orphaned_only: false })) as Row;
    expect(String(anyHome.note)).toContain('skip tracing is not wired into this app yet');
  });

  it('records an export for an owner and refuses one for a rep', async () => {
    const owner = (await host.api('POST', '/audit/export', { file: 'knocks.csv', rows: 12 })) as Row;
    expect(owner).toMatchObject({ ok: true, refused: false });

    signInAs('user-2', 'marcus@example.com');
    const rep = (await host.api('POST', '/audit/export', { file: 'knocks.csv', rows: 12 })) as Row;
    expect(rep).toMatchObject({ ok: false, refused: true });

    const log = (await host.api('GET', '/audit/exports')) as Row;
    expect((log.items as Row[]).length).toBe(2);
  });

  it('keeps the host\u2019s own scratch key out of the settings the app reads', async () => {
    await host.api('POST', '/audit/export', { file: 'knocks.csv', rows: 3 });
    const settings = (await host.api('GET', '/settings')) as Row;
    expect('ops' in settings).toBe(false);
    expect(settings.heartbeat).toBe(true);
  });

  it('reports usage without inventing a charge', async () => {
    const usage = (await host.api('GET', '/billing/usage')) as Row;
    expect(usage.enforce).toBe(false);
    expect(usage.total_billable_usd).toBe(0);
    expect((usage.rows as Row[])[0]).toMatchObject({ kind: 'seat', qty: 3 });
  });

  it('runs a competition from creation to a named winner', async () => {
    const created = (await host.api('POST', '/perf/compete', { name: 'Week 44 doors', metric: 'doors', days: 7 })) as Row;
    expect(created.ok).toBe(true);

    const live = (await host.api('GET', '/perf/competitions')) as Row;
    const competition = (live.competitions as Row[])[0];
    expect(competition).toMatchObject({ name: 'Week 44 doors', metric: 'doors', active: true, winner: null });
    expect((competition.standings as Row[])[0]).toMatchObject({ name: 'Marcus', n: 5, rank: 1 });

    await host.api('POST', '/perf/compete', { action: 'end', id: competition.id });
    const ended = (await host.api('GET', '/perf/competitions')) as Row;
    const settled = (ended.competitions as Row[])[0];
    expect(settled.active).toBe(false);
    expect(settled.winner).toMatchObject({ name: 'Marcus' });

    const feed = (await host.api('GET', '/perf/feed')) as Row;
    expect((feed.events as Row[]).some((event) => event.kind === 'winner')).toBe(true);
  });

  it('keeps a competition out of reach of a rep', async () => {
    signInAs('user-2', 'marcus@example.com');
    await expect(host.api('POST', '/perf/compete', { name: 'Mine' })).rejects.toMatchObject({ status: 403 });
    await expect(host.api('POST', '/perf/shout', { text: 'nice one' })).rejects.toMatchObject({ status: 403 });
  });

  it('answers an unknown route with a 404 rather than an empty result', async () => {
    await expect(host.api('GET', '/perf/nonsense')).rejects.toMatchObject({ status: 404 });
    await expect(host.api('GET', '/nowhere')).rejects.toMatchObject({ status: 404 });
  });
});
