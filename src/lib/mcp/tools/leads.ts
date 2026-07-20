import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authErrorResult, clampLimit, requireAuthenticatedUser, supabaseForUser, textResult, toolErrorResult } from "./shared";

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()]/g, " ").trim();
}

export default defineTool({
  name: "search_leads",
  title: "Search leads",
  description: "Search this signed-in user's leads by status, name, company, email, or phone number.",
  inputSchema: {
    query: z.string().optional().describe("Optional text or phone search term."),
    status: z.string().optional().describe("Optional exact lead status filter."),
    dueCallbacksOnly: z.boolean().optional().describe("When true, return only leads with callbacks due now or earlier."),
    limit: z.number().int().optional().describe("Maximum leads to return. The tool clamps this to a safe limit."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, status, dueCallbacksOnly, limit }, ctx) => {
    if (!requireAuthenticatedUser(ctx)) return authErrorResult();

    try {
      const db = supabaseForUser(ctx);
      const safeLimit = clampLimit(limit, 25, 50);
      let request = db
        .from("leads")
        .select("id,first_name,last_name,company,email,phone_number,status,priority,lead_source,tags,do_not_call,next_callback_at,last_contacted_at,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(safeLimit);

      if (status?.trim()) request = request.eq("status", status.trim());
      if (dueCallbacksOnly) request = request.lte("next_callback_at", new Date().toISOString()).not("next_callback_at", "is", null);

      const term = query ? sanitizeSearchTerm(query) : "";
      if (term) {
        const pattern = `%${term}%`;
        request = request.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern},phone_number.ilike.${pattern}`);
      }

      const { data, error } = await request;
      if (error) return toolErrorResult(error.message);

      const items = data ?? [];
      return textResult(
        items.length ? `Found ${items.length} lead${items.length === 1 ? "" : "s"}.` : "No matching leads found.",
        { items }
      );
    } catch (error) {
      return toolErrorResult(error instanceof Error ? error.message : "Could not search leads.");
    }
  },
});