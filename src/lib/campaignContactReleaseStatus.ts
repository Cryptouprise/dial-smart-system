export type CampaignContactReleaseState =
  | 'no_release'
  | 'current_release_present'
  | 'current_release_cohort_invalid'
  | 'latest_release_expired_or_revoked'
  | 'unavailable'
  | 'unknown';

export interface CampaignContactReleaseStatus {
  release_state: string;
  release_stage: string | null;
  release_expires_at: string | null;
  cohort_limit: number | null;
  cohort_member_count: number | null;
  final_contact_evaluation_required: boolean;
}

export interface CampaignContactReleasePresentation {
  state: CampaignContactReleaseState;
  title: string;
  detail: string;
  tone: 'critical' | 'caution';
}

// This presentation intentionally has no "ready" state. A current release
// record only proves that the campaign has a scoped evidence record; the
// server still evaluates the individual lead and live provider configuration
// immediately before any provider call is created.
export function presentCampaignContactReleaseStatus(
  releaseState: string | null | undefined,
): CampaignContactReleasePresentation {
  switch (releaseState) {
    case 'current_release_present':
      return {
        state: 'current_release_present',
        title: 'Release record present',
        detail: 'Per-contact server evaluation is still required before any call.',
        tone: 'caution',
      };
    case 'no_release':
      return {
        state: 'no_release',
        title: 'No contact release',
        detail: 'Every live campaign contact remains blocked.',
        tone: 'critical',
      };
    case 'current_release_cohort_invalid':
      return {
        state: 'current_release_cohort_invalid',
        title: 'Release cohort is invalid',
        detail: 'Every live campaign contact remains blocked until the server-side evidence is corrected.',
        tone: 'critical',
      };
    case 'latest_release_expired_or_revoked':
      return {
        state: 'latest_release_expired_or_revoked',
        title: 'Latest contact release is inactive',
        detail: 'Every live campaign contact remains blocked.',
        tone: 'critical',
      };
    case 'unavailable':
      return {
        state: 'unavailable',
        title: 'Release status unavailable',
        detail: 'Treat contact as blocked until the server status can be read.',
        tone: 'critical',
      };
    default:
      return {
        state: 'unknown',
        title: 'Unknown release status',
        detail: 'Treat contact as blocked until the status is understood and verified server-side.',
        tone: 'critical',
      };
  }
}
