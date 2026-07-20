import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  MailCheck,
  RadioTower,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LaunchLane = Readonly<{
  name: string;
  state: 'Evidence needed' | 'Configuration needed' | 'No-send candidate ready' | 'Observer foundation ready';
  detail: string;
  nextStep: string;
}>;

const LAUNCH_LANES: readonly LaunchLane[] = [
  {
    name: 'Signed source shadow',
    state: 'Evidence needed',
    detail: 'The direct-import workflow is ready, but the first 25-record source proof has not been supplied or evaluated.',
    nextStep: 'Create one signed, consent-proven, zero-contact 25-record shadow outside the repository.',
  },
  {
    name: 'Retell voice lane',
    state: 'Configuration needed',
    detail: 'The exact agent and LLM readiness checker is ready. It performs redacted reads only after the four required secret values are configured.',
    nextStep: 'Store the provider values in the secret manager, then run the read-only Retell readiness check.',
  },
  {
    name: 'Instantly / Mailgun email lane',
    state: 'No-send candidate ready',
    detail: 'The draft, small-cohort handoff, signed release candidate, and redacted event contract exist. No account, campaign, recipient list, or webhook is connected.',
    nextStep: 'Review sender identity, list hygiene, suppression handling, and the future provider adapter before any connection request.',
  },
  {
    name: 'Operator beats',
    state: 'Observer foundation ready',
    detail: 'MCP and Slack can present the bounded morning beat once independently provisioned. Teams remains unprovisioned pending bot registration and a durable reply outbox.',
    nextStep: 'Use one isolated test tenant and retain the observer-only command boundary.',
  },
] as const;

const OPERATOR_COMMANDS = [
  {
    label: 'Whole-pilot posture',
    command: 'npm run campaign:solar-exit:operator-preflight',
    detail: 'Reads only configured providers and returns a redacted snapshot. With no configuration, it makes zero provider calls.',
  },
  {
    label: 'Voice readiness',
    command: 'npm run retell:solar:readiness',
    detail: 'Checks the exact Retell agent/LLM configuration without placing a call.',
  },
  {
    label: 'Email release request',
    command: 'npm run email:elite-solar:release-candidate -- --template',
    detail: 'Prints a non-PII no-send request template; it cannot upload recipients or create a provider campaign.',
  },
] as const;

function laneVariant(state: LaunchLane['state']) {
  return state === 'No-send candidate ready' || state === 'Observer foundation ready'
    ? 'secondary'
    : 'outline';
}

/**
 * The single-screen, intentionally static first-pilot posture. Live provider
 * state can only be learned through the server-owned redacted preflight, never
 * from a browser toggle or a client-side credential.
 */
export const EliteSolarLaunchControl = () => (
  <section className="space-y-4" aria-labelledby="elite-solar-launch-control" data-testid="elite-solar-launch-control">
    <Card className="overflow-hidden border-primary/35 bg-gradient-to-br from-primary/[0.07] via-background to-amber-500/[0.06]">
      <CardHeader className="gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle id="elite-solar-launch-control" className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Elite Solar launch control
          </CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            A truthful first-pilot snapshot. This screen never reads a provider, starts a campaign, imports a record, or creates contact authority.
          </CardDescription>
        </div>
        <Badge variant="secondary" className="w-fit gap-1">
          <CircleAlert className="h-3.5 w-3.5" />
          Review-only posture
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">First launch proof</p>
            <p className="mt-1 text-sm font-semibold">Signed 25-record zero-contact shadow</p>
          </div>
          <div className="rounded-lg border bg-background/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary source</p>
            <p className="mt-1 text-sm font-semibold">Direct import; GHL is optional</p>
          </div>
          <div className="rounded-lg border bg-background/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Authority</p>
            <p className="mt-1 text-sm font-semibold">Calls, email, CRM, queues, and spend locked</p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-300/80 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 flex-none text-amber-700 dark:text-amber-400" />
            <div>
              <p className="font-semibold">The offline system is ready; the live release is not.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A green check below means the supporting workflow is built. It never means consent, provider health, a release, or permission to contact someone.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-4 md:grid-cols-2">
      {LAUNCH_LANES.map((lane) => (
        <Card key={lane.name} className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-base">{lane.name}</CardTitle>
              <Badge variant={laneVariant(lane.state)} className="shrink-0 text-xs">{lane.state}</Badge>
            </div>
            <CardDescription>{lane.detail}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
              <ArrowRight className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <p><span className="font-medium text-foreground">Next gate: </span>{lane.nextStep}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TerminalSquare className="h-5 w-5" />
          Safe operator runbook
        </CardTitle>
        <CardDescription>
          Run these locally only after keeping secrets outside the repository and chat. They are evidence checks, not launch buttons.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {OPERATOR_COMMANDS.map((item, index) => (
          <article key={item.command} className="rounded-lg border bg-muted/20 p-3">
            <div className="flex gap-3">
              {index === 1 ? <RadioTower className="mt-0.5 h-5 w-5 flex-none text-primary" /> : index === 2 ? <MailCheck className="mt-0.5 h-5 w-5 flex-none text-primary" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-primary" />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <code className="mt-2 block overflow-x-auto rounded bg-background px-2 py-1.5 text-xs text-foreground">{item.command}</code>
                <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>

    <Card className="border-dashed">
      <CardContent className="flex gap-3 pt-6">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-primary" />
        <div>
          <p className="font-semibold">Definition of a real first canary</p>
          <p className="mt-1 text-sm text-muted-foreground">
            First prove the signed source shadow, then the exact provider setup and 20 owned-phone lifecycles, then request a human-reviewed five-person cohort. Any hard failure returns the pilot to review; no UI state can bypass that sequence.
          </p>
        </div>
      </CardContent>
    </Card>
  </section>
);

export default EliteSolarLaunchControl;
