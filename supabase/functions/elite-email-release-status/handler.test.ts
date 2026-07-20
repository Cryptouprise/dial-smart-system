// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEliteEmailReleaseStatusRequest } from "./handler.ts";

const owner = "1c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4";
const organization = "2c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4";
const campaign = "3c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4";
const environment: Record<string, string> = {
  ELITE_EMAIL_RELEASE_STATUS_ENABLED: "true",
  ELITE_EMAIL_RELEASE_STATUS_OWNER_USER_ID: owner,
  ELITE_EMAIL_RELEASE_STATUS_ORGANIZATION_ID: organization,
  ELITE_EMAIL_RELEASE_STATUS_CAMPAIGN_ID: campaign,
  ELITE_EMAIL_RELEASE_STATUS_ALLOWED_ORIGIN: "https://app.example.test",
};
function request(body = "{}") {
  return new Request(
    "https://edge.example.test/functions/v1/elite-email-release-status",
    {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        authorization: `Bearer ${"t".repeat(100)}`,
        "content-type": "application/json",
      },
      body,
    },
  );
}

Deno.test("disabled release status does not authenticate or query", async () => {
  const response = await handleEliteEmailReleaseStatusRequest(request(), {
    getEnvironment: () => undefined,
    authenticate: () => {
      throw new Error("must not authenticate");
    },
    store: {
      read: () => {
        throw new Error("must not read");
      },
    },
  });
  assertEquals(response.status, 503);
});

Deno.test("configured status returns only a bounded no-provider summary", async () => {
  const calls: unknown[] = [];
  const response = await handleEliteEmailReleaseStatusRequest(request(), {
    getEnvironment: (name) => environment[name],
    authenticate: () => Promise.resolve(owner),
    store: {
      read: (input) => {
        calls.push(input);
        return Promise.resolve({
          release_state: "prepared",
          recipient_count: 2,
          expires_at: "2026-07-21T12:00:00.000Z",
        });
      },
    },
  });
  assertEquals(response.status, 200);
  assertEquals(calls, [{
    organization_id: organization,
    user_id: owner,
    campaign_id: campaign,
  }]);
  const output = await response.json();
  assertEquals(output.release_state, "prepared");
  assertEquals(output.provider_action, "none");
  assertEquals(output.authority.provider_write_authorized, false);
});

Deno.test("malformed body or widened store output fails closed", async () => {
  const malformed = await handleEliteEmailReleaseStatusRequest(
    request('{"ignored":true}'),
    {
      getEnvironment: (name) => environment[name],
      authenticate: () => Promise.resolve(owner),
      store: {
        read: () => {
          throw new Error("must not read");
        },
      },
    },
  );
  assertEquals(malformed.status, 400);
  const invalid = await handleEliteEmailReleaseStatusRequest(request(), {
    getEnvironment: (name) => environment[name],
    authenticate: () => Promise.resolve(owner),
    store: {
      read: () =>
        Promise.resolve({
          release_state: "provider_secret_leaked",
          recipient_count: 26,
          expires_at: null,
        }),
    },
  });
  assertEquals(invalid.status, 503);
});
