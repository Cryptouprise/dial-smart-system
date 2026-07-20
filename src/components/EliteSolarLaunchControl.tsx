import { type ChangeEvent, useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

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
    detail: 'The draft, handoff, signed release review, un-deployed single-use ledger, and redacted event contract exist. No account, campaign, recipient list, or webhook is connected.',
    nextStep: 'Certify the isolated database migration, then review sender identity, list hygiene, suppression handling, and the future provider adapter before any connection request.',
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
    label: 'Email release review',
    command: 'npm run email:elite-solar:review-release -- --draft <external-draft.json> --handoff <external-handoff.json> --release <external-release.json> --hmac-key-file <external-key.bin>',
    detail: 'Verifies the approved draft, handoff, and signed no-send release match. It cannot upload recipients or create a provider campaign.',
  },
  {
    label: 'Source proof compiler',
    command: 'npm run email:elite-solar:create-source-proof -- --source <external-permissioned-source.json> --recipient-hmac-key-file <external-key.bin> --signing-private-key-file <external-ed25519.pem> --signing-key-id <key-id> --signer-reference <signer-ref> --output <external-proof.json>',
    detail: 'Builds a signed, no-PII source/suppression proof from an external 1–25 record cohort. It has no provider client and never sends, imports, or uploads the source list.',
  },
] as const;

function laneVariant(state: LaunchLane['state']) {
  return state === 'No-send candidate ready' || state === 'Observer foundation ready'
    ? 'secondary'
    : 'outline';
}

type ServerPreflight = Readonly<{
  status: 'offline_bundle_ready_configuration_required' | 'offline_bundle_ready_readiness_blocked' | 'offline_bundle_ready_readiness_observed';
  providerReadProbeCalls: number;
}>;

type ReleaseRegistration = Readonly<{
  registered: boolean;
  releaseId: string;
  state: 'pending_adapter_provisioning';
}>;

type ReleasePreparation = Readonly<{
  prepared: boolean;
  state: 'prepared';
}>;

type EmailReleaseStatus = Readonly<{
  state: 'no_release' | 'pending_adapter_provisioning' | 'prepared' | 'claimed' | 'provider_accepted' | 'reconciliation_required' | 'completed' | 'held' | 'revoked' | 'expired';
  recipientCount: number;
  expiresAt: string | null;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function readServerPreflight(value: unknown): ServerPreflight | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const authority = record.authority;
  if (
    record.kind !== 'elite_solar_server_preflight_v1' ||
    ![
      'offline_bundle_ready_configuration_required',
      'offline_bundle_ready_readiness_blocked',
      'offline_bundle_ready_readiness_observed',
    ].includes(String(record.status)) ||
    !authority || typeof authority !== 'object' || Array.isArray(authority) ||
    !record.side_effect_invariants || typeof record.side_effect_invariants !== 'object' || Array.isArray(record.side_effect_invariants)
  ) return null;
  const authorityRecord = authority as Record<string, unknown>;
  if (
    authorityRecord.contact_authorized !== false ||
    authorityRecord.launch_authorized !== false ||
    authorityRecord.queue_mutation_authorized !== false ||
    authorityRecord.crm_write_authorized !== false ||
    authorityRecord.provider_write_authorized !== false ||
    authorityRecord.spend_authorized !== false
  ) return null;
  const effects = record.side_effect_invariants as Record<string, unknown>;
  const calls = effects.provider_read_probe_calls;
  if (
    typeof calls !== 'number' || !Number.isSafeInteger(calls) || calls < 0 || calls > 4 ||
    effects.database_reads !== 0 || effects.database_writes !== 0 ||
    effects.provider_writes !== 0 || effects.external_messages !== 0
  ) return null;
  return {
    status: record.status as ServerPreflight['status'],
    providerReadProbeCalls: calls,
  };
}

function readReleaseRegistration(value: unknown): ReleaseRegistration | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const authority = record.authority;
  const effects = record.side_effect_invariants;
  if (
    record.kind !== 'elite_email_release_registration_v1' ||
    typeof record.registered !== 'boolean' ||
    typeof record.release_id !== 'string' || !UUID.test(record.release_id) ||
    record.release_state !== 'pending_adapter_provisioning' ||
    record.provider_action !== 'none' ||
    !authority || typeof authority !== 'object' || Array.isArray(authority) ||
    !effects || typeof effects !== 'object' || Array.isArray(effects)
  ) return null;
  const authorityRecord = authority as Record<string, unknown>;
  const effectsRecord = effects as Record<string, unknown>;
  if (
    authorityRecord.contact_authorized !== false ||
    authorityRecord.launch_authorized !== false ||
    authorityRecord.queue_mutation_authorized !== false ||
    authorityRecord.crm_write_authorized !== false ||
    authorityRecord.provider_write_authorized !== false ||
    authorityRecord.spend_authorized !== false ||
    ![0, 1].includes(Number(effectsRecord.database_writes)) ||
    effectsRecord.provider_calls !== 0 || effectsRecord.external_messages !== 0
  ) return null;
  return {
    registered: record.registered,
    releaseId: record.release_id,
    state: 'pending_adapter_provisioning',
  };
}

