/**
 * Coach rules: the WORDS matcher, ported verbatim from the DoorBoss call
 * workspace (`docs/wholesale/doorboss-call/call-content.js` + `call.html:52-63`).
 *
 * The words themselves live per pack (`src/packs/<packId>/coachRules.ts`) so a
 * pack can change what the coach says without touching this file. This module is
 * pure data-in / data-out and is unit tested (`src/lib/__tests__/coachRules.test.ts`).
 *
 * DoorBoss semantics kept exactly:
 * - a rule fires on what the HOMEOWNER said (or a line the rep typed in);
 * - whole-word matching, and a keyword ending in `*` matches any ending
 *   (`refund*` matches "refunded");
 * - a keyword with N words scores N (so "cancel my contract" beats "cancel");
 * - the rule with the most hits wins, ties broken by the order in the file;
 * - `confirm: true` rules are NEVER shown (Charles has to approve those words).
 */

export interface CoachStageQuestion {
  q: string;
  hint: string;
}

export interface CoachStage {
  id: string;
  name: string;
  qs: CoachStageQuestion[];
}

export interface CoachRule {
  id: string;
  /** Key into CoachContent.groups (money / installer / trust / process). */
  group: string;
  /** Shown as a quick-tap chip above the coach. */
  top?: boolean;
  /** The label for the "Heard: ..." line, e.g. "Asked: can you cancel my contract?". */
  chip?: string;
  /** Lowercase words or phrases; end a word with `*` to match any ending. */
  kw: string[];
  /** What to avoid. */
  warn: string;
  /** What to say instead. */
  say: string;
  /** The next move in the call. */
  next?: string;
  /** 0 Intro, 1 Discovery, 2 Reality, 3 Documents, 4 Close. */
  stage: number;
  /** true = Charles must confirm these words before they go live. Never shown. */
  confirm?: boolean;
}

export interface CoachContent {
  goal: string;
  /** group id -> human label. */
  groups: Record<string, string>;
  /** Lines for when the homeowner is frustrated and no rule fired. */
  empathy: string[];
  stages: CoachStage[];
  rules: CoachRule[];
}

/** The three hard rules that always show when no rule has fired. */
export const COACH_ALWAYS_LINE =
  'Never promise a result. Never tell them to stop paying. Never say you are lawyers.';

const rxCache = new Map<string, RegExp>();

/**
 * Build the whole-word matcher for one keyword. `refund*` -> any ending.
 * Cached because matchRules runs on every transcript line.
 */
export function kwRx(keyword: string): RegExp {
  const cached = rxCache.get(keyword);
  if (cached) return cached;
  const star = keyword.endsWith('*');
  const core = (star ? keyword.slice(0, -1) : keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp('(^|[^a-z0-9])' + core + (star ? '[a-z]*' : '') + '([^a-z0-9]|$)', 'i');
  rxCache.set(keyword, rx);
  return rx;
}

/** Lowercase, straighten curly apostrophes, collapse whitespace. */
export function normalizeSpoken(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CoachMatch {
  rule: CoachRule;
  /** Position of the rule in the source list (stable tie-break). */
  index: number;
  score: number;
}

/** Every rule that fired, best first. */
export function matchRules(text: unknown, rules: CoachRule[]): CoachMatch[] {
  const low = normalizeSpoken(text);
  if (low.length < 2) return [];
  return rules
    .map((rule, index) => {
      let score = 0;
      for (const keyword of rule.kw || []) {
        if (kwRx(keyword).test(low)) score += 1 + (keyword.split(' ').length - 1);
      }
      return { rule, index, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

/** The best rule for a line, or null. */
export function bestMatch(text: unknown, rules: CoachRule[]): CoachRule | null {
  const matches = matchRules(text, rules);
  return matches.length ? matches[0].rule : null;
}

/** Rules the coach is allowed to show (drops the unapproved `confirm: true` ones). */
export function activeRules(content: CoachContent | null | undefined): CoachRule[] {
  return (content?.rules ?? []).filter((rule) => !rule.confirm);
}

/** The quick-tap chips: the top rules, in file order. */
export function topChips(content: CoachContent | null | undefined, limit = 8): CoachRule[] {
  return activeRules(content).filter((rule) => rule.top).slice(0, limit);
}

/** The chip label without the leading "Asked: " / "Said: " prefix. */
export function chipLabel(rule: CoachRule): string {
  return String(rule.chip || rule.id).replace(/^(Asked|Said): /, '');
}

export interface TokenFill {
  /** Homeowner first name -> {first}. */
  first?: string | null;
  /** Rep first name -> {rep}. */
  rep?: string | null;
  /** Installer name -> {installer}. */
  installer?: string | null;
  /** The house's verified record, e.g. " Their record shows: ..." -> {closure}. */
  closure?: string | null;
  /** The line for a house with nothing on file -> {noclosure}. */
  noclosure?: string | null;
}

/** Fill the {first} {rep} {installer} {closure} {noclosure} tokens in a coach line. */
export function fillTokens(text: unknown, fill: TokenFill = {}): string {
  const first = String(fill.first || '').split(' ')[0] || 'there';
  const rep = String(fill.rep || '').split(' ')[0] || 'I';
  const installer = fill.installer || 'the installer';
  return String(text ?? '')
    .replace(/\{first\}/g, first)
    .replace(/\{rep\}/g, rep)
    .replace(/\{installer\}/g, installer)
    .replace(/\{closure\}/g, fill.closure || '')
    .replace(/\{noclosure\}/g, fill.noclosure || '');
}

/** Pick the empathy line for this call (stable for a given seed). */
export function pickEmpathy(content: CoachContent | null | undefined, seed = 0): string {
  const lines = content?.empathy ?? [];
  if (!lines.length) return '';
  const i = Math.abs(Math.trunc(seed)) % lines.length;
  return lines[i];
}
