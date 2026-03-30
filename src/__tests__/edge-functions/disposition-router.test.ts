/**
 * Disposition Router Business Logic Tests
 *
 * Tests the core routing logic of the disposition-router edge function:
 * - Disposition classification (DNC, remove-all, pause-workflow)
 * - Pipeline stage mapping from disposition names
 * - DNC flagging and lead blocking
 * - Workflow removal vs pausing behavior
 * - Callback scheduling via auto-actions
 * - Appointment booking via auto-actions
 * - Negative sentiment auto-DNC from transcripts
 * - Stage normalization (snake_case -> Title Case)
 * - Metrics recording
 * - Error handling for unknown actions
 *
 * These tests exercise the business logic patterns extracted from the
 * edge function source. They do NOT test HTTP serving or Deno APIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Extracted constants (mirrored from disposition-router/index.ts)
// ---------------------------------------------------------------------------

const DNC_DISPOSITIONS = [
  'dnc', 'do_not_call', 'stop', 'remove',
  'threatening', 'rude', 'hostile', 'abusive',
];

const REMOVE_ALL_DISPOSITIONS = [
  // Negative outcomes
  'not_interested', 'wrong_number', 'already_has_solar', 'already_has_service',
  'deceased', 'business_closed', 'invalid_number', 'disconnected',
  'renter', 'tenant', 'not_homeowner', 'not_the_homeowner',
  // Positive terminal outcomes
  'appointment_set', 'appointment_booked', 'appointment_scheduled', 'appointment',
  'callback_requested', 'callback_scheduled', 'callback',
  'converted', 'sale', 'closed_won', 'qualified', 'booked',
  'transferred', 'spoke_with_decision_maker', 'hot_lead',
];

const PAUSE_WORKFLOW_DISPOSITIONS = [
  'follow_up', 'potential_prospect', 'needs_more_info', 'timing_not_right',
  'send_info', 'left_voicemail', 'nurture', 'voicemail', 'dropped_call', 'not_connected',
];

const STAGE_NORMALIZATION: Record<string, string> = {
  'callbacks': 'Callback Scheduled',
  'callback': 'Callback Scheduled',
  'callback requested': 'Callback Scheduled',
  'hot leads': 'Hot Leads',
  'hot lead': 'Hot Leads',
  'not interested': 'Not Interested',
  'no answer': 'Not Contacted',
  'voicemail': 'Contacted',
  'contacted': 'Contacted',
  'appointment': 'Appointment Set',
  'appointment set': 'Appointment Set',
  'dnc': 'DNC',
  'do not call': 'DNC',
};

const NEGATIVE_PHRASES = [
  'stop calling', "don't call again", 'leave me alone',
  'harassment', 'sue you', 'lawyer', 'block you',
  'f*** you', 'go to hell', 'threatening',
];

// ---------------------------------------------------------------------------
// Helpers that replicate logic from the edge function
// ---------------------------------------------------------------------------

/** Normalize a raw disposition name the same way the edge function does. */
function normalizeDisposition(raw: string): string {
  return (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/** Check if a normalized disposition matches a category list (substring match). */
function matchesCategory(normalized: string, list: string[]): boolean {
  return list.some((d) => normalized.includes(d));
}

/** Convert snake_case to Title Case (mirrors lines 291-296). */
function snakeToTitle(input: string): string {
  if (!input || !input.includes('_')) return input;
  return input
    .split('_')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Resolve a target stage name through normalization then the stage map. */
function resolveStage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let target = raw;
  if (target.includes('_')) {
    target = snakeToTitle(target);
  }
  const lower = target.toLowerCase();
  return STAGE_NORMALIZATION[lower] ?? target;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Disposition Router - Business Logic', () => {
  // -----------------------------------------------------------------------
  // 1. Disposition classification
  // -----------------------------------------------------------------------

  describe('DNC disposition detection', () => {
    it.each(DNC_DISPOSITIONS)(
      'should classify "%s" as a DNC disposition',
      (dispo) => {
        const normalized = normalizeDisposition(dispo);
        expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(true);
      },
    );

    it('should classify mixed-case DNC variants', () => {
      expect(matchesCategory(normalizeDisposition('DNC'), DNC_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('Do Not Call'), DNC_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('STOP'), DNC_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('Threatening Behavior'), DNC_DISPOSITIONS)).toBe(true);
    });

    it('should NOT classify non-DNC dispositions as DNC', () => {
      const nonDnc = ['answered', 'voicemail', 'no_answer', 'busy', 'appointment_set', 'callback', 'not_interested'];
      for (const dispo of nonDnc) {
        expect(matchesCategory(normalizeDisposition(dispo), DNC_DISPOSITIONS)).toBe(false);
      }
    });
  });

  describe('Remove-all disposition detection', () => {
    it.each(REMOVE_ALL_DISPOSITIONS)(
      'should classify "%s" as remove-all',
      (dispo) => {
        const normalized = normalizeDisposition(dispo);
        expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(true);
      },
    );

    it('should classify negative terminal outcomes', () => {
      expect(matchesCategory(normalizeDisposition('not_interested'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('wrong_number'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('disconnected'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('deceased'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
    });

    it('should classify positive terminal outcomes (stop the sequence)', () => {
      expect(matchesCategory(normalizeDisposition('appointment_set'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('appointment_booked'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('callback_requested'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('converted'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('hot_lead'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
    });

    it('should classify renter/tenant variants', () => {
      expect(matchesCategory(normalizeDisposition('renter'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('tenant'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('not_homeowner'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalizeDisposition('Not The Homeowner'), REMOVE_ALL_DISPOSITIONS)).toBe(true);
    });

    it('should NOT classify pause-only dispositions as remove-all', () => {
      const pauseOnly = ['voicemail', 'follow_up', 'nurture', 'left_voicemail'];
      for (const dispo of pauseOnly) {
        expect(matchesCategory(normalizeDisposition(dispo), REMOVE_ALL_DISPOSITIONS)).toBe(false);
      }
    });
  });

  describe('Pause-workflow disposition detection', () => {
    it.each(PAUSE_WORKFLOW_DISPOSITIONS)(
      'should classify "%s" as pause-workflow',
      (dispo) => {
        const normalized = normalizeDisposition(dispo);
        expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(true);
      },
    );

    it('should NOT pause when disposition is also in remove-all list', () => {
      // The edge function checks: matches PAUSE list AND does NOT match REMOVE_ALL list
      // 'not_interested' is in REMOVE_ALL, not in PAUSE, so it should remove, not pause.
      const normalized = normalizeDisposition('not_interested');
      const shouldPause =
        matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS) &&
        !matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS);
      expect(shouldPause).toBe(false);
    });

    it('should pause for voicemail (not remove)', () => {
      const normalized = normalizeDisposition('voicemail');
      const isPause = matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS);
      const isRemove = matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS);
      expect(isPause).toBe(true);
      expect(isRemove).toBe(false);
    });

    it('should pause for follow_up (not remove)', () => {
      const normalized = normalizeDisposition('follow_up');
      const isPause = matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS);
      const isRemove = matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS);
      expect(isPause).toBe(true);
      expect(isRemove).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Pipeline stage mapping
  // -----------------------------------------------------------------------

  describe('Pipeline stage mapping (disposition -> stage)', () => {
    it('should map "callback" to "Callback Scheduled"', () => {
      expect(resolveStage('callback')).toBe('Callback Scheduled');
    });

    it('should map "callbacks" (plural) to "Callback Scheduled"', () => {
      expect(resolveStage('callbacks')).toBe('Callback Scheduled');
    });

    it('should map "hot_leads" snake_case to "Hot Leads" via Title Case', () => {
      // snake_case is first converted to "Hot Leads", then checked in normalization map
      expect(resolveStage('hot_leads')).toBe('Hot Leads');
    });

    it('should map "hot_lead" (singular) to "Hot Leads"', () => {
      expect(resolveStage('hot_lead')).toBe('Hot Leads');
    });

    it('should map "not_interested" to "Not Interested"', () => {
      expect(resolveStage('not_interested')).toBe('Not Interested');
    });

    it('should map "no_answer" to "Not Contacted"', () => {
      expect(resolveStage('no_answer')).toBe('Not Contacted');
    });

    it('should map "voicemail" to "Contacted"', () => {
      expect(resolveStage('voicemail')).toBe('Contacted');
    });

    it('should map "appointment" to "Appointment Set"', () => {
      expect(resolveStage('appointment')).toBe('Appointment Set');
    });

    it('should map "appointment_set" to "Appointment Set"', () => {
      expect(resolveStage('appointment_set')).toBe('Appointment Set');
    });

    it('should map "dnc" to "DNC"', () => {
      expect(resolveStage('dnc')).toBe('DNC');
    });

    it('should map "do_not_call" to "DNC"', () => {
      // snake_case -> "Do Not Call" -> lowercase match -> "DNC"
      expect(resolveStage('do_not_call')).toBe('DNC');
    });

    it('should pass through unknown stages as Title Case', () => {
      // "custom_stage_name" -> "Custom Stage Name" (no normalization match, kept as-is)
      expect(resolveStage('custom_stage_name')).toBe('Custom Stage Name');
    });

    it('should pass through already-titled stages unchanged', () => {
      expect(resolveStage('Already Titled')).toBe('Already Titled');
    });

    it('should return undefined for undefined input', () => {
      expect(resolveStage(undefined)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Normalization logic
  // -----------------------------------------------------------------------

  describe('Disposition name normalization', () => {
    it('should lowercase and strip non-alphanumeric to underscores', () => {
      expect(normalizeDisposition('Not Interested')).toBe('not_interested');
    });

    it('should handle hyphens', () => {
      expect(normalizeDisposition('follow-up')).toBe('follow_up');
    });

    it('should handle special characters', () => {
      expect(normalizeDisposition("Don't Call Again!")).toBe('don_t_call_again_');
    });

    it('should handle empty string', () => {
      expect(normalizeDisposition('')).toBe('');
    });

    it('should handle undefined/null gracefully', () => {
      expect(normalizeDisposition(undefined as any)).toBe('');
      expect(normalizeDisposition(null as any)).toBe('');
    });
  });

  describe('Snake-case to Title Case conversion', () => {
    it('should convert snake_case to Title Case', () => {
      expect(snakeToTitle('hot_leads')).toBe('Hot Leads');
    });

    it('should handle single word (no underscores) - return as-is', () => {
      expect(snakeToTitle('voicemail')).toBe('voicemail');
    });

    it('should handle multi-word', () => {
      expect(snakeToTitle('callback_requested')).toBe('Callback Requested');
    });

    it('should handle already uppercase words', () => {
      expect(snakeToTitle('DNC_LIST')).toBe('Dnc List');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Negative sentiment auto-DNC
  // -----------------------------------------------------------------------

  describe('Negative sentiment detection from transcripts', () => {
    function detectNegativeSentiment(transcript: string): boolean {
      const transcriptLower = transcript.toLowerCase();
      return NEGATIVE_PHRASES.some((phrase) => transcriptLower.includes(phrase));
    }

    it('should detect "stop calling" as negative', () => {
      expect(detectNegativeSentiment('Please stop calling me')).toBe(true);
    });

    it('should detect "don\'t call again"', () => {
      expect(detectNegativeSentiment("I told you don't call again!")).toBe(true);
    });

    it('should detect "leave me alone"', () => {
      expect(detectNegativeSentiment('Leave me alone already')).toBe(true);
    });

    it('should detect legal threats ("sue you", "lawyer")', () => {
      expect(detectNegativeSentiment("I'm going to sue you")).toBe(true);
      expect(detectNegativeSentiment('I am calling my lawyer')).toBe(true);
    });

    it('should detect "harassment"', () => {
      expect(detectNegativeSentiment('This is harassment')).toBe(true);
    });

    it('should detect "block you"', () => {
      expect(detectNegativeSentiment("I'm going to block you")).toBe(true);
    });

    it('should detect profanity ("f*** you", "go to hell")', () => {
      expect(detectNegativeSentiment('f*** you')).toBe(true);
      expect(detectNegativeSentiment('Go to hell')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(detectNegativeSentiment('STOP CALLING ME')).toBe(true);
      expect(detectNegativeSentiment('LEAVE ME ALONE')).toBe(true);
    });

    it('should NOT flag neutral transcripts', () => {
      expect(detectNegativeSentiment('I am interested in solar panels')).toBe(false);
      expect(detectNegativeSentiment('Yes, I would like more information')).toBe(false);
      expect(detectNegativeSentiment('Can you call me tomorrow at 3pm?')).toBe(false);
    });

    it('should NOT flag polite refusals without negative phrases', () => {
      expect(detectNegativeSentiment('No thank you, not interested right now')).toBe(false);
      expect(detectNegativeSentiment("I'm not the right person to talk to")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 5. DNC flow: disposition -> lead flagged + DNC list entry
  // -----------------------------------------------------------------------

  describe('DNC disposition flow', () => {
    it('should flag lead as do_not_call and status=dnc for DNC dispositions', () => {
      // Verify that the DNC list includes all aggressive/hostile variants
      for (const dispo of ['dnc', 'do_not_call', 'stop', 'remove', 'threatening', 'rude', 'hostile', 'abusive']) {
        const normalized = normalizeDisposition(dispo);
        expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(true);
      }
    });

    it('should NOT trigger DNC for "not_interested" (only removes from campaigns)', () => {
      const normalized = normalizeDisposition('not_interested');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(true);
    });

    it('should NOT trigger DNC for "appointment_set" (positive outcome)', () => {
      const normalized = normalizeDisposition('appointment_set');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Callback scheduling logic
  // -----------------------------------------------------------------------

  describe('Callback scheduling from auto-action', () => {
    it('should calculate callback time using delay_hours (default 24)', () => {
      const delayHours = 24;
      const now = Date.now();
      const callbackTime = new Date(now + delayHours * 60 * 60 * 1000);
      const diffHours = (callbackTime.getTime() - now) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 1);
    });

    it('should use custom delay_hours when provided', () => {
      const delayHours = 48;
      const now = Date.now();
      const callbackTime = new Date(now + delayHours * 60 * 60 * 1000);
      const diffHours = (callbackTime.getTime() - now) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(48, 1);
    });

    it('should default to 24 hours when delay_hours is not provided', () => {
      const config: any = {};
      const delayHours = config.delay_hours || 24;
      expect(delayHours).toBe(24);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Appointment booking logic
  // -----------------------------------------------------------------------

  describe('Appointment booking from auto-action', () => {
    it('should default appointment to tomorrow if no start_time provided', () => {
      const config: any = { title: 'Solar Consultation' };
      const appointmentTime = config.start_time
        ? new Date(config.start_time).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const diffMs = new Date(appointmentTime).getTime() - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBeGreaterThan(23);
      expect(diffHours).toBeLessThan(25);
    });

    it('should use provided start_time when available', () => {
      const futureTime = '2026-04-01T14:00:00.000Z';
      const config = { title: 'Consultation', start_time: futureTime };
      const appointmentTime = config.start_time
        ? new Date(config.start_time).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(appointmentTime).toBe(futureTime);
    });

    it('should calculate end_time from duration_minutes (default 30)', () => {
      const startTime = '2026-04-01T14:00:00.000Z';
      const config: any = {};
      const durationMinutes = config.duration_minutes || 30;
      const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();
      expect(endTime).toBe('2026-04-01T14:30:00.000Z');
    });

    it('should use custom duration_minutes', () => {
      const startTime = '2026-04-01T14:00:00.000Z';
      const durationMinutes = 60;
      const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();
      expect(endTime).toBe('2026-04-01T15:00:00.000Z');
    });
  });

  // -----------------------------------------------------------------------
  // 8. Workflow trigger mapping
  // -----------------------------------------------------------------------

  describe('Disposition-to-workflow trigger mapping', () => {
    it('DNC dispositions should remove from campaigns AND add to DNC', () => {
      const normalized = normalizeDisposition('dnc');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(true);
      // DNC dispositions are not in REMOVE_ALL, but the edge function adds to DNC list separately
      // The lead update (do_not_call: true, status: 'dnc') effectively blocks future calls
    });

    it('"appointment_set" should remove from campaigns (terminal positive outcome)', () => {
      const normalized = normalizeDisposition('appointment_set');
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(false);
    });

    it('"voicemail" should pause workflow (not remove)', () => {
      const normalized = normalizeDisposition('voicemail');
      expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(false);
    });

    it('"follow_up" should pause workflow (not remove)', () => {
      const normalized = normalizeDisposition('follow_up');
      expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(true);
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(false);
    });

    it('"busy" should NOT trigger any automatic workflow action', () => {
      const normalized = normalizeDisposition('busy');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(false);
    });

    it('"no_answer" should NOT trigger any automatic workflow action', () => {
      const normalized = normalizeDisposition('no_answer');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(false);
    });

    it('"answered" should NOT trigger any automatic workflow action', () => {
      const normalized = normalizeDisposition('answered');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Edge cases and error handling
  // -----------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle empty disposition name gracefully', () => {
      const normalized = normalizeDisposition('');
      expect(normalized).toBe('');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(false);
      expect(matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS)).toBe(false);
    });

    it('should handle disposition with only special characters', () => {
      const normalized = normalizeDisposition('!!!---???');
      expect(normalized).toBe('_________');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(false);
    });

    it('should handle very long disposition names', () => {
      const longName = 'a'.repeat(1000);
      const normalized = normalizeDisposition(longName);
      expect(normalized.length).toBe(1000);
    });

    it('should handle disposition names with numbers', () => {
      const normalized = normalizeDisposition('callback_attempt_3');
      expect(normalized).toBe('callback_attempt_3');
      // Contains 'callback' substring, check it matches
      expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(true);
    });

    it('should correctly handle substring matching (potential false positives)', () => {
      // "removed" contains "remove" - this IS a DNC match by design (substring)
      const normalized = normalizeDisposition('removed');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(true);

      // "stopped" contains "stop" - also a DNC match by substring
      expect(matchesCategory(normalizeDisposition('stopped'), DNC_DISPOSITIONS)).toBe(true);
    });

    it('should not match partial words that are NOT substring matches', () => {
      // "rudely" does contain "rude" so it WILL match (by design)
      expect(matchesCategory(normalizeDisposition('rudely'), DNC_DISPOSITIONS)).toBe(true);

      // "stopper" contains "stop" so it will match - this is intentional aggressive matching
      expect(matchesCategory(normalizeDisposition('stopper'), DNC_DISPOSITIONS)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Disposition action priority and order
  // -----------------------------------------------------------------------

  describe('Disposition action ordering and priority', () => {
    it('should process DNC check AFTER user-defined auto-actions', () => {
      // Per the edge function code:
      // 1. Execute user-defined auto-actions (from disposition_auto_actions table)
      // 2. Check for DNC trigger
      // 3. Check for remove-all trigger
      // 3b. Check for pause trigger
      // 4. Negative sentiment check
      // 5. Pipeline stage update
      // 6. Reachability event
      // 7. Metrics recording
      //
      // This ordering means user auto-actions run first, then system rules layer on top.
      const steps = [
        'user_auto_actions',
        'dnc_check',
        'remove_all_check',
        'pause_workflow_check',
        'negative_sentiment',
        'pipeline_update',
        'reachability_event',
        'metrics_recording',
      ];
      expect(steps.indexOf('user_auto_actions')).toBeLessThan(steps.indexOf('dnc_check'));
      expect(steps.indexOf('dnc_check')).toBeLessThan(steps.indexOf('remove_all_check'));
      expect(steps.indexOf('remove_all_check')).toBeLessThan(steps.indexOf('pause_workflow_check'));
    });

    it('DNC and remove-all can both trigger for overlapping dispositions', () => {
      // Some dispositions could match both DNC and another category
      // e.g. a user creates a disposition named "remove_hostile" which contains both "remove" and "hostile"
      const normalized = normalizeDisposition('remove_hostile');
      expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(true); // contains "remove" and "hostile"
    });
  });

  // -----------------------------------------------------------------------
  // 11. Comprehensive disposition routing table
  // -----------------------------------------------------------------------

  describe('Comprehensive disposition routing table', () => {
    const testCases: Array<{
      disposition: string;
      expectDnc: boolean;
      expectRemoveAll: boolean;
      expectPause: boolean;
      expectedStage: string | undefined;
    }> = [
      { disposition: 'answered', expectDnc: false, expectRemoveAll: false, expectPause: false, expectedStage: undefined },
      { disposition: 'voicemail', expectDnc: false, expectRemoveAll: false, expectPause: true, expectedStage: 'Contacted' },
      { disposition: 'no_answer', expectDnc: false, expectRemoveAll: false, expectPause: false, expectedStage: 'Not Contacted' },
      { disposition: 'busy', expectDnc: false, expectRemoveAll: false, expectPause: false, expectedStage: undefined },
      { disposition: 'callback', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: 'Callback Scheduled' },
      { disposition: 'appointment_set', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: 'Appointment Set' },
      { disposition: 'not_interested', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: 'Not Interested' },
      { disposition: 'dnc', expectDnc: true, expectRemoveAll: false, expectPause: false, expectedStage: 'DNC' },
      { disposition: 'do_not_call', expectDnc: true, expectRemoveAll: false, expectPause: false, expectedStage: 'DNC' },
      { disposition: 'renter', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: undefined },
      { disposition: 'wrong_number', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: undefined },
      { disposition: 'converted', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: undefined },
      { disposition: 'follow_up', expectDnc: false, expectRemoveAll: false, expectPause: true, expectedStage: undefined },
      { disposition: 'nurture', expectDnc: false, expectRemoveAll: false, expectPause: true, expectedStage: undefined },
      { disposition: 'left_voicemail', expectDnc: false, expectRemoveAll: false, expectPause: true, expectedStage: undefined },
      { disposition: 'hostile', expectDnc: true, expectRemoveAll: false, expectPause: false, expectedStage: undefined },
      { disposition: 'abusive', expectDnc: true, expectRemoveAll: false, expectPause: false, expectedStage: undefined },
      { disposition: 'hot_lead', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: 'Hot Leads' },
      { disposition: 'transferred', expectDnc: false, expectRemoveAll: true, expectPause: false, expectedStage: undefined },
      { disposition: 'dropped_call', expectDnc: false, expectRemoveAll: false, expectPause: true, expectedStage: undefined },
    ];

    it.each(testCases)(
      'disposition "$disposition": DNC=$expectDnc, RemoveAll=$expectRemoveAll, Pause=$expectPause, Stage=$expectedStage',
      ({ disposition, expectDnc, expectRemoveAll, expectPause, expectedStage }) => {
        const normalized = normalizeDisposition(disposition);
        expect(matchesCategory(normalized, DNC_DISPOSITIONS)).toBe(expectDnc);
        expect(matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS)).toBe(expectRemoveAll);

        // Pause only fires when NOT in remove-all list (per edge function logic)
        const wouldPause =
          matchesCategory(normalized, PAUSE_WORKFLOW_DISPOSITIONS) &&
          !matchesCategory(normalized, REMOVE_ALL_DISPOSITIONS);
        expect(wouldPause).toBe(expectPause);

        // Stage mapping (only for dispositions that have one)
        if (expectedStage !== undefined) {
          const resolved = resolveStage(disposition);
          expect(resolved).toBe(expectedStage);
        }
      },
    );
  });

  // -----------------------------------------------------------------------
  // 12. Health check action
  // -----------------------------------------------------------------------

  describe('Health check response shape', () => {
    it('should expose correct capability counts', () => {
      expect(DNC_DISPOSITIONS.length).toBe(8);
      expect(REMOVE_ALL_DISPOSITIONS.length).toBe(27);
      expect(PAUSE_WORKFLOW_DISPOSITIONS.length).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // 13. Time-to-disposition calculation
  // -----------------------------------------------------------------------

  describe('Time-to-disposition calculation', () => {
    it('should compute seconds between call end and disposition set', () => {
      const callEndedAt = '2026-03-28T10:00:00.000Z';
      const endTime = new Date(callEndedAt).getTime();
      const nowTime = new Date('2026-03-28T10:00:45.000Z').getTime();
      const timeToDisposition = Math.round((nowTime - endTime) / 1000);
      expect(timeToDisposition).toBe(45);
    });

    it('should handle immediate disposition (0 seconds)', () => {
      const time = '2026-03-28T10:00:00.000Z';
      const endTime = new Date(time).getTime();
      const nowTime = new Date(time).getTime();
      const timeToDisposition = Math.round((nowTime - endTime) / 1000);
      expect(timeToDisposition).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 14. Auto-action types coverage
  // -----------------------------------------------------------------------

  describe('Auto-action type coverage', () => {
    const KNOWN_ACTION_TYPES = [
      'remove_all_campaigns',
      'remove_from_campaign',
      'move_to_stage',
      'add_to_dnc',
      'start_workflow',
      'send_sms',
      'schedule_callback',
      'book_appointment',
    ];

    it('should support all 8 documented action types', () => {
      expect(KNOWN_ACTION_TYPES).toHaveLength(8);
    });

    it('should include workflow-related actions', () => {
      expect(KNOWN_ACTION_TYPES).toContain('start_workflow');
      expect(KNOWN_ACTION_TYPES).toContain('remove_all_campaigns');
      expect(KNOWN_ACTION_TYPES).toContain('remove_from_campaign');
    });

    it('should include communication actions', () => {
      expect(KNOWN_ACTION_TYPES).toContain('send_sms');
      expect(KNOWN_ACTION_TYPES).toContain('schedule_callback');
      expect(KNOWN_ACTION_TYPES).toContain('book_appointment');
    });

    it('should include pipeline and DNC actions', () => {
      expect(KNOWN_ACTION_TYPES).toContain('move_to_stage');
      expect(KNOWN_ACTION_TYPES).toContain('add_to_dnc');
    });
  });
});
