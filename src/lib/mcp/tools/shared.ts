import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function requireAuthenticatedUser(ctx: ToolContext): { userId: string; token: string } | null {
  const userId = ctx.getUserId();
  const token = ctx.getToken();

  if (!ctx.isAuthenticated() || !userId || !token) {
    return null;
  }

  return { userId, token };
}

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !publishableKey) {
    throw new Error("MCP Supabase environment is not configured.");
  }

  return createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function clampLimit(value: number | undefined, fallback: number, ceiling: number) {
  if (!value || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), ceiling);
}

export function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent,
  };
}

export function authErrorResult() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated. Connect this MCP server through OAuth and try again." }],
    isError: true,
  };
}

export function toolErrorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}