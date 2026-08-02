import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

export type EliteSolarSupervisedTestReplayInput = {
  action: "get";
  run_id: string;
};

export type EliteSolarSupervisedTestReplayResult = {
  ok: boolean;
  replay: unknown;
};

export interface EliteSolarSupervisedTestReplayDependencies {
  store: {
    getReplay(input: {
      ownerUserId: string;
      organizationId: string;
      campaignId: string;
      planId: string;
      planVersion: string;
      runId: string;
    }): Promise<unknown>;
  };
  authenticate: (jwt: string) => Promise<string | null>;
  expectedPlanId: string;
  expectedPlanVersion: string;
}

type Configuration = {
  ownerUserId: string;
  organizationId: string;
  campaignId: string;
};

const MAX_BODY_BYTES = 1_024;

function response(
  status: number,
  body: Record<string, unknown> | null,
): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (
    typeof value !== "string" || value !== value.trim() ||
    value.length < minimum || value.length > maximum
  ) return null;
  return value;
}

function uuid(value: unknown): string | null {
  const candidate = text(value, 36, 36);
  return candidate &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(candidate)
    ? candidate
    : null;
}

function bearer(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length);
  return token.length >= 16 && token.length <= 8192 && !/\s/.test(token)
    ? token
    : null;
}

function parseBody(rawBody: string): EliteSolarSupervisedTestReplayInput | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseBoundedJsonObject(rawBody, {
      maxDepth: 2,
      maxNodes: 4,
      maxObjectKeys: 2,
      maxArrayLength: 0,
      maxStringLength: 128,
    });
  } catch {
    return null;
  }
  if (
    parsed.action !== "get" || !uuid(parsed.run_id) ||
    Object.keys(parsed).length !== 2
  ) {
    return null;
  }
  return { action: "get", run_id: String(parsed.run_id) };
}

/**
 * Returns a replay snapshot for a supervised test run (steps + inbound replies +
 * call lifecycle + handoff state). The endpoint stays exact-owner and exact-plan.
 */
export async function handleEliteSolarSupervisedTestReplayRequest(
  request: Request,
  configuration: Configuration,
  deps: EliteSolarSupervisedTestReplayDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return response(405, {
      ok: false,
      error_code: "METHOD_NOT_ALLOWED",
    });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith(
    "application/json",
  )) {
    return response(400, {
      ok: false,
      error_code: "INVALID_REQUEST",
    });
  }
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) ||
      Number(declared) > MAX_BODY_BYTES)
  ) {
    return response(413, {
      ok: false,
      error_code: "BODY_TOO_LARGE",
    });
  }
  const token = bearer(request.headers.get("authorization"));
  if (!token) {
    return response(401, {
      ok: false,
      error_code: "AUTHORIZATION_REQUIRED",
    });
  }
  let userId: string | null = null;
  try {
    userId = await deps.authenticate(token);
  } catch {
    userId = null;
  }
  if (!userId || userId !== configuration.ownerUserId) {
    return response(403, {
      ok: false,
      error_code: "OWNER_FORBIDDEN",
    });
  }
  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(
      await request.arrayBuffer(),
    );
  } catch {
    return response(400, {
      ok: false,
      error_code: "INVALID_BODY",
    });
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return response(413, {
      ok: false,
      error_code: "BODY_TOO_LARGE",
    });
  }
  const input = parseBody(rawBody);
  if (!input) {
    return response(400, {
      ok: false,
      error_code: "INVALID_ACTION",
    });
  }

  try {
    const replay = await deps.store.getReplay({
      ownerUserId: configuration.ownerUserId,
      organizationId: configuration.organizationId,
      campaignId: configuration.campaignId,
      planId: deps.expectedPlanId,
      planVersion: deps.expectedPlanVersion,
      runId: input.run_id,
    });
    return response(200, { ok: true, replay });
  } catch {
    return response(404, {
      ok: false,
      error_code: "REPLAY_NOT_FOUND",
    });
  }
}
