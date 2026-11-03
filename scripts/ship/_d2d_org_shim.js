/**
 * Stand-in for `@/lib/d2dApi`, for the real-host visual proof only.
 *
 * host.ts imports exactly one thing from d2dApi: `resolveOrganizationId`. In the app that resolves
 * the signed-in user's company through Dial Smart's own tables; in the routes test it is mocked to a
 * constant for the same reason it is mocked here - it is Dial Smart plumbing, not DoorBoss logic,
 * and it has nothing to do with whether the ported screens render.
 */
export const resolveOrganizationId = async () => 'org-1';
