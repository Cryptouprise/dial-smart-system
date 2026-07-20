import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authErrorResult, clampLimit, requireAuthenticatedUser, supabaseForUser, textResult, toolErrorResult } from "./shared";

export default defineTool({
  name: "list_phone_number_health",
  title: "List phone-number health",
  description: "List this signed-in user's phone numbers with lightweight health flags for campaign readiness.",
  inputSchema: {
    provider: z.string().optional().describe("Optional provider filter such as retell, telnyx, or twilio."),
    limit: z.number().int().optional().describe("Maximum phone numbers to return. The tool clamps this to a safe limit."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ provider, limit }, ctx) => {
    if (!requireAuthenticatedUser(ctx)) return authErrorResult();

    try {
      const db = supabaseForUser(ctx);
      const safeLimit = clampLimit(limit, 50, 100);
      let request = db
        .from("phone_numbers")
        .select("id,number,provider,status,purpose,daily_calls,max_daily_calls,is_spam,rotation_enabled,quarantine_until,last_call_at,retell_phone_id,twilio_sid,updated_at")
        .order("updated_at", { ascending: false })
        .limit(safeLimit);

      if (provider?.trim()) request = request.eq("provider", provider.trim());

      const { data, error } = await request;
      if (error) return toolErrorResult(error.message);

      const now = Date.now();
      const items = (data ?? []).map((number) => {
        const maxDailyCalls = number.max_daily_calls ?? 100;
        const atDailyCap = number.daily_calls >= maxDailyCalls;
        const quarantined = Boolean(number.quarantine_until && new Date(number.quarantine_until).getTime() > now);
        const flags = [
          number.status !== "active" ? "inactive" : null,
          number.is_spam ? "spam_flagged" : null,
          quarantined ? "quarantined" : null,
          atDailyCap ? "at_daily_cap" : null,
          number.rotation_enabled === false ? "rotation_disabled" : null,
        ].filter(Boolean);

        return {
          ...number,
          max_daily_calls: maxDailyCalls,
          health: flags.length === 0 ? "healthy" : flags.length === 1 ? "watch" : "unhealthy",
          flags,
        };
      });

      return textResult(
        items.length ? `Found ${items.length} phone number${items.length === 1 ? "" : "s"}.` : "No matching phone numbers found.",
        { items }
      );
    } catch (error) {
      return toolErrorResult(error instanceof Error ? error.message : "Could not list phone-number health.");
    }
  },
});