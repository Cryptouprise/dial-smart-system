import { defineTool } from "@lovable.dev/mcp-js";
import { authErrorResult, requireAuthenticatedUser, supabaseForUser, textResult, toolErrorResult } from "./shared";

export default defineTool({
  name: "get_account_summary",
  title: "Get account summary",
  description: "Summarize this signed-in user's Dial Smart leads, campaigns, recent calls, and phone-number inventory.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (_args, ctx) => {
    const auth = requireAuthenticatedUser(ctx);
    if (!auth) return authErrorResult();

    try {
      const db = supabaseForUser(ctx);
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [leads, activeCampaigns, recentCalls, activeNumbers, dncLeads] = await Promise.all([
        db.from("leads").select("id", { count: "exact", head: true }),
        db.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "active"),
        db.from("call_logs").select("id", { count: "exact", head: true }).gte("created_at", since24h),
        db.from("phone_numbers").select("id", { count: "exact", head: true }).eq("status", "active"),
        db.from("leads").select("id", { count: "exact", head: true }).eq("do_not_call", true),
      ]);

      const errors = [leads.error, activeCampaigns.error, recentCalls.error, activeNumbers.error, dncLeads.error].filter(Boolean);
      if (errors.length > 0) return toolErrorResult(errors[0]?.message ?? "Could not load account summary.");

      const summary = {
        userId: auth.userId,
        totalLeads: leads.count ?? 0,
        activeCampaigns: activeCampaigns.count ?? 0,
        callsLast24h: recentCalls.count ?? 0,
        activePhoneNumbers: activeNumbers.count ?? 0,
        doNotCallLeads: dncLeads.count ?? 0,
      };

      return textResult(
        `Account summary: ${summary.totalLeads} leads, ${summary.activeCampaigns} active campaigns, ${summary.callsLast24h} calls in the last 24 hours, ${summary.activePhoneNumbers} active phone numbers, and ${summary.doNotCallLeads} DNC leads.`,
        { summary }
      );
    } catch (error) {
      return toolErrorResult(error instanceof Error ? error.message : "Could not load account summary.");
    }
  },
});