"""Extend host.ts with the 15 routes the app's add-on layers call but nobody answers.

Every replacement asserts its match count first, so a stale anchor fails loudly instead of
half-applying. The file is CRLF; it is normalised to LF for matching and written back as it was.

The route heads added: perf (8), area (3), ask (1), audit (2), billing (1).
"""
from pathlib import Path

HOST = Path(r"C:\Users\charl\dial-smart-system\src\packs\door_to_door\host.ts")

raw = HOST.read_bytes()
text = raw.decode("utf-8")
CRLF = "\r\n" in text
flat = text.replace("\r\n", "\n")

swaps: list[tuple[str, str]] = []


def swap(old: str, new: str, count: int = 1) -> None:
    swaps.append((old, new, count))


# ---------------------------------------------------------------------------------------------
# 1. LooseQuery needs `lt`: the performance windows are half-open [from, to), which is a strict
#    less-than on the upper bound.
# ---------------------------------------------------------------------------------------------
swap(
    """  gt(column: string, value: unknown): LooseQuery;
  gte(column: string, value: unknown): LooseQuery;
""",
    """  gt(column: string, value: unknown): LooseQuery;
  gte(column: string, value: unknown): LooseQuery;
  lt(column: string, value: unknown): LooseQuery;
""",
)

# ---------------------------------------------------------------------------------------------
# 2. The shared definitions the new routes are built from.
# ---------------------------------------------------------------------------------------------
HELPERS = r"""/* Performance, competitions, the feed, the area card and the export guard --------------------
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

/** Competitions, the team feed and the export log, read out of the one JSON key they share. */
function opsFrom(settings: Row): OpsState {
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

/* Wire shapes ------------------------------------------------------------------------------ */"""

swap("/* Wire shapes ------------------------------------------------------------------------------ */", HELPERS)

# ---------------------------------------------------------------------------------------------
# 3. `ops` is this file's own scratch key and must not leak through the settings spread.
# ---------------------------------------------------------------------------------------------
swap(
    """          const row = await settingsRow(verb, path);
          return {
            heartbeat: true,
            ai: { ...AI_DEFAULTS, ...((row.ai ?? {}) as Row) },
            apiKeys: [],
            webhooks: [],
            ...((row.settings ?? {}) as Row),
          };
""",
    """          const row = await settingsRow(verb, path);
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
""",
)

# ---------------------------------------------------------------------------------------------
# 4. The route handlers, inside the host so they can use its helpers.
# ---------------------------------------------------------------------------------------------
HANDLERS = r"""  /* Performance, competitions, the feed, the area card and the export guard -------------------
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
      start: nowIso(),
      end: new Date(Date.now() + days * DAY_MS).toISOString(),
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
    return {
      zip,
      homes: homes.length,
      no_phone: noPhone.length,
      orphaned_no_phone: orphaned.length,
      will_trace: 0,
      est_cost: 0,
      cap_left: 0,
      note: wanted
        ? `${wanted} home${wanted === 1 ? '' : 's'} could be traced, but skip tracing is not wired into this app yet.`
        : 'Every home in this ZIP already has a phone on file.',
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
      const miles = /quarter/i.test(question) ? 0.25 : /\b(?:one|a) mile\b/i.test(question) ? 1 : 0.5;
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

"""

swap(
    "  async function api(method: string, path: string, body?: unknown): Promise<unknown> {",
    HANDLERS + "  async function api(method: string, path: string, body?: unknown): Promise<unknown> {",
)

# ---------------------------------------------------------------------------------------------
# 5. The route heads themselves.
# ---------------------------------------------------------------------------------------------
CASES = r"""      /* Performance, competitions, the feed, the area card and the export guard ------------------ */
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

"""

swap("      /* Side doors ---------------------------------------------------------------------------- */", CASES + "      /* Side doors ---------------------------------------------------------------------------- */")

for old, new, count in swaps:
    found = flat.count(old)
    if found != count:
        raise SystemExit(f"anchor matched {found} time(s), expected {count}:\n---\n{old[:400]}\n---")
    flat = flat.replace(old, new, count)

out = flat.replace("\n", "\r\n") if CRLF else flat
HOST.write_bytes(out.encode("utf-8"))
print(f"host.ts patched: {len(swaps)} edits, {len(raw)} -> {len(out.encode('utf-8'))} bytes")
