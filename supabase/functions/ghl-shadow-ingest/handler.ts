import {
  BoundedJsonError,
  parseBoundedJsonObject,
} from "../_shared/bounded-json.ts";
import {
  evaluateGhlSolarShadowEvent,
  type GhlShadowBinding,
  type GhlShadowDecision,
  parseStrictUtcInstant,
} from "../_shared/ghl-shadow-contract.ts";
import {
  type HighLevelSignatureResult,
  sha256Hex,
  verifyHighLevelWebhookSignature,
} from "../_shared/ghl-webhook-signature.ts";

export const GHL_SHADOW_MAX_BODY_BYTES = 128 * 1_024;

export type GhlShadowReceiptInput = {
  expected_binding_id: string | null;
  ghl_location_id: string | null;
  payload_sha256: string;
  webhook_id_sha256: string | null;
  signature_scheme: "x-ghl-signature-ed25519";
  event_type: string | null;
  source_occurred_at: string | null;
  source_contact_identifier_hmac: string | null;
  consent_phone_identifier_hmac: string | null;
  decision: GhlShadowDecision;
  reason_codes: string[];
  evidence: Record<string, unknown>;
  contact_authorized: false;
  launch_authorized: false;
  external_effects_created: false;
};

export type GhlShadowCommitResult = {
  receipt_id: string;
  commit_status: "committed" | "duplicate" | "webhook_id_collision";
  decision: GhlShadowDecision;
  reason_codes: string[];
};

export interface GhlShadowStore {
  getEnabledContract(locationId: string): Promise<GhlShadowBinding | null>;
  commitReceipt(input: GhlShadowReceiptInput): Promise<GhlShadowCommitResult>;
}

type HandlerDependencies = {
  store: GhlShadowStore;
  identifierKey: CryptoKey;
  now?: () => Date;
  /** Test seam only; production index intentionally uses the pinned verifier. */
  verifySignature?: (input: {
    rawBody: Uint8Array;
    ghlSignature: string | null;
    legacySignature: string | null;
  }) => Promise<HighLevelSignatureResult>;
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error("INVALID_CONTENT_LENGTH");
    }
    if (parsed > GHL_SHADOW_MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > GHL_SHADOW_MAX_BODY_BYTES) {
        await reader.cancel("body limit exceeded");
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function safeWebhookId(value: unknown): string | null {
  return typeof value === "string" && value.length >= 1 &&
      value.length <= 256 &&
      value === value.trim() && /^[A-Za-z0-9._:-]+$/.test(value)
    ? value
    : null;
}

function safeGhlId(value: unknown): string | null {
  return typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)
    ? value
    : null;
}

function safeEventType(value: unknown): string | null {
  return typeof value === "string" &&
      /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value
    : null;
}

async function commitMalformedSignedReceipt(input: {
  deps: HandlerDependencies;
  payloadSha256: string;
  reason: string;
}): Promise<Response> {
  try {
    const committed = await input.deps.store.commitReceipt({
      expected_binding_id: null,
      ghl_location_id: null,
      payload_sha256: input.payloadSha256,
      webhook_id_sha256: null,
      signature_scheme: "x-ghl-signature-ed25519",
      event_type: null,
      source_occurred_at: null,
      source_contact_identifier_hmac: null,
      consent_phone_identifier_hmac: null,
      decision: "quarantined",
      reason_codes: [input.reason],
      evidence: {
        schema_version: "1.0.0",
        evidence_scope: "zero_contact_shadow_observation_only",
        payload_sha256: input.payloadSha256,
        signature_scheme: "x-ghl-signature-ed25519",
        contact_authorized: false,
        launch_authorized: false,
        external_effects_created: false,
        external_trust_required: true,
      },
      contact_authorized: false,
      launch_authorized: false,
      external_effects_created: false,
    });
    return durableResponse(committed);
  } catch {
    return jsonResponse(503, {
      accepted: false,
      error_code: "SHADOW_EVIDENCE_COMMIT_FAILED",
      contact_authorized: false,
      launch_authorized: false,
      external_effects_created: false,
    });
  }
}

