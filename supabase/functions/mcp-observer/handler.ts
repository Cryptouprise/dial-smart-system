import type {
  AuthorizedCommandIdentity,
  ObserverControlResult,
  WireCommandRequestV1,
} from "../_shared/control-plane/types.ts";
import {
  normalizeResolvedApiKeyObserverIdentity,
} from "../zapier-observer/auth.ts";
import {
  apiKeyObserverDisabledResponse,
  handleApiKeyObserverRequest,
} from "../zapier-observer/handler.ts";

/** The MCP transport accepts the same narrow R0 wire envelope as other observers. */
export interface McpObserverCommandSubmission {
  channel: "mcp";
  identity: AuthorizedCommandIdentity;
  raw_payload_sha256: string;
  request: WireCommandRequestV1;
}

export interface McpObserverHandlerDependencies {
  enabled: boolean;
  /** Resolves one exact MCP installation, principal, user, and organization. */
  resolveServerIdentity: (credential: string) => Promise<unknown | null>;
  submitObserverCommand: (
    submission: McpObserverCommandSubmission,
  ) => Promise<ObserverControlResult>;
}

/** Hard-lock response used before request, secret, database, or network access. */
export function mcpObserverDisabledResponse(): Response {
  return apiKeyObserverDisabledResponse("mcp");
}

/**
 * A strict MCP HTTP adapter. It never treats possession of an MCP API key as
 * tenant selection: the runtime must resolve the key to one mcp-bound
 * installation and live owner/admin before the durable receipt claim.
 */
export async function handleMcpObserverRequest(
  request: Request,
  deps: McpObserverHandlerDependencies,
): Promise<Response> {
  return await handleApiKeyObserverRequest(request, {
    channel: "mcp",
    enabled: deps.enabled,
    resolveServerIdentity: deps.resolveServerIdentity,
    normalizeResolvedIdentity: (value) =>
      normalizeResolvedApiKeyObserverIdentity(value, "mcp"),
    submitObserverCommand: (submission) =>
      deps.submitObserverCommand({
        channel: "mcp",
        identity: submission.identity,
        raw_payload_sha256: submission.raw_payload_sha256,
        request: submission.request,
      }),
  });
}
