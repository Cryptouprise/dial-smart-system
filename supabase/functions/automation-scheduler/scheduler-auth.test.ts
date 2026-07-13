import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { authorizeAutomationScheduler } from "./scheduler-auth.ts";

const SERVICE_ROLE_KEY = "service-role-secret";
const CRON_TOKEN = "automation-cron-secret";

function authorize(input: {
  authorizationHeader?: string | null;
  suppliedCronToken?: string | null;
  serviceRoleKey?: string;
  configuredCronToken?: string;
}) {
  return authorizeAutomationScheduler({
    authorizationHeader: input.authorizationHeader ?? null,
    suppliedCronToken: input.suppliedCronToken ?? null,
    serviceRoleKey: input.serviceRoleKey ?? SERVICE_ROLE_KEY,
    configuredCronToken: input.configuredCronToken ?? CRON_TOKEN,
  });
}

Deno.test("automation scheduler accepts only the exact service-role bearer", () => {
  assertEquals(
    authorize({ authorizationHeader: `Bearer ${SERVICE_ROLE_KEY}` }),
    {
      authorized: true,
      mechanism: "service_role",
    },
  );
  assertEquals(
    authorize({ authorizationHeader: `bearer ${SERVICE_ROLE_KEY}` }),
    {
      authorized: true,
      mechanism: "service_role",
    },
  );
  assertEquals(
    authorize({ authorizationHeader: `Bearer ${SERVICE_ROLE_KEY}-forged` }),
    {
      authorized: false,
      mechanism: "none",
    },
  );
  assertEquals(
    authorize({ authorizationHeader: `Bearer ${SERVICE_ROLE_KEY} ` }),
    { authorized: false, mechanism: "none" },
  );
});

Deno.test("automation scheduler rejects ordinary and anonymous JWTs", () => {
  for (
    const token of ["anon-public-jwt", "signed-in-user-jwt", "publishable-key"]
  ) {
    assertEquals(authorize({ authorizationHeader: `Bearer ${token}` }), {
      authorized: false,
      mechanism: "none",
    });
  }
});

Deno.test("automation scheduler accepts only the dedicated cron header token", () => {
  assertEquals(
    authorize({
      authorizationHeader: "Bearer anon-public-jwt",
      suppliedCronToken: CRON_TOKEN,
    }),
    {
      authorized: true,
      mechanism: "cron_token",
    },
  );
  assertEquals(authorize({ suppliedCronToken: `${CRON_TOKEN}-forged` }), {
    authorized: false,
    mechanism: "none",
  });
  assertEquals(authorize({ suppliedCronToken: ` ${CRON_TOKEN} ` }), {
    authorized: false,
    mechanism: "none",
  });
  assertEquals(authorize({ authorizationHeader: `Bearer ${CRON_TOKEN}` }), {
    authorized: false,
    mechanism: "none",
  });
});

Deno.test("automation scheduler fails closed when either configured secret is missing", () => {
  assertEquals(
    authorize({
      authorizationHeader: `Bearer ${SERVICE_ROLE_KEY}`,
      serviceRoleKey: "",
    }),
    { authorized: false, mechanism: "none" },
  );
  assertEquals(
    authorize({
      suppliedCronToken: CRON_TOKEN,
      configuredCronToken: "",
    }),
    { authorized: false, mechanism: "none" },
  );
  assertEquals(authorize({}), { authorized: false, mechanism: "none" });
});
