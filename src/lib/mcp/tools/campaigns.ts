import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authErrorResult, clampLimit, requireAuthenticatedUser, supabaseForUser, textResult, toolErrorResult } from "./shared";

export default defineTool({
  name: "list_campaigns",
  title: "List campaigns",
  description: "List this signed-in user's Dial Smart campaigns with basic pacing and provider configuration.",
  inputSchema: {
    status: z.string().optional().describe("Optional campaign status filter such as active, paused, completed, or draft."),
    limit: z.number().int().optional().describe("Maximum campaigns to return. The tool clamps this to a safe limit."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ status, limit }, ctx) => {
    if (!requireAuthenticatedUser(ctx)) return authErrorResult();

    try {
      const db = supabaseForUser(ctx);
      const safeLimit = clampLimit(limit, 20, 50);
      let query = db
        .from("campaigns")
        .select("id,name,status,provider,agent_id,telnyx_assistant_id,calls_per_minute,max_attempts,retry_delay_minutes,calling_hours_start,calling_hours_end,timezone,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(safeLimit);

      if (status?.trim()) query = query.eq("status", status.trim());

      const { data, error } = await query;
      if (error) return toolErrorResult(error.message);

      const items = data ?? [];
      return textResult(
        items.length ? `Found ${items.length} campaign${items.length === 1 ? "" : "s"}.` : "No matching campaigns found.",
        { items }
      );
    } catch (error) {
      return toolErrorResult(error instanceof Error ? error.message : "Could not list campaigns.");
    }
  },
});