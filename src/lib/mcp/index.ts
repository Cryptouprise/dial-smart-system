import { auth, defineMcp } from "@lovable.dev/mcp-js";
import accountSummaryTool from "./tools/account-summary";
import campaignsTool from "./tools/campaigns";
import leadsTool from "./tools/leads";
import phoneNumberHealthTool from "./tools/phone-number-health";
import recentCallsTool from "./tools/recent-calls";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "emonjusymdripmkvtttc";

export default defineMcp({
  name: "dial-smart-mcp",
  title: "Dial Smart Agent Integrations",
  version: "0.1.0",
  instructions:
    "Read-only Dial Smart tools for the signed-in user. Use these tools to inspect campaign readiness, leads, recent calls, and phone-number health. Never infer access to data outside the OAuth-connected user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [accountSummaryTool, campaignsTool, leadsTool, recentCallsTool, phoneNumberHealthTool],
});