
/**
 * Door to Door pack - data access.
 *
 * Every call here is scoped by row level security to the caller's company (the
 * "Company members ..." policies created by 20261102234500_door_to_door_core.sql),
 * so nothing in this file has to filter by organization_id to stay safe. Reads may
 * still pass organization_id for an explicit, index-friendly filter.
 *
 * The client is the generated, schema-checked one: types.ts carries d2d_* because the
 * migration 20261102234500_door_to_door_core.sql is applied to the live project. The
 * row interfaces below stay hand-written because they narrow the text columns to the
 * literal unions in doorToDoor.ts (the generator can only see `text` + a CHECK), so
 * reads are cast once at the boundary rather than trusted blindly.
 */

import { supabase } from '@/integrations/supabase/client';
import type { D2DKnockStatus, D2DStatus } from '@/lib/doorToDoor';

const db = supabase;

export interface D2DProperty {
  id: string;
  organization_id: string;
  lat: number | null;
  lng: number | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  installer: string | null;
  installer_status: string;
  installer_closed: string | null;
  tier: string;
  permit_year: string | null;
  system_kw: string | null;
  finance_co: string | null;
  source: string | null;
  territory_id: string | null;
  status: D2DStatus;
  last_knock_at: string | null;
  last_knock_by: string | null;
  callback_at: string | null;
  appointment_at: string | null;
  text_ok: boolean;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  dnc: boolean;
  geocode_status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface D2DKnock {
  id: string;
  organization_id: string;
  client_id: string | null;
  property_id: string;
  user_id: string;
  status: D2DKnockStatus;
  note: string | null;
  callback_at: string | null;
  appointment_at: string | null;
  text_ok: boolean;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  photo_urls: unknown;
  source: string;
  occurred_at: string;
  received_at: string;
  synced_at: string | null;
  sync_error: string | null;
}

export interface D2DTerritory {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  polygon: unknown;
  assigned_user_ids: unknown;
  reknock_days: number;
  created_at: string;
  updated_at: string;
}

export interface NewD2DPropertyInput {
  organization_id: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;
  installer?: string | null;
  installer_status?: string;
  tier?: string;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
  territory_id?: string | null;
}

export interface NewD2DKnockInput {
  organization_id: string;
  property_id: string;
  user_id: string;
  status: D2DKnockStatus;
  note?: string | null;
  callback_at?: string | null;
  appointment_at?: string | null;
  text_ok?: boolean;
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
  source?: string;
  occurred_at?: string;
  client_id?: string | null;
}

/**
 * True when the pack's tables are not in the database yet (migration not applied).
 * PostgREST reports a missing table as PGRST205 / 42P01 depending on version.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: string; message?: string };
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const message = (err.message ?? '').toLowerCase();
  return message.includes('does not exist') || message.includes('schema cache');
}

export class D2DPackNotInstalledError extends Error {
  constructor() {
    super('The Door to Door tables are not in this database yet.');
    this.name = 'D2DPackNotInstalledError';
  }
}

function throwIfMissing(error: unknown): never {
  if (isMissingTableError(error)) throw new D2DPackNotInstalledError();
  const err = error as { message?: string } | null;
  throw new Error(err?.message ?? 'Door to Door request failed');
}

/**
 * The company a signed-in user's Door to Door rows belong to. Uses the same database
 * function the org-scope migration uses, so the screen and the RLS policies can never
 * disagree about which company is "current".
 */
export async function resolveOrganizationId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase.rpc('default_organization_for_user', { p_user_id: userId });
  if (!error && typeof data === 'string' && data) return data;

  // Fallback for older databases that predate the helper.
  const { data: membership } = await db
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return (membership as { organization_id?: string } | null)?.organization_id ?? null;
}

export const D2D_PROPERTY_COLUMNS =
  'id, organization_id, lat, lng, address, city, state, zip, owner_name, owner_phone, owner_email, ' +
  'installer, installer_status, installer_closed, tier, permit_year, system_kw, finance_co, source, ' +
  'territory_id, status, last_knock_at, last_knock_by, callback_at, appointment_at, text_ok, ' +
  'ghl_contact_id, ghl_opportunity_id, dnc, geocode_status, deleted_at, created_at, updated_at';

