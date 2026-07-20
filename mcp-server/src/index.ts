#!/usr/bin/env node
/**
 * Dial Smart MCP server.
 *
 * Connects an MCP client to the dedicated Dial Smart observer API surface. The
 * only certified profile exposes six shared read-only R0 tools and
 * runtime-validates every argument before submitting an immutable envelope.
 *
 * Auth: a single Dial Smart API key (dsk_live_...) supplied via env var.
 * Transport: stdio (default) — works with every MCP client.
 *
 * Env:
 *   DIALSMART_API_KEY    required, dsk_live_...
 *   DIALSMART_API_URL    required explicit reviewed observer endpoint
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { DialSmartClient, DialSmartApiError } from "./client.js";
import {
  certifiedToolsForProfile,
  type ToolDefinition,
} from "./tools/index.js";

async function main() {
  const apiKey = process.env.DIALSMART_API_KEY;
  if (!apiKey) {
    console.error("[dialsmart-mcp] DIALSMART_API_KEY env var is required.");
    process.exit(1);
  }

  const baseUrl = process.env.DIALSMART_API_URL;
  if (!baseUrl) {
    console.error(
      "[dialsmart-mcp] DIALSMART_API_URL must name an explicit reviewed observer endpoint.",
    );
    process.exit(1);
  }
  const client = new DialSmartClient({ baseUrl, apiKey });
  const certifiedTools = certifiedToolsForProfile(
    process.env.DIALSMART_MCP_PROFILE,
  );

  const server = new Server(
    {
      name: "dialsmart",
      version: "0.3.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register tools list
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: certifiedTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Tool dispatch
  const toolMap = new Map<string, ToolDefinition>(
    certifiedTools.map((t) => [t.name, t]),
  );

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolMap.get(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      };
    }

    try {
      const args = req.params.arguments ?? {};
      const result = await tool.handler(client, args as Record<string, unknown>);
      return {
        content: [
          {
            type: "text",
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message =
        err instanceof DialSmartApiError
          ? `Dial Smart API error [${err.status}] ${err.message}${
              err.details ? `\nDetails: ${JSON.stringify(err.details)}` : ""
            }`
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[dialsmart-mcp] Connected in observer mode. ${certifiedTools.length} read-only tools available. API: ${baseUrl}`,
  );
}

main().catch((err) => {
  console.error("[dialsmart-mcp] fatal:", err);
  process.exit(1);
});
