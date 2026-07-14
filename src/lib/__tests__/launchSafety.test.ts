import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  browserContactEgressAllowed,
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

  it('keeps runtime diagnostics separate from complete launch evidence', () => {
    const ids = LAUNCH_CERTIFICATION_REQUIREMENTS.map((requirement) => requirement.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'recovered_database',
      'consent_policy',
      'provider_binding',
      'ghl_shadow',
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
