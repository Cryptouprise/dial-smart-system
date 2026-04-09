import type { DialSmartClient } from "../client.js";
import { leadTools } from "./leads.js";
import { campaignTools } from "./campaigns.js";
import { callTools } from "./calls.js";
import { smsTools } from "./sms.js";
import { systemTools } from "./system.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (
    client: DialSmartClient,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

export const allTools: ToolDefinition[] = [
  ...systemTools,
  ...leadTools,
  ...campaignTools,
  ...callTools,
  ...smsTools,
];
