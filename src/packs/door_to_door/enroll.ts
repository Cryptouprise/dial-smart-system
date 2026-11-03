/**
 * Door to Door -> Dial Smart follow-up bridge.
 *
 * A rep who books a follow-up on a doorstep has already done the hard part. This module carries
 * that work into Dial Smart itself, so the follow-up lands in the dialer's own queue instead of
 * living only on the canvassing board:
 *
 *   d2d_knocks (status 'callback' | 'appointment', with a time)
 *     -> leads                  one row per homeowner, matched on phone number
 *     -> scheduled_follow_ups   one pending 'callback' at the time the rep picked
 *
 * It is called from the knock upload, so it runs on the same company the rest of the port resolves
 * (lib/d2dApi.resolveOrganizationId -> default_organization_for_user, the same helper Dial Smart's
 * RLS policies use). That is what makes the join legal rather than merely convenient: the lead is
 * written with user_id = the signed-in rep and organization_id = their company, which is exactly
 * what "Tenant owners can insert leads" checks.
 *
 * Three things this deliberately does NOT do:
 *
 *   1. It never sends anything. A scheduled_follow_ups row is a queue entry that the follow-up
 *      screen and the dialer read; no text and no call originates here. Nothing reaches a
 *      homeowner because a rep knocked on their door.
 *
 *   2. It never queues a house with no phone number, no recorded consent, or a do-not-contact
 *      flag. Consent is the app's own "They said it's OK to text them" checkbox (knock.text_ok)
 *      and it is required, so a door that was only knocked is never queued for outreach.
 *
 *   3. It never fails a knock upload. The knock is the rep's record of work; if the lead sync
 *      cannot run, the knock still saves and the phone's queue still clears.
 */

type Row = Record<string, unknown>;

interface LooseResult {
  data: unknown;
  error: unknown;
}

interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns?: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  in(column: string, values: readonly unknown[]): LooseQuery;
  limit(count: number): LooseQuery;
  single(): PromiseLike<LooseResult>;
  maybeSingle(): PromiseLike<LooseResult>;
}

interface LooseTable extends LooseQuery {
  insert(values: Row): LooseQuery;
  update(values: Row): LooseQuery;
}

/** The narrow slice of the Supabase client this module needs, so host.ts can pass its own handle. */
export interface EnrollClient {
  from(table: string): LooseTable;
}

export interface DoorFollowUpInput {
  organizationId: string;
  /** The signed-in rep. Both tables are RLS-scoped to this id. */
  userId: string;
  propertyId: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  /** The rep recorded "they said it's OK to text them" at the door. Required. */
  textOk?: boolean | null;
  dnc?: boolean | null;
  /** When the rep said they would come back. */
  dueAt: string;
  note?: string | null;
  territory?: string | null;
}

export type EnrollOutcome =
  | 'enrolled'
  | 'updated'
  | 'skipped_no_phone'
  | 'skipped_no_consent'
  | 'skipped_do_not_contact'
  | 'failed';

const SOURCE = 'door_to_door';

const digitsOf = (value: string): string => value.replace(/\D+/g, '');

/** ISO, or null - the app works in epoch ms and hands this module whatever it has. */
function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Dial Smart's leads.phone_number is free text - imports and the app write it in several shapes -
 * so a house is matched on every form the same number can take, in one read, rather than on one
 * guess. A malformed value simply has no forms and matches nothing.
 */
function phoneForms(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = digitsOf(trimmed);
  const forms = new Set<string>();
  if (trimmed) forms.add(trimmed);
  if (digits) {
    forms.add(digits);
    if (digits.length === 10) {
      forms.add(`+1${digits}`);
      forms.add(`1${digits}`);
    } else if (digits.length === 11 && digits.startsWith('1')) {
      forms.add(`+${digits}`);
    }
  }
  return [...forms];
}

