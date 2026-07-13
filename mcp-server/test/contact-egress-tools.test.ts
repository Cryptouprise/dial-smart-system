import { describe, expect, it, vi } from "vitest";
import type { DialSmartClient } from "../src/client.js";
import { allTools } from "../src/tools/index.js";

const LEAD_A = "1a111111-1111-4111-8111-111111111111";
const LEAD_B = "2b222222-2222-4222-8222-222222222222";
const CAMPAIGN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAMPAIGN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function tool(name: string) {
  const match = allTools.find((candidate) => candidate.name === name);
  if (!match) throw new Error(`missing tool ${name}`);
  return match;
}

function mockClient(): DialSmartClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ accepted: false, disabled: true }),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as unknown as DialSmartClient;
}

function invoke(
  name: string,
  client: DialSmartClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  return Promise.resolve().then(() => tool(name).handler(client, args));
}

function placeCallArgs(idempotencyKey: string) {
  return {
    lead_id: LEAD_A,
    campaign_id: CAMPAIGN_A,
    idempotency_key: idempotencyKey,
    agent_id: "agent_solar_exit_v1",
    provider: "retell",
    from_number: "+15551234567",
  };
}

function sendSmsArgs(idempotencyKey: string) {
  return {
    to_number: "+15557654321",
    body: "Your requested Solar Exit follow-up.",
    idempotency_key: idempotencyKey,
    from_number: "+15551234567",
    lead_id: LEAD_A,
  };
}

