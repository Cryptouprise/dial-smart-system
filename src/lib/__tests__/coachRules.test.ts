/**
 * Coach rules tests.
 *
 * These lock two things:
 *  1. the matcher behaves exactly like the DoorBoss call workspace, and
 *  2. the ported Door to Door content is intact (counts, ids, groups, chips).
 *
 * The content assertions are deliberately structural rather than a full string
 * dump: a transcription slip almost always changes a count, an id or a group.
 */

import { describe, expect, it } from 'vitest';
import {
  COACH_ALWAYS_LINE,
  activeRules,
  bestMatch,
  chipLabel,
  fillTokens,
  kwRx,
  matchRules,
  normalizeSpoken,
  pickEmpathy,
  topChips,
  type CoachContent,
  type CoachRule,
} from '@/lib/coach/rules';
import { DOOR_TO_DOOR_COACH } from '@/packs/door_to_door/coachRules';
import { COACH_PACKS, coachContentForPack } from '@/lib/coach/packContent';

const rule = (over: Partial<CoachRule>): CoachRule => ({
  id: 'r',
  group: 'process',
  kw: [],
  warn: 'w',
  say: 's',
  stage: 0,
  ...over,
});

/** Wrap a rule list in the minimum content the helpers need. */
const content = (rules: CoachRule[]): CoachContent => ({
  goal: 'g',
  groups: { process: 'The process and next steps' },
  empathy: [],
  stages: [],
  rules,
});

describe('kwRx', () => {
  it('matches whole words only', () => {
    expect(kwRx('sue').test('i want to sue them')).toBe(true);
    expect(kwRx('sue').test('that is the issue')).toBe(false);
  });

  it('matches any ending when the keyword ends in a star', () => {
    expect(kwRx('cancel').test('i already cancelled')).toBe(false);
    expect(kwRx('cancel*').test('i already cancelled')).toBe(true);
  });

  it('matches multi-word phrases', () => {
    expect(kwRx('stop paying').test('i want to stop paying')).toBe(true);
    expect(kwRx('stop paying').test('stop')).toBe(false);
  });

  it('treats regex metacharacters in a keyword as literal text', () => {
    expect(kwRx('100%').test('is that 100% guaranteed')).toBe(true);
    expect(kwRx('100%').test('is that 1000 guaranteed')).toBe(false);
  });
});

describe('normalizeSpoken', () => {
  it('lowercases, straightens curly apostrophes and collapses whitespace', () => {
    expect(normalizeSpoken("I Don\u2019t   Remember\nwhat I signed")).toBe(
      "i don't remember what i signed",
    );
  });

  it('is safe on null and undefined', () => {
    expect(normalizeSpoken(null)).toBe('');
    expect(normalizeSpoken(undefined)).toBe('');
  });
});

describe('matchRules', () => {
  const rules = [
    rule({ id: 'cancel', kw: ['cancel*', 'cancel my contract'] }),
    rule({ id: 'broken', kw: ['broken'] }),
    rule({ id: 'sue', kw: ['sue'] }),
  ];

  it('returns nothing for very short input', () => {
    expect(matchRules('', rules)).toEqual([]);
    expect(matchRules('a', rules)).toEqual([]);
  });

  it('scores a multi-word keyword higher than a single word', () => {
    const [first] = matchRules('can you cancel my contract please', rules);
    expect(first.rule.id).toBe('cancel');
    // 'cancel*' is 1 point, 'cancel my contract' is 1 + (3 words - 1) = 3.
    expect(first.score).toBe(4);
  });

  it('breaks ties by the order the rules are declared in', () => {
    const tied = [rule({ id: 'first', kw: ['broken'] }), rule({ id: 'second', kw: ['broken'] })];
    expect(matchRules('it is broken', tied).map((m) => m.rule.id)).toEqual(['first', 'second']);
  });

  it('finds the best rule for a line', () => {
    expect(bestMatch('i want to sue them', rules)?.id).toBe('sue');
    expect(bestMatch('nothing here matches', rules)).toBeNull();
  });

  it('does not match a keyword with a longer ending unless it is starred', () => {
    expect(bestMatch('i already sued them', rules)).toBeNull();
  });
});

