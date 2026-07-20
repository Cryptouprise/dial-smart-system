import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

type OAuthConsentDetails = {
  client?: { name?: string; client_name?: string };
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthDecisionResult = {
  redirect_url?: string;
  redirect_to?: string;
};

type SupabaseOAuthApi = {
  getAuthorizationDetails: (authorizationId: string) => Promise<{ data: OAuthConsentDetails | null; error: { message: string } | null }>;
  approveAuthorization: (authorizationId: string) => Promise<{ data: OAuthDecisionResult | null; error: { message: string } | null }>;
  denyAuthorization: (authorizationId: string) => Promise<{ data: OAuthDecisionResult | null; error: { message: string } | null }>;
};

function getOAuthApi(): SupabaseOAuthApi | null {
  return ((supabase.auth as unknown as { oauth?: SupabaseOAuthApi }).oauth ?? null);
}

function getRedirectTarget(data: OAuthConsentDetails | OAuthDecisionResult | null | undefined) {
  return data?.redirect_url ?? data?.redirect_to ?? "";
}

export default function McpConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthConsentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clientName = useMemo(() => {
    return details?.client?.name ?? details?.client?.client_name ?? "an AI agent";
  }, [details]);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!authorizationId) {
        setError("Missing authorization request.");
        return;
      }

      const oauth = getOAuthApi();
      if (!oauth) {
        setError("Supabase OAuth authorization support is not available yet. Enable OAuth 2.1 and Dynamic Client Registration in Supabase, then try again.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/auth?next=${encodeURIComponent(next)}`;
        return;
      }

      const { data, error: detailsError } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;

      if (detailsError) {
        setError(detailsError.message);
        return;
      }

      const immediateRedirect = getRedirectTarget(data);
      if (immediateRedirect && !data?.client) {
        window.location.href = immediateRedirect;
        return;
      }

      setDetails(data);
    })();

    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const oauth = getOAuthApi();
    if (!oauth) {
      setError("Supabase OAuth authorization support is not available yet.");
      return;
    }

    setBusy(true);
    setError(null);

    const { data, error: decisionError } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);

    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }

    const target = getRedirectTarget(data);
    if (!target) {
      setBusy(false);
      setError("No redirect was returned by the authorization server.");
      return;
    }

    window.location.href = target;
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Connect {clientName}</CardTitle>
            <CardDescription>
              Approve this request to let the agent use Dial Smart tools as your signed-in account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {!details && !error ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}

            {details ? (
              <>
                <p className="text-sm text-muted-foreground">
                  The agent will be able to read your campaign, lead, call, and phone-number readiness data through the MCP tools exposed by this app.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                    Approve
                  </Button>
                  <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
                    Deny
                  </Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}