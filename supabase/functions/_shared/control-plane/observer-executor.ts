import { authorizeCommand, createObserverResult } from "./authorization.ts";
import { canonicalJson, hashControlIntent } from "./canonical-json.ts";
import { parseWireCommandRequest } from "./schemas.ts";
import type {
  AuthorizedCommandIdentity,
  JsonObject,
  JsonValue,
  ObserverControlResult,
  WireCommandRequestV1,
} from "./types.ts";

export interface ObserverQueryContext {
  organization_id: string;
  user_id: string;
}

export interface ObserverQueryStore {
  readSystemStatus(
    context: ObserverQueryContext & { window_hours: number },
  ): Promise<JsonValue>;
  readEliteSolarBrief(
    context: ObserverQueryContext,
  ): Promise<JsonValue>;
  listCampaigns(
    context: ObserverQueryContext & {
      status?: string;
      limit: number;
      cursor?: string;
    },
  ): Promise<JsonValue>;
  inspectCampaign(
    context: ObserverQueryContext & {
      campaign_id: string;
      include: string[];
    },
  ): Promise<JsonValue>;
}

export interface ObserverExecution {
  intent_sha256: string;
  result: ObserverControlResult;
}

function requireJsonResult(value: JsonValue): JsonValue {
  // Store implementations are an untyped network/database boundary at
  // runtime. Refuse undefined, class instances, non-finite numbers, and other
  // values that cannot be represented in a durable canonical receipt.
  canonicalJson(value);
  return value;
}

/**
 * Execute one already authenticated observer request. Tenant, user, role, and
 * scopes come only from the resolved installation/principal identity. The wire
 * request is reparsed defensively and can never widen that identity.
 */
export async function executeObserverCommand(input: {
  command_id: string;
  identity: AuthorizedCommandIdentity;
  request: WireCommandRequestV1 | unknown;
  store: ObserverQueryStore;
}): Promise<ObserverExecution> {
  const request = parseWireCommandRequest(input.request);
  authorizeCommand(request.command.name, {
    profile: "observer",
    role: input.identity.organization_role,
    scopes: input.identity.granted_scopes,
  });

  const intentSha256 = await hashControlIntent({
    organization_id: input.identity.organization_id,
    user_id: input.identity.user_id,
    channel: input.identity.channel,
    installation_id: input.identity.installation_id,
    command: request.command,
    mode: request.mode,
  });

  const context: ObserverQueryContext = {
    organization_id: input.identity.organization_id,
    user_id: input.identity.user_id,
  };
  let data: JsonValue;

  switch (request.command.name) {
    case "operator.context":
      data = {
        channel: input.identity.channel,
        installation_id: input.identity.installation_id,
        user_id: input.identity.user_id,
        organization_id: input.identity.organization_id,
        organization_role: input.identity.organization_role,
        granted_scopes: [...input.identity.granted_scopes].sort(),
        command_guide: {
          profile: "read_only_observer",
          inputs: [
            "help",
            "who am i",
            "status",
            "elite brief",
            "campaigns",
            "campaign <exact campaign UUID>",
            "release <exact campaign UUID>",
          ],
          constraints: [
            "Commands are exact, read-only, and tenant-scoped.",
            "This observer cannot launch campaigns, contact people, write CRM data, or spend money.",
            "A campaign release summary is not contact authorization.",
          ],
        },
      };
      break;
    case "system.status":
      data = await input.store.readSystemStatus({
        ...context,
        window_hours: Number(request.command.args.window_hours ?? 24),
      });
      break;
    case "elite.solar_brief":
      data = await input.store.readEliteSolarBrief(context);
      break;
    case "campaign.list":
      data = await input.store.listCampaigns({
        ...context,
        ...(typeof request.command.args.status === "string"
          ? { status: request.command.args.status }
          : {}),
        limit: Number(request.command.args.limit ?? 50),
        ...(typeof request.command.args.cursor === "string"
          ? { cursor: request.command.args.cursor }
          : {}),
      });
      break;
    case "campaign.inspect":
      data = await input.store.inspectCampaign({
        ...context,
        campaign_id: String(request.command.args.campaign_id),
        include: Array.isArray(request.command.args.include)
          ? request.command.args.include.map(String)
          : [],
      });
      break;
    default:
      // authorizeCommand rejects every non-R0 command in the observer profile.
      throw new Error("UNREACHABLE_NON_OBSERVER_COMMAND");
  }

  const result = createObserverResult({
    command_id: input.command_id,
    command_name: request.command.name,
    status: "completed",
    data: requireJsonResult(data),
  });
  return { intent_sha256: intentSha256, result };
}

/** Runtime shape helper for store implementations that build plain objects. */
export function observerJsonObject(value: JsonObject): JsonObject {
  requireJsonResult(value);
  return value;
}
