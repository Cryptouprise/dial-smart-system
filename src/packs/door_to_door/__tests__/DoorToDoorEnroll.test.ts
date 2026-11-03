import { describe, it, expect } from 'vitest';
import { enrollDoorFollowUp, type EnrollClient } from '../enroll';

/**
 * The bridge from a doorstep follow-up into Dial Smart's own follow-up queue.
 *
 * The failure modes here are the expensive ones - queueing a house that never consented, or
 * stacking a second callback the dialer would work twice - so this drives the real function
 * against a small fake and checks what it writes, what it refuses, and in what order.
 *
 * The client is a parameter rather than a module import, which is what makes this possible:
 * nothing is mocked, and the assertions are on the exact rows handed to Supabase.
 */

type Row = Record<string, unknown>;

interface Recorded {
  table: string;
  op: 'select' | 'insert' | 'update';
  values?: Row;
  filters: Array<[string, unknown]>;
}

const ORG = 'org-1';
const USER = 'user-1';
const DUE = '2026-11-04T22:00:00.000Z';

function fakeClient(options: { leads?: Row[]; failLeadInsert?: boolean } = {}) {
  const calls: Recorded[] = [];
  const leads = options.leads ?? [];

  const builder = (table: string, op: Recorded['op'], values?: Row) => {
    const filters: Array<[string, unknown]> = [];
    let recorded = false;

    const settle = () => {
      if (!recorded) {
        recorded = true;
        calls.push({ table, op, values, filters: [...filters] });
      }
      if (table === 'leads' && op === 'select') {
        // Both eq and in are treated as a set of acceptable values, because the lookup matches a
        // phone number in any of the shapes it can be stored in.
        const wanted = new Set<string>();
        for (const [column, value] of filters) {
          if (column !== 'phone_number') continue;
          if (Array.isArray(value)) for (const one of value) wanted.add(String(one));
          else wanted.add(String(value));
        }
        return { data: leads.find((lead) => wanted.has(String(lead.phone_number))) ?? null, error: null };
      }
      if (table === 'leads' && op === 'insert') {
        return options.failLeadInsert
          ? { data: null, error: { message: 'nope' } }
          : { data: { id: 'lead-new' }, error: null };
      }
      return { data: null, error: null };
    };

    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      },
      in: (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      },
      limit: () => query,
      single: () => Promise.resolve(settle()),
      maybeSingle: () => Promise.resolve(settle()),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return query;
  };

  const client = {
    from: (table: string) => ({
      ...builder(table, 'select'),
      insert: (values: Row) => builder(table, 'insert', values),
      update: (values: Row) => builder(table, 'update', values),
    }),
  };

  return { client: client as unknown as EnrollClient, calls };
}

const trace = (calls: Recorded[]) => calls.map((call) => `${call.table}:${call.op}`);

/** A house the rep just spoke to, with consent recorded, and a follow-up time. */
const house = (overrides: Partial<Parameters<typeof enrollDoorFollowUp>[1]> = {}) => ({
  organizationId: ORG,
  userId: USER,
  propertyId: 'prop-1',
  address: '412 Alder St',
  city: 'Nashville',
  state: 'TN',
  zip: '37207',
  ownerName: 'Dana Whitfield',
  ownerPhone: '(555) 010-0100',
  textOk: true,
  dnc: false,
  dueAt: DUE,
  note: 'Call after 5',
  ...overrides,
});

