import { describe, expect, it } from 'vitest';
import { presentCampaignContactReleaseStatus } from '@/lib/campaignContactReleaseStatus';

describe('presentCampaignContactReleaseStatus', () => {
  it('never represents a release record as contact-ready', () => {
    expect(presentCampaignContactReleaseStatus('current_release_present')).toEqual({
      state: 'current_release_present',
      title: 'Release record present',
      detail: 'Per-contact server evaluation is still required before any call.',
      tone: 'caution',
    });
  });

  it.each([
    'no_release',
    'current_release_cohort_invalid',
    'latest_release_expired_or_revoked',
    'unavailable',
    'unrecognized_server_value',
  ])('treats %s as blocked or unknown', (state) => {
    expect(presentCampaignContactReleaseStatus(state).tone).toBe('critical');
  });
});
