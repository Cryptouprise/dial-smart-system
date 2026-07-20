// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- Supabase Edge resolves this pinned runtime import.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleEliteSolarPreflightRequest } from "./handler.ts";

serve((request) =>
  handleEliteSolarPreflightRequest(request, {
    getEnvironment: (name) => Deno.env.get(name),
    authenticate: async (jwt) => {
      const url = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !serviceRoleKey) return null;
      const client = createClient(url, serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await client.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },
  })
);
