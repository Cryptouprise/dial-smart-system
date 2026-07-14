import { ArrowRight, Building2, CheckCircle2, LockKeyhole, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type PilotState = 'First up' | 'Blocked by evidence' | 'Synthetic only';

type TenantPilot = Readonly<{
  name: string;
  state: PilotState;
  objective: string;
  nextGate: string;
  evidence: readonly string[];
}>;

const TENANT_PILOTS: readonly TenantPilot[] = [
  {
    name: 'Elite Solar Recovery',
    state: 'First up',
    objective: 'Solar Contract Exit speed-to-lead: prove one signed GHL zero-contact shadow lane before any live cohort.',
    nextGate: 'Bind one GHL location, signed consent mapping, approved claims policy, and an owned Retell or Telnyx test number.',
    evidence: [
      '25 consented records evaluated with zero GHL, queue, call, text, or provider side effects',
      'Exact agent, LLM, webhook, caller-ID, balance, and tenant binding recorded',
      'Twenty company-owned-phone lifecycles reconciled before a five-person human canary',
    ],
  },
  {
    name: 'Omega Accounting',
    state: 'Blocked by evidence',
    objective: 'Second organization: prove that a speed-to-lead setup cannot see, select, or affect Elite Solar resources.',
    nextGate: 'Bind a separate GHL location, policy packet, provider resources, and owner/admin identity only after the Elite shadow result is reviewed.',
    evidence: [
      'Cross-tenant negative tests for users, leads, campaigns, caller IDs, webhooks, receipts, and provider resources',
      'Independent consent, DNC, claims, calling-window, and escalation policy evidence',
      'A separate no-contact shadow reconciliation with no shared external identity',
    ],
  },
  {
    name: 'Noble Gold',
    state: 'Blocked by evidence',
    objective: 'Third tenant: validate that another regulated vertical receives its own policy and isolation path, not recycled Solar assumptions.',
    nextGate: 'Supply Noble Gold’s approved lead source, disclosures, product-claims limits, calling geography, and escalation owner.',
    evidence: [
      'Tenant-specific policy and consent artifacts, never copied from another organization',
      'Dedicated provider and CRM bindings with negative cross-tenant checks',
      'No-contact source reconciliation before any owned-phone test',
    ],
  },
  {
    name: 'Infinite AI',
    state: 'Synthetic only',
    objective: 'Internal proving ground: exercise command, routing, failure, replay, and stop-drill paths with non-production data.',
    nextGate: 'Use only synthetic people, company-owned phones, and isolated test credentials until every external control-plane check is retained.',
    evidence: [
      'Duplicate webhook, stale credential, timeout, global-stop, DNC, and provider-failure drills',
      'Slack, Teams, Zapier, and MCP observer commands prove tenant isolation without real lead data',
      'No campaign, CRM, provider, spend, or contact authority in this environment',
    ],
  },
] as const;

const STATE_VARIANTS: Record<PilotState, 'default' | 'secondary' | 'outline'> = {
  'First up': 'default',
  'Blocked by evidence': 'secondary',
  'Synthetic only': 'outline',
};

/**
 * Makes the multi-account rollout visible without inventing a launch toggle.
 * It intentionally has no mutation or integration action: the next gate for
 * each tenant is external, evidence-bound work that must be certified on the
 * server rather than selected by a browser.
 */
export const TenantPilotPortfolio = () => (
  <div className="space-y-6">
    <Card className="border-sky-300 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Pilot portfolio: four tenants, one evidence boundary
        </CardTitle>
        <CardDescription>
          Elite Solar Recovery is the first real-input shadow. Omega Accounting proves multi-account isolation next; Noble Gold is a separate policy lane; Infinite AI stays synthetic.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-md border border-sky-300 bg-background/80 p-3 text-sm dark:border-sky-900">
          <Shield className="mt-0.5 h-5 w-5 flex-none text-sky-700 dark:text-sky-300" />
          <p>
            Moving from one card to the next is not automatic. Each tenant needs its own identity, consent and policy evidence, CRM mapping, provider binding, reconciliation, and human review. No card creates a campaign, imports a lead, or contacts anyone.
          </p>
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-4 xl:grid-cols-2">
      {TENANT_PILOTS.map((pilot, index) => (
        <Card key={pilot.name} data-testid={`tenant-pilot-${pilot.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{pilot.name}</CardTitle>
                <CardDescription className="mt-1">{pilot.objective}</CardDescription>
              </div>
              <Badge variant={STATE_VARIANTS[pilot.state]}>{pilot.state}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 rounded-md border bg-muted/40 p-3 text-sm">
              <ArrowRight className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <div>
                <p className="font-medium">Next evidence gate</p>
                <p className="mt-1 text-muted-foreground">{pilot.nextGate}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Proof required before it advances
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {pilot.evidence.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}
              </ul>
            </div>
            {index < TENANT_PILOTS.length - 1 && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" />Next tenant remains locked until this evidence is retained.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

export default TenantPilotPortfolio;
