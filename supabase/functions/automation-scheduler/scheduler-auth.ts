export type AutomationSchedulerAuthorization =
  | { authorized: true; mechanism: "service_role" | "cron_token" }
  | { authorized: false; mechanism: "none" };

function constantTimeEqual(actual: string, expected: string): boolean {
  const length = Math.max(actual.length, expected.length);
  let mismatch = actual.length ^ expected.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual.charCodeAt(index) || 0) ^
      (expected.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] || null;
}

/**
 * The scheduler enumerates every enabled tenant and can initiate paid effects.
 * It therefore accepts only platform-controlled credentials: the exact service
 * role bearer or a distinct cron-only secret. A valid user/anon JWT is not
 * authority to run global automation.
 */
export function authorizeAutomationScheduler(input: {
  authorizationHeader: string | null;
  suppliedCronToken: string | null;
  serviceRoleKey: string;
  configuredCronToken: string;
}): AutomationSchedulerAuthorization {
  const bearer = bearerToken(input.authorizationHeader);
  if (
    input.serviceRoleKey &&
    bearer &&
    constantTimeEqual(bearer, input.serviceRoleKey)
  ) {
    return { authorized: true, mechanism: "service_role" };
  }

  const suppliedCronToken = input.suppliedCronToken || "";
  if (
    input.configuredCronToken &&
    suppliedCronToken &&
    constantTimeEqual(suppliedCronToken, input.configuredCronToken)
  ) {
    return { authorized: true, mechanism: "cron_token" };
  }

  return { authorized: false, mechanism: "none" };
}
