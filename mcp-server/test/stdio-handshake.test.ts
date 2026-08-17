import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const serverEntrypoint = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe("MCP stdio transport", () => {
  let transport: StdioClientTransport | null = null;

  afterEach(async () => {
    if (transport) await transport.close();
    transport = null;
  });

  it("completes an offline no-authority handshake", async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntrypoint],
      env: { DIALSMART_MCP_PROFILE: "elite-pilot-playbook" },
      stderr: "pipe",
    });
    const client = new Client({ name: "dialsmart-certification", version: "1.0.0" });

    await client.connect(transport);
    const catalog = await client.listTools();

    expect(catalog.tools.map((tool) => tool.name)).toContain(
      "dialsmart_elite_morning_beat",
    );
  }, 10_000);
});