function readReleasePreparation(value: unknown): ReleasePreparation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const authority = record.authority;
  const effects = record.side_effect_invariants;
  if (
    record.kind !== 'elite_email_release_preparation_v1' ||
    typeof record.prepared !== 'boolean' ||
    record.release_state !== 'prepared' ||
    record.provider_action !== 'none' ||
    !authority || typeof authority !== 'object' || Array.isArray(authority) ||
    !effects || typeof effects !== 'object' || Array.isArray(effects)
  ) return null;
  const authorityRecord = authority as Record<string, unknown>;
  const effectsRecord = effects as Record<string, unknown>;
  if (
    authorityRecord.contact_authorized !== false ||
    authorityRecord.launch_authorized !== false ||
    authorityRecord.queue_mutation_authorized !== false ||
    authorityRecord.crm_write_authorized !== false ||
    authorityRecord.provider_write_authorized !== false ||
    authorityRecord.spend_authorized !== false ||
    effectsRecord.database_writes !== 1 ||
    effectsRecord.provider_calls !== 0 ||
    effectsRecord.external_messages !== 0
  ) return null;
  return { prepared: record.prepared, state: 'prepared' };
}

function readEmailReleaseStatus(value: unknown): EmailReleaseStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const authority = record.authority;
  const effects = record.side_effect_invariants;
  const allowedStates = new Set<EmailReleaseStatus['state']>(['no_release', 'pending_adapter_provisioning', 'prepared', 'claimed', 'provider_accepted', 'reconciliation_required', 'completed', 'held', 'revoked', 'expired']);
  if (
    record.kind !== 'elite_email_release_status_v1' ||
    typeof record.release_state !== 'string' || !allowedStates.has(record.release_state as EmailReleaseStatus['state']) ||
    typeof record.recipient_count !== 'number' || !Number.isInteger(record.recipient_count) || record.recipient_count < 0 || record.recipient_count > 25 ||
    (record.expires_at !== null && (typeof record.expires_at !== 'string' || Number.isNaN(Date.parse(record.expires_at)))) ||
    record.provider_action !== 'none' ||
    !authority || typeof authority !== 'object' || Array.isArray(authority) ||
    !effects || typeof effects !== 'object' || Array.isArray(effects)
  ) return null;
  const authorityRecord = authority as Record<string, unknown>;
  const effectsRecord = effects as Record<string, unknown>;
  if (
    authorityRecord.contact_authorized !== false ||
    authorityRecord.launch_authorized !== false ||
    authorityRecord.queue_mutation_authorized !== false ||
    authorityRecord.crm_write_authorized !== false ||
    authorityRecord.provider_write_authorized !== false ||
    authorityRecord.spend_authorized !== false ||
    effectsRecord.database_reads !== 1 || effectsRecord.database_writes !== 0 ||
    effectsRecord.provider_calls !== 0 || effectsRecord.external_messages !== 0
  ) return null;
  return {
    state: record.release_state as EmailReleaseStatus['state'],
    recipientCount: record.recipient_count,
    expiresAt: record.expires_at as string | null,
  };
}

function emailReleaseStatusMessage(status: EmailReleaseStatus) {
  if (status.state === 'no_release') return 'No durable email release is recorded yet. No provider action occurred.';
  if (status.state === 'pending_adapter_provisioning') return `A ${status.recipientCount}-recipient release is pending source-proof preparation. No provider action occurred.`;
  if (status.state === 'prepared') return `A ${status.recipientCount}-recipient release is prepared but unclaimed. No provider action occurred.`;
  if (status.state === 'held' || status.state === 'revoked' || status.state === 'expired') return `The latest email release is ${status.state}. It cannot be used for provider action.`;
  return `The latest email release is ${status.state}. Review the server-owned ledger; this status view has no execution authority.`;
}

/**
 * The single-screen, intentionally static first-pilot posture. Live provider
 * state can only be learned through the server-owned redacted preflight, never
 * from a browser toggle or a client-side credential.
 */
