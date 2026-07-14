// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseSlackSlashCommandForm,
  readSlackRequestBody,
  SLACK_MAX_REQUEST_BODY_BYTES,
  SlackRequestBodyError,
  SlackSlashCommandError,
  verifySlackRequestSignature,
} from "./slack-request-auth.ts";

const encoder = new TextEncoder();

async function officialStyleSlackSignature(
  secret: string,
  timestamp: string,
  rawBody: Uint8Array | string,
): Promise<string> {
  const body = typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;
  const prefix = encoder.encode(`v0:${timestamp}:`);
  const baseString = new Uint8Array(prefix.byteLength + body.byteLength);
  baseString.set(prefix);
  baseString.set(body, prefix.byteLength);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, baseString),
  );
  return `v0=${
    [...digest]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  }`;
}

function postRequest(
  body: BodyInit | null,
  contentLength?: string,
): Request {
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }
  return new Request("https://example.test/slack", {
    method: "POST",
    headers,
    body,
  });
}

Deno.test("authenticates Slack's v0 HMAC over the exact raw body", async () => {
  const secret = "8f742231b10e8888abcd99yyyzzz85a5";
  const timestamp = "1531420618";
  const body = "team_id=T0001&user_id=U0002&command=%2Fdial&text=solar+exit";
  const signature = await officialStyleSlackSignature(
    secret,
    timestamp,
    body,
  );

  assertEquals(
    await verifySlackRequestSignature({
      rawBody: body,
      timestampHeader: timestamp,
      signatureHeader: signature,
      signingSecret: secret,
      nowEpochSeconds: Number(timestamp),
    }),
    { ok: true, timestamp: Number(timestamp) },
  );
});

Deno.test("rejects even semantic-preserving raw-body byte drift", async () => {
  const secret = "test-signing-secret";
  const timestamp = "1770000000";
  const signedBody = "team_id=T1&user_id=U2&command=%2Fdial&text=solar+exit";
  const signature = await officialStyleSlackSignature(
    secret,
    timestamp,
    signedBody,
  );

  assertEquals(
    await verifySlackRequestSignature({
      rawBody: "team_id=T1&user_id=U2&command=%2Fdial&text=solar%20exit",
      timestampHeader: timestamp,
      signatureHeader: signature,
      signingSecret: secret,
      nowEpochSeconds: Number(timestamp),
    }),
    { ok: false, reason: "signature_mismatch" },
  );
});

Deno.test("accepts only the inclusive 300-second replay window", async () => {
  const secret = "test-signing-secret";
  const timestamp = "1770000000";
  const body = "command=%2Fdial";
  const signature = await officialStyleSlackSignature(
    secret,
    timestamp,
    body,
  );

  for (const nowEpochSeconds of [1769999700, 1770000300]) {
    assert(
      (await verifySlackRequestSignature({
        rawBody: body,
        timestampHeader: timestamp,
        signatureHeader: signature,
        signingSecret: secret,
        nowEpochSeconds,
      })).ok,
    );
  }
  for (const nowEpochSeconds of [1769999699, 1770000301]) {
    assertEquals(
      await verifySlackRequestSignature({
        rawBody: body,
        timestampHeader: timestamp,
        signatureHeader: signature,
        signingSecret: secret,
        nowEpochSeconds,
      }),
      { ok: false, reason: "timestamp_out_of_window" },
    );
  }
});

Deno.test("rejects malformed timestamp, signature, and clock headers", async () => {
  const validInput = {
    rawBody: "x=1",
    timestampHeader: "1770000000",
    signatureHeader: `v0=${"a".repeat(64)}`,
    signingSecret: "secret",
    nowEpochSeconds: 1770000000,
  };

  for (
    const timestampHeader of [
      null,
      "",
      " 1770000000",
      "+1770000000",
      "-1770000000",
      "01770000000",
      "1770000000.0",
      "9999999999999999",
    ]
  ) {
    assertEquals(
      await verifySlackRequestSignature({
        ...validInput,
        timestampHeader,
      }),
      { ok: false, reason: "invalid_timestamp" },
    );
  }

  for (
    const signatureHeader of [
      null,
      "",
      `v1=${"a".repeat(64)}`,
      `v0=${"A".repeat(64)}`,
      `v0=${"a".repeat(63)}`,
      `v0=${"g".repeat(64)}`,
      ` v0=${"a".repeat(64)}`,
    ]
  ) {
    assertEquals(
      await verifySlackRequestSignature({
        ...validInput,
        signatureHeader,
      }),
      { ok: false, reason: "invalid_signature" },
    );
  }

  for (const nowEpochSeconds of [-1, 1.5, Number.NaN]) {
    assertEquals(
      await verifySlackRequestSignature({
        ...validInput,
        nowEpochSeconds,
      }),
      { ok: false, reason: "invalid_now" },
    );
  }
});

Deno.test("fails closed when the Slack signing secret is empty", async () => {
  for (const signingSecret of ["", "   "]) {
    assertEquals(
      await verifySlackRequestSignature({
        rawBody: "x=1",
        timestampHeader: "1770000000",
        signatureHeader: `v0=${"a".repeat(64)}`,
        signingSecret,
        nowEpochSeconds: 1770000000,
      }),
      { ok: false, reason: "missing_signing_secret" },
    );
  }
});