describe('activeRules and topChips', () => {
  const rules = [
    rule({ id: 'a', top: true }),
    rule({ id: 'b', confirm: true, top: true }),
    rule({ id: 'c', top: true }),
    rule({ id: 'd' }),
  ];

  it('never surfaces a confirm: true rule', () => {
    expect(activeRules(content(rules)).map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });

  it('chips are the top rules in file order, capped by the limit', () => {
    expect(topChips(content(rules)).map((r) => r.id)).toEqual(['a', 'c']);
    expect(topChips(content(rules), 1).map((r) => r.id)).toEqual(['a']);
  });

  it('handles missing content', () => {
    expect(activeRules(null)).toEqual([]);
    expect(topChips(undefined)).toEqual([]);
  });
});

describe('chipLabel', () => {
  it('drops the Asked/Said prefix', () => {
    expect(chipLabel(rule({ chip: 'Asked: can you cancel my contract?' }))).toBe(
      'can you cancel my contract?',
    );
    expect(chipLabel(rule({ chip: 'Said: I want to stop paying' }))).toBe('I want to stop paying');
  });

  it('falls back to the id when there is no chip', () => {
    expect(chipLabel(rule({ id: 'howlong' }))).toBe('howlong');
  });
});

describe('fillTokens', () => {
  it('fills every token and defaults sensibly', () => {
    expect(
      fillTokens('Hi {first}, this is {rep}. {installer}.{closure}{noclosure}', {
        first: 'Maria Lopez',
        rep: 'Dan',
        installer: 'Sunrun',
        closure: ' Their record shows: license revoked.',
        noclosure: ' Nothing on file yet.',
      }),
    ).toBe('Hi Maria, this is Dan. Sunrun. Their record shows: license revoked. Nothing on file yet.');
  });

  it('uses the fallbacks when the caller has no name on file', () => {
    expect(fillTokens('Hi {first}, this is {rep}.', { first: '', rep: null })).toBe(
      'Hi there, this is I.',
    );
    expect(fillTokens('Hi {first}, this is {rep}.')).toBe('Hi there, this is I.');
  });

  it('turns an unknown installer into plain words', () => {
    expect(fillTokens('{installer} is gone')).toBe('the installer is gone');
  });
});

describe('pickEmpathy', () => {
  it('is stable for a seed and wraps', () => {
    expect(pickEmpathy(DOOR_TO_DOOR_COACH, 3)).toBe(DOOR_TO_DOOR_COACH.empathy[3]);
    expect(pickEmpathy(DOOR_TO_DOOR_COACH, 3 + DOOR_TO_DOOR_COACH.empathy.length)).toBe(
      DOOR_TO_DOOR_COACH.empathy[3],
    );
    expect(pickEmpathy(null, 0)).toBe('');
  });
});

describe('pack content resolver', () => {
  it('returns the Door to Door content for the door_to_door pack', () => {
    expect(coachContentForPack('door_to_door')).toBe(DOOR_TO_DOOR_COACH);
  });

  it('returns null for packs with no coach script yet', () => {
    expect(coachContentForPack('solar_exit')).toBeNull();
    expect(coachContentForPack('wholesale_re')).toBeNull();
    expect(coachContentForPack(null)).toBeNull();
    expect(COACH_PACKS).toContain('door_to_door');
  });
});

describe('Door to Door content integrity', () => {
  const c = DOOR_TO_DOOR_COACH;

  it('has the DoorBoss shape', () => {
    expect(c.goal).toBe('Get the loan agreement and book the 20-minute review.');
    expect(Object.keys(c.groups)).toEqual(['money', 'installer', 'trust', 'process']);
    expect(c.empathy).toHaveLength(8);
    expect(c.stages.map((s) => s.id)).toEqual(['intro', 'disc', 'real', 'docs', 'close']);
    expect(c.stages.map((s) => s.name)).toEqual([
      'Intro',
      'Discovery',
      'Reality',
      'Documents',
      'Close',
    ]);
    expect(c.rules).toHaveLength(33);
  });

  it('exposes exactly the eight quick-tap chips, in order', () => {
    expect(topChips(c).map((r) => r.id)).toEqual([
      'whoareyou',
      'scam',
      'cancel',
      'closed',
      'promised',
      'stoppay',
      'guarantee',
      'thinkabout',
    ]);
  });

  it('keeps the two unapproved rules hidden until Charles confirms them', () => {
    const hidden = c.rules.filter((r) => r.confirm).map((r) => r.id);
    expect(hidden).toEqual(['cost', 'howlong']);
    expect(activeRules(c)).toHaveLength(31);
  });

  it('gives every rule unique id, a real group, keywords and both halves of the answer', () => {
    const ids = new Set<string>();
    for (const r of c.rules) {
      expect(ids.has(r.id), `duplicate rule id ${r.id}`).toBe(false);
      ids.add(r.id);
      expect(Object.keys(c.groups), `${r.id} group`).toContain(r.group);
      expect(r.kw.length, `${r.id} keywords`).toBeGreaterThan(0);
      expect(r.warn.trim(), `${r.id} warn`).not.toBe('');
      expect(r.say.trim(), `${r.id} say`).not.toBe('');
      expect(r.stage, `${r.id} stage`).toBeGreaterThanOrEqual(0);
      expect(r.stage, `${r.id} stage`).toBeLessThanOrEqual(4);
    }
    expect(ids.size).toBe(33);
  });

  it('gives every stage questions with a prompt and a hint', () => {
    for (const s of c.stages) {
      expect(s.qs.length, `${s.id} questions`).toBeGreaterThan(0);
      for (const q of s.qs) {
        expect(q.q.trim(), `${s.id} prompt`).not.toBe('');
        expect(q.hint.trim(), `${s.id} hint`).not.toBe('');
      }
    }
  });

  it('only uses the tokens the filler knows about', () => {
    // {installer} is documented in the source header but no live line uses it
    // (verified against call-content.js), so it is deliberately absent here.
    const tokens = new Set(JSON.stringify(c).match(/\{[a-z]+\}/g) ?? []);
    expect([...tokens].sort()).toEqual(['{closure}', '{first}', '{noclosure}', '{rep}']);
  });

  it('carries the three hard rules', () => {
    expect(COACH_ALWAYS_LINE).toBe(
      'Never promise a result. Never tell them to stop paying. Never say you are lawyers.',
    );
  });

  it('routes a real homeowner line to the right words', () => {
    expect(bestMatch('can you cancel my contract?', activeRules(c))?.id).toBe('cancel');
    expect(bestMatch('the installer went out of business', activeRules(c))?.id).toBe('closed');
    expect(bestMatch('I want to stop paying', activeRules(c))?.id).toBe('stoppay');
    expect(bestMatch("I don't remember what I signed", activeRules(c))?.id).toBe('dontremember');
    expect(bestMatch('are you lawyers?', activeRules(c))?.id).toBe('lawyers');
  });
});