export const EliteSolarLaunchControl = () => {
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [serverPreflight, setServerPreflight] = useState<ServerPreflight | 'unavailable' | null>(null);
  const [isRegisteringRelease, setIsRegisteringRelease] = useState(false);
  const [releaseRegistration, setReleaseRegistration] = useState<ReleaseRegistration | 'unavailable' | null>(null);
  const [isPreparingRelease, setIsPreparingRelease] = useState(false);
  const [releasePreparation, setReleasePreparation] = useState<ReleasePreparation | 'unavailable' | null>(null);
  const [isCheckingEmailReleaseStatus, setIsCheckingEmailReleaseStatus] = useState(false);
  const [emailReleaseStatus, setEmailReleaseStatus] = useState<EmailReleaseStatus | 'unavailable' | null>(null);
  const releaseFileInput = useRef<HTMLInputElement>(null);
  const sourceAttestationFileInput = useRef<HTMLInputElement>(null);

  const checkServerPreflight = async () => {
    setIsCheckingServer(true);
    setServerPreflight(null);
    try {
      const { data, error } = await supabase.functions.invoke('elite-solar-preflight', { body: {} });
      setServerPreflight(error ? 'unavailable' : readServerPreflight(data) ?? 'unavailable');
    } catch {
      setServerPreflight('unavailable');
    } finally {
      setIsCheckingServer(false);
    }
  };

  const registerSelectedRelease = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > 16 * 1024) {
      setReleaseRegistration('unavailable');
      return;
    }
    setIsRegisteringRelease(true);
    setReleaseRegistration(null);
    setReleasePreparation(null);
    try {
      const candidate = JSON.parse(await file.text()) as unknown;
      const { data, error } = await supabase.functions.invoke('elite-email-release-registration', { body: candidate });
      setReleaseRegistration(error ? 'unavailable' : readReleaseRegistration(data) ?? 'unavailable');
    } catch {
      setReleaseRegistration('unavailable');
    } finally {
      setIsRegisteringRelease(false);
    }
  };

  const prepareSelectedRelease = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > 16 * 1024 || !releaseRegistration || releaseRegistration === 'unavailable') {
      setReleasePreparation('unavailable');
      return;
    }
    setIsPreparingRelease(true);
    setReleasePreparation(null);
    try {
      const attestation = JSON.parse(await file.text()) as unknown;
      const { data, error } = await supabase.functions.invoke('elite-email-release-preparation', {
        body: { release_id: releaseRegistration.releaseId, attestation },
      });
      setReleasePreparation(error ? 'unavailable' : readReleasePreparation(data) ?? 'unavailable');
    } catch {
      setReleasePreparation('unavailable');
    } finally {
      setIsPreparingRelease(false);
    }
  };

  const checkEmailReleaseStatus = async () => {
    setIsCheckingEmailReleaseStatus(true);
    setEmailReleaseStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('elite-email-release-status', { body: {} });
      setEmailReleaseStatus(error ? 'unavailable' : readEmailReleaseStatus(data) ?? 'unavailable');
    } catch {
      setEmailReleaseStatus('unavailable');
    } finally {
      setIsCheckingEmailReleaseStatus(false);
    }
  };

  return (
  <section className="space-y-4" aria-labelledby="elite-solar-launch-control" data-testid="elite-solar-launch-control">
    <Card className="overflow-hidden border-primary/35 bg-gradient-to-br from-primary/[0.07] via-background to-amber-500/[0.06]">
      <CardHeader className="gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle id="elite-solar-launch-control" className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Elite Solar launch control
          </CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            A truthful first-pilot snapshot. It makes no automatic provider read and can never start a campaign, import a record, or create contact authority.
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

    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MailCheck className="h-5 w-5" />
          Email release ledger status
        </CardTitle>
        <CardDescription>
          Read the current Elite Solar email-release state from the server-owned ledger. It returns only a state, bounded cohort count, and expiry—never recipients, copy, credentials, or provider account details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" onClick={checkEmailReleaseStatus} disabled={isCheckingEmailReleaseStatus}>
          <MailCheck className="mr-2 h-4 w-4" />
          {isCheckingEmailReleaseStatus ? 'Reading release status…' : 'Check email release status'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Until the ledger migration and exact server configuration are deployed, this reports unavailable and performs zero provider calls.
        </p>
        {emailReleaseStatus === 'unavailable' && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100" aria-live="polite">
            Email release status is not provisioned for this session. No provider status was read.
          </p>
        )}
        {emailReleaseStatus && emailReleaseStatus !== 'unavailable' && (
          <p className="rounded-md border bg-muted/30 p-3 text-sm" aria-live="polite">
            {emailReleaseStatusMessage(emailReleaseStatus)}
          </p>
        )}
      </CardContent>
    </Card>

    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <RadioTower className="h-5 w-5" />
          Secured server preflight
        </CardTitle>
        <CardDescription>
          This is the only provider check in Elite Launch Control. It runs only when you press the button, uses the signed-in owner session, and requests no contacts, campaign settings, or credentials from the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" onClick={checkServerPreflight} disabled={isCheckingServer}>
          <RadioTower className="mr-2 h-4 w-4" />
          {isCheckingServer ? 'Checking redacted readiness…' : 'Check secured provider readiness'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Until the endpoint is deployed, enabled for the exact Elite owner/origin, and supplied with server-only secrets, this returns “not provisioned” and performs zero provider reads.
        </p>
        {serverPreflight === 'unavailable' && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100" aria-live="polite">
            Server preflight is not provisioned for this session. No provider status was read.
          </p>
        )}
        {serverPreflight && serverPreflight !== 'unavailable' && (
          <p className="rounded-md border bg-muted/30 p-3 text-sm" aria-live="polite">
            {serverPreflight.status === 'offline_bundle_ready_readiness_observed'
              ? `Redacted provider readiness observed (${serverPreflight.providerReadProbeCalls} GET checks). Contact authority remains locked.`
              : serverPreflight.status === 'offline_bundle_ready_configuration_required'
                ? 'Server preflight is configured but one or more provider lanes still need server-only configuration. Contact authority remains locked.'
                : 'Server preflight found a readiness issue. Review the redacted operator output; contact authority remains locked.'}
          </p>
        )}
      </CardContent>
    </Card>

    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MailCheck className="h-5 w-5" />
          Register reviewed email release
        </CardTitle>
        <CardDescription>
          Choose the signed, no-PII release artifact you reviewed outside the app. The server verifies it against its own key and can only record a pending release; it cannot prepare, claim, send, import, or contact a provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={releaseFileInput}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="Choose signed release artifact"
          onChange={registerSelectedRelease}
        />
        <Button type="button" variant="outline" onClick={() => releaseFileInput.current?.click()} disabled={isRegisteringRelease}>
          <MailCheck className="mr-2 h-4 w-4" />
          {isRegisteringRelease ? 'Verifying release artifactâ€¦' : 'Choose signed release artifact'}
        </Button>
        <p className="text-xs text-muted-foreground">
          The browser reads only the file you choose and sends it once to the authenticated server boundary. The artifact must remain free of recipients, message content, keys, and credentials.
        </p>
        {releaseRegistration === 'unavailable' && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100" aria-live="polite">
            Release registration is unavailable or held. No release was prepared, claimed, or sent, and no provider action occurred.
          </p>
        )}
        {releaseRegistration && releaseRegistration !== 'unavailable' && (
          <p className="rounded-md border bg-muted/30 p-3 text-sm" aria-live="polite">
            {releaseRegistration.registered
              ? 'Signed release registered. It remains pending adapter verification; no provider action occurred.'
              : 'This signed release was already registered and remains pending adapter verification; no provider action occurred.'}
          </p>
        )}
      </CardContent>
    </Card>

    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" />
          Prepare exact source proof
        </CardTitle>
        <CardDescription>
          After a signed release is registered, choose the matching signed source/suppression proof. The server checks its key, freshness, exact release digests, and stop controls before it can prepare the release. Preparation is not a claim or a send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={sourceAttestationFileInput}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="Choose signed source proof"
          onChange={prepareSelectedRelease}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => sourceAttestationFileInput.current?.click()}
          disabled={isPreparingRelease || !releaseRegistration || releaseRegistration === 'unavailable'}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {isPreparingRelease ? 'Verifying source proof…' : 'Choose signed source proof'}
        </Button>
        <p className="text-xs text-muted-foreground">
          This control stays unavailable until a release is registered in this session. It accepts only the no-PII proof you select and never uploads a list, message, sender credential, or provider key.
        </p>
        {releasePreparation === 'unavailable' && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100" aria-live="polite">
            Source proof preparation is unavailable or held. No release was claimed or sent, and no provider action occurred.
          </p>
        )}
        {releasePreparation && releasePreparation !== 'unavailable' && (
          <p className="rounded-md border bg-muted/30 p-3 text-sm" aria-live="polite">
            {releasePreparation.prepared
              ? 'Signed source proof recorded and release prepared. It is still unclaimed; no provider action occurred.'
              : 'This exact source proof was already prepared. It is still unclaimed; no provider action occurred.'}
          </p>
        )}
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
};

export default EliteSolarLaunchControl;
