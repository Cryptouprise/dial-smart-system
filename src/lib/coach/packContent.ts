/**
 * Which coach words belong to which pack.
 *
 * The call workspace is core plumbing (any pack can use it); the WORDS are
 * pack-owned. Solar Exit and Wholesale RE have no coach content yet, so their
 * call workspace runs with the script prompts only.
 */

import type { PackId } from '@/lib/packs';
import type { CoachContent } from './rules';
import { DOOR_TO_DOOR_COACH } from '@/packs/door_to_door/coachRules';

const COACH_CONTENT: Partial<Record<PackId, CoachContent>> = {
  door_to_door: DOOR_TO_DOOR_COACH,
};

/** Packs that ship a coach script today. */
export const COACH_PACKS: PackId[] = Object.keys(COACH_CONTENT) as PackId[];

/** The coach content for a pack, or null when the pack has none. */
export function coachContentForPack(packId: PackId | null | undefined): CoachContent | null {
  if (!packId) return null;
  return COACH_CONTENT[packId] ?? null;
}
