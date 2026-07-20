import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authErrorResult, clampLimit, requireAuthenticatedUser, supabaseForUser, textResult, toolErrorResult } from "./shared";

export default defineTool({
  name: "list_recent_calls",
  title: "List recent calls",
  description: "List this signed-in user's recent call records with outcomes, providers, durations, and summaries.",
  inputSchema: {
    campaignId: z.string().optional().describe("Optional campaign id filter."),
    status: z.string().optional().describe("Optional exact call status filter."),
    limit: z.number().int().optional().describe("Maximum calls to return. The tool clamps this to a safe limit."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ campaignId, status, limit }, ctx) => {
    if (!requireAuthenticatedUser(ctx)) return authErrorResult();

    try {
      const db = supabaseForUser(ctx);
      const safeLimit = clampLimit(limit, 20, 50);
      let request = db
        .from("call_logs")
        .select("id,campaign_id,lead_id,phone_number,caller_id,status,outcome,auto_disposition,provider,duration_seconds,sentiment,call_summary,created_at,started_at,ended_at")
        .order("created_at", { ascending: false })
        .limit(safeLimit);

      if (campaignId?.trim()) request = request.eq("campaign_id", campaignId.trim());
      if (status?.trim()) request = request.eq("status", status.trim());

      const { data, error } = await request;
      if (error) return toolErrorResult(error.message);

      const items = data ?? [];
      return textResult(
        items.length ? `Found ${items.length} recent call${items.length === 1 ? "" : "s"}.` : "No matching calls found.",
        { items }
      );
    } catch (error) {
      return toolErrorResult(error instanceof Error ? error.message : "Could not list recent calls.");
    }
  },
});