/** Load a company's knock list, most recently touched first, then alphabetically. */
export async function loadProperties(organizationId: string, limit = 500): Promise<D2DProperty[]> {
  const { data, error } = await db
    .from('d2d_properties')
    .select(D2D_PROPERTY_COLUMNS)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('last_knock_at', { ascending: false, nullsFirst: false })
    .order('address', { ascending: true })
    .limit(limit);

  if (error) throwIfMissing(error);
  return (data ?? []) as unknown as D2DProperty[];
}

export async function insertProperty(input: NewD2DPropertyInput): Promise<D2DProperty> {
  const { data, error } = await db
    .from('d2d_properties')
    .insert(input)
    .select(D2D_PROPERTY_COLUMNS)
    .single();

  if (error) throwIfMissing(error);
  return data as unknown as D2DProperty;
}

export async function updateProperty(
  id: string,
  patch: Partial<Pick<D2DProperty, 'status' | 'callback_at' | 'appointment_at' | 'owner_name' | 'owner_phone' | 'owner_email' | 'territory_id' | 'dnc' | 'installer_status' | 'tier'>>,
): Promise<D2DProperty> {
  const { data, error } = await db
    .from('d2d_properties')
    .update(patch)
    .eq('id', id)
    .select(D2D_PROPERTY_COLUMNS)
    .single();

  if (error) throwIfMissing(error);
  return data as unknown as D2DProperty;
}

export async function softDeleteProperty(id: string): Promise<void> {
  const { error } = await db
    .from('d2d_properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throwIfMissing(error);
}

/** Record a knock. The database then updates the property's status and last_knock_at. */
export async function logKnock(input: NewD2DKnockInput): Promise<D2DKnock> {
  const { data, error } = await db
    .from('d2d_knocks')
    .insert({ client_id: crypto.randomUUID(), ...input })
    .select('*')
    .single();

  if (error) throwIfMissing(error);
  return data as unknown as D2DKnock;
}

export async function loadKnocksForProperty(propertyId: string, limit = 25): Promise<D2DKnock[]> {
  const { data, error } = await db
    .from('d2d_knocks')
    .select('*')
    .eq('property_id', propertyId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throwIfMissing(error);
  return (data ?? []) as unknown as D2DKnock[];
}

export async function loadTerritories(organizationId: string): Promise<D2DTerritory[]> {
  const { data, error } = await db
    .from('d2d_territories')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });

  if (error) throwIfMissing(error);
  return (data ?? []) as unknown as D2DTerritory[];
}

export interface NewD2DTerritoryInput {
  organization_id: string;
  name: string;
  color?: string;
  /** A closed ring, [[lat, lng], ...], at least 3 points. */
  polygon: number[][];
  assigned_user_ids?: string[];
  reknock_days?: number;
}

/** Save a territory the rep just drew. */
export async function insertTerritory(input: NewD2DTerritoryInput): Promise<D2DTerritory> {
  const { data, error } = await db
    .from('d2d_territories')
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      color: input.color ?? '#2b7fff',
      polygon: input.polygon,
      assigned_user_ids: input.assigned_user_ids ?? [],
      ...(input.reknock_days != null ? { reknock_days: input.reknock_days } : {}),
    })
    .select('*')
    .single();

  if (error) throwIfMissing(error);
  return data as unknown as D2DTerritory;
}

/**
 * The map needs every door, and PostgREST caps a single response at 1000 rows, so page
 * through until a short page comes back. The knock list can keep the plain `loadProperties`.
 */
export async function loadAllProperties(organizationId: string): Promise<D2DProperty[]> {
  const pageSize = 1000;
  const all: D2DProperty[] = [];
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await db
      .from('d2d_properties')
      .select(D2D_PROPERTY_COLUMNS)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('address', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throwIfMissing(error);
    const batch = (data ?? []) as unknown as D2DProperty[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

export interface D2DMembership {
  userId: string;
  organizationId: string | null;
  role: string | null;
}

/** The signed-in rep: their user id and role, for the manager-only affordances on the map. */
export async function loadMyMembership(): Promise<D2DMembership | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return null;

  const { data } = await db
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  const row = data as { organization_id?: string; role?: string } | null;
  return {
    userId,
    organizationId: row?.organization_id ?? null,
    role: row?.role ?? null,
  };
}
