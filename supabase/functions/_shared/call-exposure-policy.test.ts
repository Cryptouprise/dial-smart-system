import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  certifiedRetellCallDurationMinutes,
  LAUNCH_MAX_RETELL_CALL_DURATION_MS,
} from './call-exposure-policy.ts';

Deno.test('Retell duration policy accepts and fully reserves the 60-minute boundary', () => {
  assertEquals(LAUNCH_MAX_RETELL_CALL_DURATION_MS, 3_600_000);
  assertEquals(certifiedRetellCallDurationMinutes(3_600_000), 60);
  assertEquals(certifiedRetellCallDurationMinutes(3_599_999), 60);
  assertEquals(certifiedRetellCallDurationMinutes(60_000), 1);
});

Deno.test('Retell duration policy rejects missing, malformed, and over-limit provider state', () => {
  for (const invalid of [undefined, null, '3600000', 0, -1, 1.5, Number.NaN, 3_600_001]) {
    assertThrows(() => certifiedRetellCallDurationMinutes(invalid));
  }
});
