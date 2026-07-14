import { describe, expect, it } from 'vitest';
import { SOLAR_EXIT_REVIEW_BRIEF } from '../solarExitCampaignBrief';

describe('SOLAR_EXIT_REVIEW_BRIEF', () => {
  it('is explicitly a no-contact human-review artifact', () => {
    expect(SOLAR_EXIT_REVIEW_BRIEF.status).toMatch(/no-contact/i);
    expect(SOLAR_EXIT_REVIEW_BRIEF.prohibitedActions).toEqual(expect.arrayContaining([
      'call',
      'text',
      'CRM write',
      'provider request',
      'automatic follow-up',
    ]));
  });

  it('uses qualified language and avoids guaranteed outcomes', () => {
    const copy = [
      SOLAR_EXIT_REVIEW_BRIEF.opening,
      SOLAR_EXIT_REVIEW_BRIEF.disclosure,
      ...SOLAR_EXIT_REVIEW_BRIEF.permittedStatements,
      ...SOLAR_EXIT_REVIEW_BRIEF.hardStops,
      SOLAR_EXIT_REVIEW_BRIEF.handoff,
    ].join(' ').toLowerCase();

    expect(copy).toContain('cannot promise');
    expect(copy).toContain('cannot give legal or financial advice');
    expect(copy).not.toContain('we guarantee');
  });

  it('collects only intake and handoff context', () => {
    expect(SOLAR_EXIT_REVIEW_BRIEF.questions).toHaveLength(6);
    expect(SOLAR_EXIT_REVIEW_BRIEF.reviewDispositions).toEqual(expect.arrayContaining([
      'do_not_contact',
      'requested_human_review',
    ]));
  });
});