function durableResponse(committed: GhlShadowCommitResult): Response {
  // HighLevel needs only a 2xx acknowledgement. Decision details and receipt
  // identifiers remain in the private evidence table instead of being exposed
  // on this public webhook response.
  void committed;
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleGhlShadowIngestRequest(
  request: Request,
  deps: HandlerDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      accepted: false,
      error_code: "METHOD_NOT_ALLOWED",
      contact_authorized: false,
      launch_authorized: false,
    });
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return jsonResponse(415, {
      accepted: false,
      error_code: "APPLICATION_JSON_REQUIRED",
      contact_authorized: false,
      launch_authorized: false,
    });
  }

  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    return jsonResponse(
      error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
      {
        accepted: false,
        error_code: error instanceof Error ? error.message : "BODY_READ_FAILED",
        contact_authorized: false,
        launch_authorized: false,
      },
    );
  }

  // Solar launch certification requires the modern header. The shared verifier
  // understands legacy RSA for transition diagnostics, but this endpoint never
  // certifies or persists a legacy-only delivery.
  const modernSignature = request.headers.get("x-ghl-signature");
  if (modernSignature === null) {
    return jsonResponse(401, {
      accepted: false,
      error_code: "GHL_ED25519_SIGNATURE_REQUIRED",
      contact_authorized: false,
      launch_authorized: false,
    });
  }
  const signature =
    await (deps.verifySignature || verifyHighLevelWebhookSignature)({
      rawBody,
      ghlSignature: modernSignature,
      legacySignature: request.headers.get("x-wh-signature"),
    });
  if (!signature.valid || signature.scheme !== "x-ghl-signature-ed25519") {
    return jsonResponse(401, {
      accepted: false,
      error_code: "INVALID_GHL_ED25519_SIGNATURE",
      contact_authorized: false,
      launch_authorized: false,
    });
  }

  const payloadSha256 = await sha256Hex(rawBody);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    return commitMalformedSignedReceipt({
      deps,
      payloadSha256,
      reason: "INVALID_UTF8_BODY",
    });
  }

  let event: Record<string, unknown>;
  try {
    event = parseBoundedJsonObject(text);
  } catch (error) {
    return commitMalformedSignedReceipt({
      deps,
      payloadSha256,
      reason: error instanceof BoundedJsonError ? error.code : "INVALID_JSON",
    });
  }

  const locationId = safeGhlId(event.locationId);
  const webhookId = safeWebhookId(event.webhookId);
  const webhookIdSha256 = webhookId
    ? await sha256Hex(`ghl-webhook-id-v1\n${webhookId}`)
    : null;
  const sourceTimestamp = typeof event.timestamp === "string" &&
      parseStrictUtcInstant(event.timestamp) !== null
    ? event.timestamp
    : null;
  let binding: GhlShadowBinding | null = null;
  if (locationId) {
    try {
      binding = await deps.store.getEnabledContract(locationId);
    } catch {
      return jsonResponse(503, {
        accepted: false,
        error_code: "SHADOW_CONTRACT_LOOKUP_FAILED",
        contact_authorized: false,
        launch_authorized: false,
        external_effects_created: false,
      });
    }
  }

  let receipt: GhlShadowReceiptInput;
  if (!binding) {
    const reasons = [
      locationId
        ? "NO_ENABLED_LOCATION_BINDING"
        : "INVALID_OR_MISSING_LOCATION_ID",
      ...(event.webhookId === undefined
        ? ["MISSING_WEBHOOK_ID"]
        : (!webhookId ? ["INVALID_WEBHOOK_ID"] : [])),
      ...(event.timestamp === undefined
        ? ["SOURCE_TIMESTAMP_MISSING"]
        : (!sourceTimestamp ? ["SOURCE_TIMESTAMP_INVALID"] : [])),
    ].sort();
    receipt = {
      expected_binding_id: null,
      ghl_location_id: locationId,
      payload_sha256: payloadSha256,
      webhook_id_sha256: webhookIdSha256,
      signature_scheme: "x-ghl-signature-ed25519",
      event_type: safeEventType(event.type),
      source_occurred_at: sourceTimestamp,
      source_contact_identifier_hmac: null,
      consent_phone_identifier_hmac: null,
      decision: "quarantined",
      reason_codes: reasons,
      evidence: {
        schema_version: "1.0.0",
        evidence_scope: "zero_contact_shadow_observation_only",
        payload_sha256: payloadSha256,
        signature_scheme: "x-ghl-signature-ed25519",
        exact_location_binding_found: false,
        contact_authorized: false,
        launch_authorized: false,
        external_effects_created: false,
        external_trust_required: true,
      },
      contact_authorized: false,
      launch_authorized: false,
      external_effects_created: false,
    };
  } else {
    const evaluation = await evaluateGhlSolarShadowEvent({
      event,
      binding,
      payloadSha256,
      identifierKey: deps.identifierKey,
      now: (deps.now || (() => new Date()))(),
    });
    if (event.webhookId !== undefined && !webhookId) {
      evaluation.decision = "quarantined";
      evaluation.reason_codes = [
        ...new Set([
          ...evaluation.reason_codes,
          "INVALID_WEBHOOK_ID",
        ]),
      ].sort();
    }
    if (event.webhookId === undefined) {
      evaluation.reason_codes = [
        ...new Set([
          ...evaluation.reason_codes,
          "MISSING_WEBHOOK_ID",
        ]),
      ].sort();
    }
    receipt = {
      expected_binding_id: binding.id,
      ghl_location_id: locationId,
      payload_sha256: payloadSha256,
      webhook_id_sha256: webhookIdSha256,
      signature_scheme: "x-ghl-signature-ed25519",
      event_type: safeEventType(event.type),
      source_occurred_at: sourceTimestamp,
      source_contact_identifier_hmac: evaluation.source_contact_identifier_hmac,
      consent_phone_identifier_hmac: evaluation.consent_phone_identifier_hmac,
      decision: evaluation.decision,
      reason_codes: evaluation.reason_codes,
      evidence: {
        ...evaluation.evidence,
        signature_scheme: "x-ghl-signature-ed25519",
      },
      contact_authorized: false,
      launch_authorized: false,
      external_effects_created: false,
    };
  }

  try {
    const committed = await deps.store.commitReceipt(receipt);
    return durableResponse(committed);
  } catch {
    return jsonResponse(503, {
      accepted: false,
      error_code: "SHADOW_EVIDENCE_COMMIT_FAILED",
      contact_authorized: false,
      launch_authorized: false,
      external_effects_created: false,
    });
  }
}
