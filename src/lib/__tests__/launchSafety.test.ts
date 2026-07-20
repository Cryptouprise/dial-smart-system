import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  browserContactEgressAllowed,
  browserProviderAdministrationAllowed,
  browserCallDispatchAllowed,
  browserCampaignConfigurationMutationAllowed,
  browserCampaignStatusMutationAllowed,
  ACTIVE_CAMPAIGN_CONFIGURATION_LAUNCH_LOCK_MESSAGE,
  CALL_DISPATCH_LAUNCH_LOCK_MESSAGE,
  CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE,
  LAUNCH_CERTIFICATION_REQUIREMENTS,
} from '../launchSafety';

describe('campaign activation launch boundary', () => {
  it('allows browser pause but never browser activation', () => {
    expect(browserCampaignStatusMutationAllowed('paused')).toBe(true);
    expect(browserCampaignStatusMutationAllowed('active')).toBe(false);
    expect(browserCampaignStatusMutationAllowed('draft')).toBe(false);
    expect(browserCampaignStatusMutationAllowed('completed')).toBe(false);
  });

  it('explains that activation must cross an audited server boundary', () => {
    expect(CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE).toMatch(/server-side promotion/i);
    expect(CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE).toMatch(/campaign remains unchanged/i);
  });

  it('requires an active campaign to be paused before browser configuration changes', () => {
    expect(browserCampaignConfigurationMutationAllowed('draft')).toBe(true);
    expect(browserCampaignConfigurationMutationAllowed('paused')).toBe(true);
    expect(browserCampaignConfigurationMutationAllowed('active')).toBe(false);
    expect(browserCampaignConfigurationMutationAllowed('completed')).toBe(false);
    expect(browserCampaignConfigurationMutationAllowed('')).toBe(false);
    expect(ACTIVE_CAMPAIGN_CONFIGURATION_LAUNCH_LOCK_MESSAGE).toMatch(/pause the campaign/i);
    expect(ACTIVE_CAMPAIGN_CONFIGURATION_LAUNCH_LOCK_MESSAGE).toMatch(/no campaign data was changed/i);
  });

  it('fails closed for every browser dispatch attempt', () => {
    expect(browserCallDispatchAllowed()).toBe(false);
    expect(CALL_DISPATCH_LAUNCH_LOCK_MESSAGE).toMatch(/manual and automatic browser dispatch/i);
    expect(CALL_DISPATCH_LAUNCH_LOCK_MESSAGE).toMatch(/no calls were started/i);
  });

  it('keeps browser contact egress locked even when a control is labelled as a test', () => {
    expect(browserContactEgressAllowed()).toBe(false);
  });

  it('keeps browser provider administration locked because it can create spend or bind a caller ID', () => {
    expect(browserProviderAdministrationAllowed()).toBe(false);
  });

  it('places the browser contact-egress lock before every legacy contact test surface', () => {
    const surfaces = [
      ['../../components/AgentEditDialog.tsx', 'const startTestCall', "invoke('outbound-calling'"],
      ['../../hooks/useBroadcastReadiness.ts', 'const runTestBatch', "invoke('voice-broadcast-engine'"],
      ['../../hooks/useAiSmsMessaging.ts', 'const sendMessage', "invoke('sms-messaging'"],
    ] as const;

    for (const [path, boundary, providerInvoke] of surfaces) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      const segment = source.slice(source.indexOf(boundary), source.indexOf(providerInvoke));

      expect(source.indexOf(boundary), path).toBeGreaterThanOrEqual(0);
      expect(source.indexOf(providerInvoke), path).toBeGreaterThan(source.indexOf(boundary));
      expect(segment, path).toMatch(/browserContactEgressAllowed\(\)/);
      expect(segment, path).toMatch(/CONTACT_EGRESS_LAUNCH_LOCK_MESSAGE/);
    }
  });

  it('does not present inventory or browser controls as a live campaign promise', () => {
    const commandCenterPath = '../../components/CommandCenter.tsx';
    const dashboardPath = '../../components/Dashboard.tsx';
    const commandCenter = readFileSync(new URL(commandCenterPath, import.meta.url), 'utf8');
    const dashboard = readFileSync(new URL(dashboardPath, import.meta.url), 'utf8');

    expect(commandCenter).not.toMatch(/launch your first campaign in minutes/i);
    expect(commandCenter).not.toMatch(/let AI run your campaigns on autopilot/i);
    expect(commandCenter).toMatch(/review-only/i);
    expect(commandCenter).toMatch(/Elite Solar Recovery: first release path/i);
    expect(commandCenter).toMatch(/Direct signed import is the primary source/i);
    expect(commandCenter).not.toMatch(/Buy Numbers/i);
    expect(dashboard).not.toMatch(/Test Call Initiated/i);
    expect(dashboard).not.toMatch(/Number Released/i);
    expect(dashboard).not.toMatch(/Purchase some numbers to get started/i);
    expect(dashboard).toMatch(/Browser procurement is intentionally locked/i);
    expect(dashboard).toMatch(/CONTACT_EGRESS_LAUNCH_LOCK_MESSAGE/);
    expect(dashboard).toMatch(/QUARANTINE_RELEASE_LAUNCH_LOCK_MESSAGE/);
  });

  it('keeps a campaign-wizard template inactive while the campaign is a draft', () => {
    const path = '../../components/CampaignWizard.tsx';
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const templateCreation = source.slice(
      source.indexOf('const handleCreateFromTemplate'),
      source.indexOf('const handleCreate ='),
    );
    const campaignCreation = source.slice(source.indexOf('const handleCreate ='));

    expect(templateCreation).toMatch(/active:\s*false/);
    expect(templateCreation).not.toMatch(/active:\s*true/);
    expect(campaignCreation).toMatch(/status:\s*'draft'/);
    expect(source).toMatch(/Build a review-only campaign draft/i);
  });

  it('provides a non-contact Solar Contract Exit review-only draft profile', () => {
    const path = '../../components/CampaignWizard.tsx';
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const profileStart = source.indexOf("id: 'solar_contract_exit'");
    const profileEnd = source.indexOf("id: 'solar_qualified'");
    const templateStart = source.indexOf("id: 'solar_contract_exit_intake'");
    const templateEnd = source.indexOf("id: 'speed_to_lead'", templateStart);
    const profile = source.slice(profileStart, profileEnd);
    const template = source.slice(templateStart, templateEnd);

    expect(profileStart).toBeGreaterThanOrEqual(0);
    expect(templateStart).toBeGreaterThanOrEqual(0);
    expect(profile).toMatch(/smsOnNoAnswer:\s*false/);
    expect(profile).toMatch(/No legal or financial advice/i);
    expect(profile).toMatch(/No SMS, voicemail, transfer, booking, or automatic follow-up/i);
    expect(template).toMatch(/step_type:\s*'wait'/);
    expect(template).not.toMatch(/step_type:\s*'(call|sms|ai_sms)'/);
  });

  it('keeps first-run onboarding focused on review and certification, not immediate calling', () => {
    const path = '../../components/ai-configuration/OnboardingWizard.tsx';
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');

    expect(source).not.toMatch(/Let's get you making calls in minutes/i);
    expect(source).not.toMatch(/Then you'll be ready to start calling/i);
    expect(source).toMatch(/review-only launch packet/i);
    expect(source).toMatch(/zero-contact shadow/i);
  });

  it('blocks browser phone-number procurement and import before provider helper calls', () => {
    const path = '../../components/PhoneNumberPurchasing.tsx';
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const purchaseSegment = source.slice(source.indexOf('const handlePurchase'), source.indexOf('const handleImportSelected'));
    const importSegment = source.slice(source.indexOf('const handleImportSelected'), source.indexOf('const handleSyncAll'));
    const syncSegment = source.slice(source.indexOf('const handleSyncAll'), source.indexOf('const toggleNumberSelection'));

    for (const [segment, helper] of [
      [purchaseSegment, 'await purchaseNumbers'],
      [importSegment, 'await importNumber'],
      [syncSegment, 'await syncAllNumbers'],
    ]) {
      expect(segment).toMatch(/browserProviderAdministrationAllowed\(\)/);
      expect(segment).toMatch(/PROVIDER_ADMIN_LAUNCH_LOCK_MESSAGE/);
      expect(segment.indexOf('browserProviderAdministrationAllowed()')).toBeLessThan(segment.indexOf(helper));
    }
  });

  it('keeps runtime diagnostics separate from complete launch evidence', () => {
    const ids = LAUNCH_CERTIFICATION_REQUIREMENTS.map((requirement) => requirement.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'recovered_database',
      'consent_policy',
      'provider_binding',
      'source_shadow',
      'owned_phone_20',
      'stop_drills',
      'launch_approvals',
    ]));
    expect(LAUNCH_CERTIFICATION_REQUIREMENTS.every((requirement) => (
      requirement.label.length > 0 && requirement.nextStep.length > 20
    ))).toBe(true);
  });

  it('does not present basic browser checks as permission to launch', () => {
    const surfaces = [
      '../../components/CampaignLaunchVerification.tsx',
      '../../components/CampaignReadinessChecker.tsx',
      '../../components/CampaignLauncher.tsx',
      '../../components/QuickLaunchButton.tsx',
      '../../components/CampaignWizard.tsx',
    ];
    const falseGreen = /\bready to launch\b|ready for high-volume|you can still launch|>\s*Launch Campaign\s*</i;

    for (const path of surfaces) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source, path).not.toMatch(falseGreen);
    }
  });

  it('keeps legacy simulator diagnostics separate from call or capacity certification', () => {
    const path = '../../components/CallSimulator.tsx';
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');

    expect(source).toMatch(/const LIVE_CALL_CERTIFICATION_ENABLED = false/);
    expect(source).toMatch(/const CAPACITY_CERTIFICATION_ENABLED = false/);
    expect(source).not.toMatch(/System ready for testing|Ready for \$\{simulatedLeadCount[^}]*\} leads/i);
    expect(source).toMatch(/does not certify capacity or authorize/i);
  });

  it('labels caller-ID inventory as configuration evidence, not call permission', () => {
    const path = '../../hooks/useCampaignReadiness.ts';
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');

    expect(source).not.toMatch(/phone\(s\) ready for calls/i);
    expect(source).toMatch(/configuration inventory only — launch remains locked/i);
  });
});
