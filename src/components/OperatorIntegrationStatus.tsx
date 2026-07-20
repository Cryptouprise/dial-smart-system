import { Activity, Shield, Webhook } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type IntegrationStatus = Readonly<{
  name: string;
  state: 'Not provisioned' | 'Source locked';
  summary: string;
  nextStep: string;
}>;

const INTEGRATIONS: readonly IntegrationStatus[] = [
  {
    name: 'Slack',
    state: 'Source locked',
    summary: 'The reviewed adapter accepts only signed R0 read requests, but its public entry point is disabled and not deployed.',
    nextStep: 'Provision one test Slack app with the exact /dial-smart command, then bind its workspace and owner/admin user to one tenant.',
  },
  {
    name: 'Microsoft Teams',
    state: 'Not provisioned',
    summary: 'The R0 request verifier exists, but no bot registration, secure reply outbox, or delivery worker is deployed.',
    nextStep: 'Register one test bot, bind its app and tenant IDs to a single tenant, and certify the durable signed-reply path before enabling it.',
  },
  {
    name: 'Zapier',
    state: 'Source locked',
    summary: 'The adapter is limited to four read-only R0 commands and is disabled before it reads a request or credential.',
    nextStep: 'Mint one short-lived, revocable read-only key bound to a test owner/admin and tenant, then certify receipt and replay handling.',
  },
  {
    name: 'MCP',
    state: 'Not provisioned',
    summary: 'The observer catalog is defined, but its API gateway and shared durable receipt plane are not deployed.',
    nextStep: 'Deploy the authenticated observer-only gateway to an isolated tenant and verify all durable receipt and tenant-binding evidence.',
  },
] as const;

const OBSERVER_COMMANDS = [
  ['operator.context', 'Read the authenticated operator and selected tenant context.'],
  ['system.status', 'Read a tenant-scoped operating status snapshot.'],
  ['elite.solar_brief', 'Read the bounded Elite first-pilot brief: current campaign metadata, direct-import posture, and next human gates.'],
  ['elite.solar_pulse', 'Read Elite’s provider-neutral morning beat and bounded release posture across five recent campaigns. It names one safe next focus, never launch or contact authorization.'],
  ['campaign.list', 'List bounded tenant campaign metadata.'],
  ['campaign.inspect', 'Inspect one campaign selected by an exact UUID.'],
] as const;

/**
 * This is deliberately a status and preparation view, not an integration
 * manager. External channels require independently bound credentials and
 * receipt evidence; a browser toggle must never be able to activate them.
 */
export const OperatorIntegrationStatus = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Webhook className="h-5 w-5" />
        Operator integrations: read-only foundation
      </CardTitle>
      <CardDescription>
        Slack, Teams, Zapier, and MCP can eventually surface safe operational
        status. None can activate campaigns, contact leads, alter a queue, write
        to a CRM, or spend money.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 flex-none text-amber-700 dark:text-amber-400" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-100">No operator channel is live</p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              These controls show the exact deployment work still needed. There is intentionally no activation button here.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {INTEGRATIONS.map((integration) => (
          <article key={integration.name} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{integration.name}</h3>
              <Badge variant={integration.state === 'Source locked' ? 'secondary' : 'outline'}>
                {integration.state}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{integration.summary}</p>
            <div className="mt-3 border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Next gate: </span>
              {integration.nextStep}
            </div>
          </article>
        ))}
      </div>

      <section aria-labelledby="observer-command-guide" className="rounded-lg border bg-muted/40 p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h3 id="observer-command-guide" className="font-semibold">Future read-only command guide</h3>
          <Badge variant="outline">R0 only</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Once a channel is independently provisioned and certified, this finite command set is all it may request.
        </p>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {OBSERVER_COMMANDS.map(([name, description]) => (
            <div key={name} className="rounded-md border bg-background p-3">
              <dt><code className="text-xs font-semibold">{name}</code></dt>
              <dd className="mt-1 text-xs text-muted-foreground">{description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </CardContent>
  </Card>
);

export default OperatorIntegrationStatus;
