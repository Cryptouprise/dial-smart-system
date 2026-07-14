export const LAUNCH_MAX_RETELL_CALL_DURATION_MS = 60 * 60 * 1000;

export function certifiedRetellCallDurationMinutes(
  maxCallDurationMs: unknown,
): number {
  if (
    typeof maxCallDurationMs !== 'number' ||
    !Number.isSafeInteger(maxCallDurationMs) ||
    maxCallDurationMs <= 0
  ) {
    throw new Error(
      'RETELL_CALL_DURATION_NOT_CERTIFIED: provider max_call_duration_ms must be a positive integer',
    );
  }

  if (maxCallDurationMs > LAUNCH_MAX_RETELL_CALL_DURATION_MS) {
    throw new Error(
      `RETELL_CALL_DURATION_NOT_CERTIFIED: provider max_call_duration_ms exceeds ${LAUNCH_MAX_RETELL_CALL_DURATION_MS}`,
    );
  }

  return Math.ceil(maxCallDurationMs / 60_000);
}