describe('enrollDoorFollowUp', () => {
  it('refuses a house with no usable phone number', async () => {
    const { client, calls } = fakeClient();

    expect(await enrollDoorFollowUp(client, house({ ownerPhone: null }))).toBe('skipped_no_phone');
    expect(await enrollDoorFollowUp(client, house({ ownerPhone: '   ' }))).toBe('skipped_no_phone');
    expect(await enrollDoorFollowUp(client, house({ ownerPhone: '555-010' }))).toBe('skipped_no_phone');

    // Not one read, not one write: the gate is before the database.
    expect(calls).toEqual([]);
  });

  it('never queues a do-not-contact house, even with a phone and consent', async () => {
    const { client, calls } = fakeClient();

    expect(await enrollDoorFollowUp(client, house({ dnc: true }))).toBe('skipped_do_not_contact');
    expect(calls).toEqual([]);
  });

  it('requires recorded consent, and does not treat an unset flag as consent', async () => {
    const { client, calls } = fakeClient();

    expect(await enrollDoorFollowUp(client, house({ textOk: false }))).toBe('skipped_no_consent');
    expect(await enrollDoorFollowUp(client, house({ textOk: undefined }))).toBe('skipped_no_consent');
    expect(await enrollDoorFollowUp(client, house({ textOk: null }))).toBe('skipped_no_consent');

    expect(calls).toEqual([]);
  });

  it('reports a failure instead of throwing when the follow-up has no usable time', async () => {
    const { client } = fakeClient();
    expect(await enrollDoorFollowUp(client, house({ dueAt: 'not a date' }))).toBe('failed');
  });

  it('writes the lead and queues the callback for a new house', async () => {
    const { client, calls } = fakeClient();

    expect(await enrollDoorFollowUp(client, house())).toBe('enrolled');

    const lead = calls.find((call) => call.table === 'leads' && call.op === 'insert');
    expect(lead?.values).toMatchObject({
      user_id: USER,
      organization_id: ORG,
      phone_number: '(555) 010-0100',
      first_name: 'Dana',
      last_name: 'Whitfield',
      status: 'new',
      lead_source: 'door_to_door',
      tags: ['door_to_door'],
      address: '412 Alder St',
      zip_code: '37207',
      next_callback_at: DUE,
      do_not_call: false,
    });
    expect(String(lead?.values?.notes)).toContain('Door follow-up');
    expect(String(lead?.values?.notes)).toContain('Call after 5');
    expect(lead?.values?.custom_fields).toMatchObject({ door_to_door: { property_id: 'prop-1' } });

    const queued = calls.find((call) => call.table === 'scheduled_follow_ups' && call.op === 'insert');
    expect(queued?.values).toMatchObject({
      user_id: USER,
      lead_id: 'lead-new',
      sequence_id: null,
      current_step_id: null,
      scheduled_at: DUE,
      action_type: 'callback',
      status: 'pending',
    });

    // Nothing else: no message, no call, no second queue row.
    expect(trace(calls)).toEqual([
      'leads:select',
      'leads:insert',
      'scheduled_follow_ups:update',
      'scheduled_follow_ups:insert',
    ]);
  });

  it('matches a lead already on file under a different phone shape, and keeps what it knows', async () => {
    const existing: Row = {
      id: 'lead-existing',
      phone_number: '5550100100',
      tags: ['facebook'],
      notes: 'Called 10/2',
      address: '412 Alder Street',
      lead_source: 'facebook_ads',
    };
    const { client, calls } = fakeClient({ leads: [existing] });

    expect(await enrollDoorFollowUp(client, house())).toBe('updated');

    expect(calls.some((call) => call.table === 'leads' && call.op === 'insert')).toBe(false);
    const patch = calls.find((call) => call.table === 'leads' && call.op === 'update');
    expect(patch?.filters).toEqual([['id', 'lead-existing']]);
    expect(patch?.values?.next_callback_at).toBe(DUE);
    expect(patch?.values?.tags).toEqual(['facebook', 'door_to_door']);
    expect(String(patch?.values?.notes)).toContain('Called 10/2');
    expect(String(patch?.values?.notes)).toContain('Door follow-up');
    // The customer record already knows the address and the source, so neither is overwritten.
    expect(patch?.values).not.toHaveProperty('address');
    expect(patch?.values).not.toHaveProperty('lead_source');
  });

  it('replaces the earlier pending callback rather than stacking a second one', async () => {
    const { client, calls } = fakeClient({ leads: [{ id: 'lead-existing', phone_number: '5550100100' }] });

    expect(await enrollDoorFollowUp(client, house())).toBe('updated');

    const cancel = calls.find((call) => call.table === 'scheduled_follow_ups' && call.op === 'update');
    expect(cancel?.values).toEqual({ status: 'cancelled' });
    expect(cancel?.filters).toEqual([
      ['user_id', USER],
      ['lead_id', 'lead-existing'],
      ['status', 'pending'],
      ['action_type', 'callback'],
    ]);

    // The cancel has to land before the new row, or the new row cancels itself.
    expect(trace(calls).indexOf('scheduled_follow_ups:update')).toBeLessThan(
      trace(calls).indexOf('scheduled_follow_ups:insert'),
    );
  });

  it('reports a failure rather than throwing when the lead cannot be written', async () => {
    const { client } = fakeClient({ failLeadInsert: true });
    expect(await enrollDoorFollowUp(client, house())).toBe('failed');
  });
});