async function findLead(
  db: EnrollClient,
  organizationId: string,
  rawPhone: string,
): Promise<Row | null> {
  const forms = phoneForms(rawPhone);
  if (!forms.length) return null;
  const res = await db
    .from('leads')
    .select('id, tags, notes, address, city, state, zip_code, lead_source')
    .eq('organization_id', organizationId)
    .in('phone_number', forms)
    .limit(1)
    .maybeSingle();
  if (res.error) return null;
  return (res.data as Row | null) ?? null;
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

/** "Dana Whitfield" -> "Dana" / "Whitfield". A single word is a first name. */
function splitName(raw: string | null | undefined): { first: string | null; last: string | null } {
  const parts = String(raw ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * Turn one doorstep follow-up into a Dial Smart lead plus a pending callback.
 *
 * Returns what it did rather than throwing: the caller is a knock upload, and a doorstep record
 * must never be held hostage by the customer database.
 */
export async function enrollDoorFollowUp(
  db: EnrollClient,
  input: DoorFollowUpInput,
): Promise<EnrollOutcome> {
  const dueAt = iso(input.dueAt);
  if (!dueAt) return 'failed';

  if (input.dnc === true) return 'skipped_do_not_contact';

  const rawPhone = text(input.ownerPhone);
  if (!rawPhone || digitsOf(rawPhone).length < 10) return 'skipped_no_phone';

  // The one gate that matters: no recorded consent, no queue entry.
  if (input.textOk !== true) return 'skipped_no_consent';

  try {
    const tags = [SOURCE];
    const territory = text(input.territory);
    if (territory) tags.push(`territory:${territory}`);

    const stamp = new Date().toISOString().slice(0, 10);
    const note = text(input.note);
    const line = `Door follow-up ${stamp}${note ? `: ${note}` : ''}`;

    const existing = await findLead(db, input.organizationId, rawPhone);
    let leadId: string;
    let outcome: EnrollOutcome;

    if (existing) {
      leadId = String(existing.id);
      const priorTags = Array.isArray(existing.tags) ? existing.tags.map(String) : [];
      const patch: Row = {
        next_callback_at: dueAt,
        tags: Array.from(new Set([...priorTags, ...tags])),
        notes: existing.notes ? `${String(existing.notes)}\n${line}` : line,
        updated_at: new Date().toISOString(),
      };
      // Fill a gap, never overwrite what the customer record already knows.
      if (!text(existing.address) && text(input.address)) patch.address = text(input.address);
      if (!text(existing.city) && text(input.city)) patch.city = text(input.city);
      if (!text(existing.state) && text(input.state)) patch.state = text(input.state);
      if (!text(existing.zip_code) && text(input.zip)) patch.zip_code = text(input.zip);
      if (!text(existing.lead_source)) patch.lead_source = SOURCE;

      const res = await db.from('leads').update(patch).eq('id', leadId).select('id');
      if (res.error) return 'failed';
      outcome = 'updated';
    } else {
      const { first, last } = splitName(input.ownerName);
      const res = await db
        .from('leads')
        .insert({
          user_id: input.userId,
          organization_id: input.organizationId,
          phone_number: rawPhone,
          first_name: first,
          last_name: last,
          status: 'new',
          lead_source: SOURCE,
          tags,
          notes: line,
          address: text(input.address),
          city: text(input.city),
          state: text(input.state),
          zip_code: text(input.zip),
          next_callback_at: dueAt,
          do_not_call: false,
          custom_fields: {
            door_to_door: { property_id: input.propertyId, territory },
          },
        })
        .select('id')
        .single();
      if (res.error || !res.data) return 'failed';
      leadId = String((res.data as Row).id);
      outcome = 'enrolled';
    }

    // One pending callback per lead. A re-logged follow-up replaces the earlier time rather than
    // stacking a second entry the dialer would then work twice.
    await db
      .from('scheduled_follow_ups')
      .update({ status: 'cancelled' })
      .eq('user_id', input.userId)
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .eq('action_type', 'callback');

    const queued = await db
      .from('scheduled_follow_ups')
      .insert({
        user_id: input.userId,
        lead_id: leadId,
        sequence_id: null,
        current_step_id: null,
        scheduled_at: dueAt,
        action_type: 'callback',
        status: 'pending',
      })
      .select('id');

    if (queued.error) return 'failed';
    return outcome;
  } catch {
    return 'failed';
  }
}