describe("contact-egress MCP contracts", () => {
  it("publishes strict schemas with all server-required bindings", () => {
    const placeCall = tool("dialsmart_place_call");
    const sendSms = tool("dialsmart_send_sms");

    expect(placeCall.inputSchema.required).toEqual([
      "lead_id",
      "campaign_id",
      "idempotency_key",
    ]);
    expect(sendSms.inputSchema.required).toEqual([
      "to_number",
      "body",
      "idempotency_key",
    ]);
    expect(placeCall.inputSchema.additionalProperties).toBe(false);
    expect(sendSms.inputSchema.additionalProperties).toBe(false);
    expect(placeCall.inputSchema.properties).not.toHaveProperty("organization_id");
    expect(sendSms.inputSchema.properties).not.toHaveProperty("organization_id");
  });

  it.each(["lead_id", "campaign_id", "idempotency_key"])(
    "place_call fails closed when %s is omitted",
    async (field) => {
      const client = mockClient();
      const args: Record<string, unknown> = placeCallArgs(`call-omit-${field}-001`);
      delete args[field];

      await expect(invoke("dialsmart_place_call", client, args)).rejects.toThrow(field);
      expect(client.post).not.toHaveBeenCalled();
    },
  );

  it("send_sms fails closed when idempotency_key is omitted", async () => {
    const client = mockClient();
    const args: Record<string, unknown> = sendSmsArgs("sms-omit-key-001");
    delete args.idempotency_key;

    await expect(invoke("dialsmart_send_sms", client, args)).rejects.toThrow(
      "idempotency_key",
    );
    expect(client.post).not.toHaveBeenCalled();
  });

  it.each([
    ["uppercase UUID", { lead_id: LEAD_A.toUpperCase() }],
    ["nil UUID", { lead_id: "00000000-0000-0000-0000-000000000000" }],
    ["unhyphenated campaign", { campaign_id: CAMPAIGN_A.replaceAll("-", "") }],
    ["short key", { idempotency_key: "short" }],
    ["whitespace key", { idempotency_key: "call key with spaces" }],
    ["oversized key", { idempotency_key: "k".repeat(513) }],
    ["invalid provider", { provider: "twilio" }],
    ["invalid caller ID", { from_number: "555-123-4567" }],
    ["two provider IDs", { telnyx_assistant_id: "assistant_solar_exit_v1" }],
    ["provider/agent drift", { provider: "telnyx" }],
    ["tenant override", { organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
    ["unknown field", { dispatch_now: true }],
  ])("place_call rejects %s before a client request", async (_label, change) => {
    const client = mockClient();
    const args = { ...placeCallArgs("call-invalid-cases-001"), ...change };

    await expect(invoke("dialsmart_place_call", client, args)).rejects.toThrow();
    expect(client.post).not.toHaveBeenCalled();
  });

  it.each([
    ["non-E.164 destination", { to_number: "555-765-4321" }],
    ["empty message", { body: "   " }],
    ["short key", { idempotency_key: "short" }],
    ["whitespace key", { idempotency_key: "sms key with spaces" }],
    ["oversized key", { idempotency_key: "k".repeat(513) }],
    ["invalid sender", { from_number: "555-123-4567" }],
    ["noncanonical lead", { lead_id: LEAD_A.toUpperCase() }],
    ["tenant override", { organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
    ["campaign override", { campaign_id: CAMPAIGN_A }],
  ])("send_sms rejects %s before a client request", async (_label, change) => {
    const client = mockClient();
    const args = { ...sendSmsArgs("sms-invalid-cases-001"), ...change };

    await expect(invoke("dialsmart_send_sms", client, args)).rejects.toThrow();
    expect(client.post).not.toHaveBeenCalled();
  });

  it("forwards only the exact place_call bindings and never a tenant override", async () => {
    const client = mockClient();
    const args = placeCallArgs("call-forward-exact-001");

    await tool("dialsmart_place_call").handler(client, args);

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith("/v1/calls", args);
    expect((client.post as ReturnType<typeof vi.fn>).mock.calls[0][1]).not.toHaveProperty(
      "organization_id",
    );
  });

  it("forwards the exact send_sms idempotency key and sanitized payload", async () => {
    const client = mockClient();
    const args = sendSmsArgs("sms-forward-exact-001");

    await tool("dialsmart_send_sms").handler(client, args);

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith("/v1/sms", args);
  });

  it("allows an exact place_call replay with the same operation-scoped key", async () => {
    const client = mockClient();
    const args = placeCallArgs("call-exact-replay-001");
    const placeCall = tool("dialsmart_place_call");

    await placeCall.handler(client, { ...args });
    await placeCall.handler(client, { ...args });

    expect(client.post).toHaveBeenCalledTimes(2);
    expect((client.post as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual(
      (client.post as ReturnType<typeof vi.fn>).mock.calls[1][1],
    );
  });

  it("allows an exact send_sms replay with the same operation-scoped key", async () => {
    const client = mockClient();
    const args = sendSmsArgs("sms-exact-replay-001");
    const sendSms = tool("dialsmart_send_sms");

    await sendSms.handler(client, { ...args });
    await sendSms.handler(client, { ...args });

    expect(client.post).toHaveBeenCalledTimes(2);
    expect((client.post as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual(
      (client.post as ReturnType<typeof vi.fn>).mock.calls[1][1],
    );
  });

  it("rejects campaign or lead drift for a previously bound call key", async () => {
    const client = mockClient();
    const key = "call-campaign-binding-001";
    const placeCall = tool("dialsmart_place_call");

    await placeCall.handler(client, placeCallArgs(key));
    await expect(
      invoke("dialsmart_place_call", client, {
        ...placeCallArgs(key),
        campaign_id: CAMPAIGN_B,
      }),
    ).rejects.toThrow("already bound");
    await expect(
      invoke("dialsmart_place_call", client, {
        ...placeCallArgs(key),
        lead_id: LEAD_B,
      }),
    ).rejects.toThrow("already bound");

    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it("rejects recipient or body drift for a previously bound SMS key", async () => {
    const client = mockClient();
    const key = "sms-message-binding-001";
    const sendSms = tool("dialsmart_send_sms");

    await sendSms.handler(client, sendSmsArgs(key));
    await expect(
      invoke("dialsmart_send_sms", client, {
        ...sendSmsArgs(key),
        to_number: "+15550001111",
      }),
    ).rejects.toThrow("already bound");
    await expect(
      invoke("dialsmart_send_sms", client, {
        ...sendSmsArgs(key),
        body: "A different message",
      }),
    ).rejects.toThrow("already bound");

    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it("scopes identical keys by operation without adding organization data", async () => {
    const client = mockClient();
    const sharedKey = "operation-scoped-key-001";

    await tool("dialsmart_place_call").handler(client, placeCallArgs(sharedKey));
    await tool("dialsmart_send_sms").handler(client, sendSmsArgs(sharedKey));

    expect(client.post).toHaveBeenCalledTimes(2);
    for (const [, body] of (client.post as ReturnType<typeof vi.fn>).mock.calls) {
      expect(body).not.toHaveProperty("organization_id");
    }
  });
});
