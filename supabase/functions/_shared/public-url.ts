/**
 * Public base URL that providers call back and that Twilio signs.
 *
 * This lives in its own leaf module on purpose.
 *
 * HISTORY (2026-11-02): it used to live in voice-provider.ts, and twilio.ts
 * imported it from there. That made twilio.ts <-> voice-provider.ts a runtime
 * import cycle, which crashed the module at boot (TDZ ReferenceError) whenever
 * an entry file imported twilio.ts before voice-provider.ts. Supabase reported
 * it as a 500 WORKER_ERROR on every request, including OPTIONS.
 *
 * Keeping it here means twilio.ts has no runtime import of voice-provider.ts,
 * so the cycle cannot come back. Do not move this function back.
 */
export function publicFunctionsBaseUrl(): string {
  const override = Deno.env.get('PUBLIC_FUNCTIONS_BASE_URL')?.trim().replace(/\/+$/, '');
  if (override) return override;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '');
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');
  return `${supabaseUrl}/functions/v1`;
}