Deno.test("bounded body reader preserves bytes and validates Content-Length", async () => {
  const rawBody = encoder.encode("team_id=T1&text=solar+exit");
  const result = await readSlackRequestBody(
    postRequest(rawBody, String(rawBody.byteLength)),
  );
  assertEquals(result, rawBody);

  const exactLimit = new Uint8Array(SLACK_MAX_REQUEST_BODY_BYTES);
  assertEquals(
    (await readSlackRequestBody(postRequest(exactLimit))).byteLength,
    SLACK_MAX_REQUEST_BODY_BYTES,
  );
});

Deno.test("bounded body reader rejects invalid, oversized, and dishonest lengths", async () => {
  for (
    const contentLength of [
      "-1",
      "+1",
      "01",
      "1.0",
      "1, 1",
      "999999999999999999999999999999",
    ]
  ) {
    await assertRejects(
      () => readSlackRequestBody(postRequest("x", contentLength)),
      SlackRequestBodyError,
      "invalid_content_length",
    );
  }

  await assertRejects(
    () =>
      readSlackRequestBody(
        postRequest("x", String(SLACK_MAX_REQUEST_BODY_BYTES + 1)),
      ),
    SlackRequestBodyError,
    "body_too_large",
  );
  await assertRejects(
    () => readSlackRequestBody(postRequest("x", "2")),
    SlackRequestBodyError,
    "content_length_mismatch",
  );
});

Deno.test("streaming body cap is enforced without trusting Content-Length", async () => {
  const chunkSize = 64 * 1024;
  let chunksSent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(chunkSize));
      chunksSent += 1;
      if (chunksSent === 3) controller.close();
    },
  });
  await assertRejects(
    () => readSlackRequestBody(postRequest(stream)),
    SlackRequestBodyError,
    "body_too_large",
  );
});

Deno.test("strict slash parser returns only bounded authenticated fields", () => {
  const body = "team_id=T012ABC&user_id=U034DEF&command=%2Fdial-smart&" +
    "text=build+solar+exit&trigger_id=123.456.token&api_app_id=A078XYZ&" +
    "user_name=untrusted&response_url=http%3A%2F%2F169.254.169.254%2Flatest";
  const command = parseSlackSlashCommandForm(body);

  assertEquals(command, {
    teamId: "T012ABC",
    userId: "U034DEF",
    command: "/dial-smart",
    text: "build solar exit",
    triggerId: "123.456.token",
    apiAppId: "A078XYZ",
  });
  assertEquals(Object.keys(command).sort(), [
    "apiAppId",
    "command",
    "teamId",
    "text",
    "triggerId",
    "userId",
  ]);
  assertEquals("response_url" in command, false);
  assertEquals("responseUrl" in command, false);
});

Deno.test("strict slash parser rejects duplicate security fields after decoding", () => {
  const valid = "team_id=T1&user_id=U2&command=%2Fdial";
  const duplicateForms = [
    `${valid}&team_id=T3`,
    `${valid}&team%5Fid=T3`,
    `${valid}&user_id=U3`,
    `${valid}&command=%2Fother`,
    `${valid}&text=one&text=two`,
    `${valid}&trigger_id=one&trigger_id=two`,
    `${valid}&api_app_id=A1&api_app_id=A2`,
  ];
  for (const body of duplicateForms) {
    assertThrows(
      () => parseSlackSlashCommandForm(body),
      SlackSlashCommandError,
      "duplicate_security_field",
    );
  }
});

Deno.test("strict slash parser enforces required fields and character bounds", () => {
  for (
    const body of [
      "user_id=U2&command=%2Fdial",
      "team_id=&user_id=U2&command=%2Fdial",
      "team_id=T1&command=%2Fdial",
      "team_id=T1&user_id=U2",
    ]
  ) {
    assertThrows(
      () => parseSlackSlashCommandForm(body),
      SlackSlashCommandError,
      "missing_required_field",
    );
  }

  const invalidCases: Array<[string, string]> = [
    ["team_id=team&user_id=U2&command=%2Fdial", "invalid_team_id"],
    ["team_id=T1&user_id=user&command=%2Fdial", "invalid_user_id"],
    ["team_id=T1&user_id=U2&command=dial", "invalid_command"],
    ["team_id=T1&user_id=U2&command=%2FDIAL", "invalid_command"],
    [
      `team_id=T1&user_id=U2&command=%2Fdial&text=${"x".repeat(8_001)}`,
      "invalid_text",
    ],
    [
      "team_id=T1&user_id=U2&command=%2Fdial&trigger_id=bad%20trigger",
      "invalid_trigger_id",
    ],
    [
      "team_id=T1&user_id=U2&command=%2Fdial&api_app_id=U123",
      "invalid_api_app_id",
    ],
  ];
  for (const [body, message] of invalidCases) {
    assertThrows(
      () => parseSlackSlashCommandForm(body),
      SlackSlashCommandError,
      message,
    );
  }
});

Deno.test("strict slash parser rejects malformed percent encoding and UTF-8", () => {
  assertThrows(
    () =>
      parseSlackSlashCommandForm(
        "team_id=T1&user_id=U2&command=%2Fdial&text=%ZZ",
      ),
    SlackSlashCommandError,
    "malformed_form_encoding",
  );
  assertThrows(
    () =>
      parseSlackSlashCommandForm(
        Uint8Array.from([0x74, 0x65, 0x61, 0x6d, 0x5f, 0x69, 0x64, 0x3d, 0xff]),
      ),
    SlackSlashCommandError,
    "invalid_utf8",
  );
});
