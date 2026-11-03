/**
 * A browser-ready stand-in for Dial Smart's Supabase client, used ONLY by the real-host visual proof.
 *
 * It is the same fake as the one inside DoorToDoorHostRoutes.test.ts - an in-memory query builder
 * over plain rows, plus the single RPC host.ts calls - rewritten as a module so esbuild can bundle
 * it for the page. The fixture is deliberately small and hand-countable: the point is not a busy
 * screen, it is that the numbers on the screen came from host.ts reading these rows.
 *
 * Three things the fixture is shaped to catch, because they are the mistakes the app's own counting
 * is careful about:
 *   - a row written back from GHL is a signing, not a door (source: 'ghl');
 *   - a sat appointment is counted from d2d_appointments, not from a knock with status 'appointment';
 *   - a rep who has gone quiet is 'slumping', and the others are left alone.
 */

const ORG = 'org-1';
const HOUR = 3600000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

const roster = () => [
  { id: 'user-1', name: 'Dana', email: 'dana@example.com', role: 'owner', joined_at: '2026-01-05T00:00:00.000Z' },
  { id: 'user-2', name: 'Marcus', email: 'marcus@example.com', role: 'rep', joined_at: '2026-01-20T00:00:00.000Z' },
  { id: 'user-3', name: 'Priya', email: 'priya@example.com', role: 'rep', joined_at: '2026-01-20T00:00:00.000Z' },
];

const tables = {};
let current = { id: 'user-1', email: 'dana@example.com' };

const knock = (user, property, status, source, occurred) => ({
  organization_id: ORG,
  user_id: user,
  property_id: property,
  status,
  source,
  occurred_at: occurred,
});

const home = (id, address, lat, lng, installer, zip) => ({
  organization_id: ORG,
  id,
  address,
  lat,
  lng,
  status: 'unknocked',
  tier: 'none',
  installer: installer || null,
  installer_status: installer ? 'bankrupt' : 'unknown',
  owner_phone: null,
  zip: zip || null,
  deleted_at: null,
});

function build() {
  const knocks = [
    // Dana, today: three door-sourced knocks, one of them the appointment.
    knock('user-1', 'prop-1', 'unknocked', 'door', ago(3)),
    knock('user-1', 'prop-2', 'not_home', 'door', ago(2.5)),
    knock('user-1', 'prop-3', 'appointment', 'door', ago(2)),
    // Written back from GHL. It is a signing, but it is not a door.
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
      home('prop-1', '1 Oak St', 33.1, -96.1, null, '75001'),
      home('prop-2', '2 Oak St', 33.1005, -96.1005, null, '75001'),
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

function makeQuery(table) {
  const filters = [];
  let take = Number.POSITIVE_INFINITY;
  const api = {};
  const picked = () => (tables[table] || []).filter((row) => filters.every((test) => test(row)));

  Object.assign(api, {
    select: () => api,
    eq: (column, value) => {
      filters.push((row) => String(row[column]) === String(value));
      return api;
    },
    is: (column, value) => {
      filters.push((row) => (value === null ? row[column] === null || row[column] === undefined : row[column] === value));
      return api;
    },
    in: (column, values) => {
      const wanted = values.map(String);
      filters.push((row) => wanted.includes(String(row[column])));
      return api;
    },
    gt: (column, value) => {
      filters.push((row) => String(row[column]) > String(value));
      return api;
    },
    gte: (column, value) => {
      filters.push((row) => String(row[column]) >= String(value));
      return api;
    },
    lt: (column, value) => {
      filters.push((row) => String(row[column]) < String(value));
      return api;
    },
    order: () => api,
    limit: (count) => {
      take = count;
      return api;
    },
    single: () => Promise.resolve({ data: picked().slice(0, take)[0] || null, error: null }),
    maybeSingle: () => Promise.resolve({ data: picked().slice(0, take)[0] || null, error: null }),
    insert: (values) => {
      (tables[table] = tables[table] || []).push(Object.assign({}, values));
      return api;
    },
    upsert: (values) => {
      const list = (tables[table] = tables[table] || []);
      const rows = Array.isArray(values) ? values : [values];
      for (const value of rows) {
        const found = list.find((row) => row.organization_id === value.organization_id);
        if (found) Object.assign(found, value);
        else list.push(Object.assign({}, value));
      }
      return api;
    },
    update: (values) => {
      for (const row of picked()) Object.assign(row, values);
      return api;
    },
    delete: () => {
      tables[table] = (tables[table] || []).filter((row) => !filters.every((test) => test(row)));
      return api;
    },
    then: (onfulfilled, onrejected) => {
      const settled = Promise.resolve({ data: picked().slice(0, take).map((row) => Object.assign({}, row)), error: null });
      return settled.then(onfulfilled, onrejected);
    },
  });

  return api;
}

Object.assign(tables, build());

export const supabase = {
  from: (table) => makeQuery(table),
  rpc: (name) => (name === 'd2d_company_members'
    ? Promise.resolve({ data: roster(), error: null })
    : Promise.resolve({ data: null, error: null })),
  auth: {
    getUser: () => Promise.resolve({ data: { user: current }, error: null }),
    getSession: () => Promise.resolve({ data: { session: { user: current } }, error: null }),
  },
};

// The proof can sign in as a rep to check the manager-only refusals.
window.__D2D_FAKE_SIGN_IN = (id, email) => { current = { id, email }; };
