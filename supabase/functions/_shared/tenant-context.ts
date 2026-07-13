export type TenantResource = {
  kind: string;
  id?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tenant-changing operations must name the organization explicitly. A saved
 * browser selection, API-key binding, Slack binding, or campaign row may
 * supply this value, but an arbitrary/first membership never may.
 */
export function requireExplicitOrganizationId(value: unknown): string {
  const organizationId = typeof value === 'string' ? value.trim() : '';
  if (!UUID_PATTERN.test(organizationId)) {
    throw new Error('A valid explicit organizationId is required');
  }
  return organizationId.toLowerCase();
}

export function assertOrganizationMembership(input: {
  requestedOrganizationId: unknown;
  membershipOrganizationIds: Array<string | null | undefined>;
}): string {
  const requested = requireExplicitOrganizationId(input.requestedOrganizationId);
  const memberships = new Set(
    input.membershipOrganizationIds
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase()),
  );
  if (!memberships.has(requested)) {
    throw new Error('The authenticated user is not a member of the requested organization');
  }
  return requested;
}

/**
 * Defense in depth after a resource lookup. Missing tenant ownership is not
 * treated as legacy/default ownership: it is uncertified and fails closed.
 */
export function assertTenantResourceOwnership(input: {
  organizationId: unknown;
  userId: string;
  resources: TenantResource[];
}): string {
  const organizationId = requireExplicitOrganizationId(input.organizationId);
  for (const resource of input.resources) {
    const label = `${resource.kind}${resource.id ? ` ${resource.id}` : ''}`;
    if (!resource.organization_id) {
      throw new Error(`${label} has no certified organization ownership`);
    }
    if (resource.organization_id.toLowerCase() !== organizationId) {
      throw new Error(`${label} belongs to a different organization`);
    }
    if (resource.user_id && resource.user_id !== input.userId) {
      throw new Error(`${label} belongs to a different user`);
    }
  }
  return organizationId;
}

/** Resolve and authorize one explicit organization against canonical membership. */
export async function authorizeOrganizationContext(
  supabaseAdmin: any,
  userId: string,
  requestedOrganizationId: unknown,
): Promise<string> {
  const organizationId = requireExplicitOrganizationId(requestedOrganizationId);
  const { data, error } = await supabaseAdmin
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new Error(`Tenant membership lookup failed: ${error.message}`);
  return assertOrganizationMembership({
    requestedOrganizationId: organizationId,
    membershipOrganizationIds: data ? [data.organization_id] : [],
  });
}
