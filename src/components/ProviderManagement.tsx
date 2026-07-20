/**
 * Provider binding readiness center.
 *
 * Provider credentials and phone resources are an external authority boundary:
 * entering an API key in a browser, toggling a provider active, importing a
 * number, or firing a test request cannot prove tenant ownership or prevent
 * spend. This component intentionally contains no mutation controls. A future
 * server-side binding service may surface non-secret evidence here only after
 * it has been independently certified.
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, KeyRound, LockKeyhole, Phone, ShieldCheck, Webhook } from 'lucide-react';

type ProviderReadiness = Readonly<{
  name: string;
  state: 'Primary source' | 'Required next' | 'Optional adapter' | 'Deferred';
  focus: string;
  requiredEvidence: readonly string[];
}>;

const PROVIDER_READINESS: readonly ProviderReadiness[] = [
  {
    name: 'Elite signed direct import',
    state: 'Primary source',
    focus: 'GHL-independent, user-owned source export for the first Elite shadow',
    requiredEvidence: [
      'One organization, legal seller, approved lead source, and exact consent artifact binding',
      'Pinned Ed25519 public-key fingerprint, short-lived signature, and a redacted zero-contact reconciliation',
      'No browser upload, CRM write, queue change, provider call, text, booking, or workflow action',
    ],
  },
  {
    name: 'Retell AI',
    state: 'Required next',
    focus: 'Voice agent and call lifecycle provider',
    requiredEvidence: [
      'Tenant-owned agent and exact LLM/version fingerprints',
      'Signed webhook identity plus deterministic call and billing reconciliation',
      'Owned caller-ID resource, balance proof, global stop, and suppression checks',
    ],
  },
  {
    name: 'Telnyx',
    state: 'Deferred',
    focus: 'Future telephony, phone-number, and AI-assistant provider',
    requiredEvidence: [
      'Tenant-owned number, connection, assistant, voice, and routing identifiers',
      'Signed inbound callback evidence and a provider-side spend owner',
      'Separate proof for voice and messaging; SMS remains off unless independently certified',
    ],
  },
  {
    name: 'GoHighLevel',
    state: 'Optional adapter',
    focus: 'Optional CRM shadow source, never a contact authority',
    requiredEvidence: [
      'Exact location, mapping version, source disclosure, consent artifact, and lead identity rules',
      'Signed zero-contact shadow ingest and independent reconciliation export',
      'No queue, CRM mutation, call, text, booking, or workflow effect during the first shadow',
    ],
  },
] as const;

const BINDING_STEPS = [
  'Provision the Elite signed-direct-import key material outside the repository, then pin only its public fingerprint in an isolated release candidate.',
  'Verify a 25-record Elite source shadow with zero contact or CRM/provider side effects. GHL is optional for this step.',
  'A service-side owner stores the Retell credential in the approved secret store; it never enters this browser or a client-side database row.',
  'The binding service verifies the exact Retell account and resource ownership, then records non-secret agent, number, webhook, and balance fingerprints against one organization.',
  'A human reviewer certifies the candidate bundle alongside consent, DNC, jurisdiction, policy, balance, and global-stop evidence before company-owned phone testing.',
  'Only a later, separately reviewed server release may use the certified bundle for 20 owned-phone lifecycles and then a five-person human canary.',
] as const;

function badgeVariant(state: ProviderReadiness['state']) {
  if (state === 'Primary source') return 'default' as const;
  if (state === 'Required next') return 'secondary' as const;
  return 'outline' as const;
}
export const ProviderManagement = () => (
  <div className="space-y-6" data-testid="provider-binding-center">
    <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Provider binding center
        </CardTitle>
        <CardDescription>
          Elite direct import, Retell, Telnyx, and GoHighLevel are tenant-bound evidence -- not browser configuration forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-background/80 p-3 dark:border-amber-800">
          <LockKeyhole className="mt-0.5 h-5 w-5 flex-none text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-semibold">No provider is certified in this browser</p>
            <p className="mt-1 text-muted-foreground">
              Elite begins with a signed direct export; GHL is optional. There is deliberately no API-key field, activate switch, number import, connection test, or spend action here. A green UI control would not prove the account, phone number, webhook, or balance belongs to the selected tenant.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border p-3"><KeyRound className="mb-2 h-4 w-4 text-primary" /><p className="font-medium">Secrets stay server-side</p><p className="mt-1 text-xs text-muted-foreground">Credentials belong in the approved secret store, referenced by a non-secret binding record.</p></div>
          <div className="rounded-md border p-3"><Phone className="mb-2 h-4 w-4 text-primary" /><p className="font-medium">Resources are tenant-owned</p><p className="mt-1 text-xs text-muted-foreground">Every agent, number, connection, webhook, and balance must be bound to one organization.</p></div>
          <div className="rounded-md border p-3"><Webhook className="mb-2 h-4 w-4 text-primary" /><p className="font-medium">Callbacks are evidence</p><p className="mt-1 text-xs text-muted-foreground">Signed callbacks and reconciled outcomes must match the exact certified resource bundle.</p></div>
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-4 lg:grid-cols-4">
      {PROVIDER_READINESS.map((provider) => (
        <Card key={provider.name}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{provider.name}</CardTitle>
                <CardDescription className="mt-1">{provider.focus}</CardDescription>
              </div>
              <Badge variant={badgeVariant(provider.state)}>{provider.state}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {provider.requiredEvidence.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">-</span><span>{item}</span></li>)}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />Binding path</CardTitle>
        <CardDescription>This is the required sequence before any provider path can participate in a campaign release.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {BINDING_STEPS.map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span><span className="pt-1 text-muted-foreground">{step}</span></li>)}
        </ol>
      </CardContent>
    </Card>
  </div>
);

export default ProviderManagement;
