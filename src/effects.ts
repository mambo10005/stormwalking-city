import { RELICS } from './content';
import type { RelicId } from './types';
export type EffectCounts = Partial<Record<RelicId, number>>;
/** Trigger budgets never reset within a turn. Effects never dispatch new triggers. */
export function trigger(counts: EffectCounts, id: RelicId, amount = 1): number {
  const accepted = Math.min(amount, RELICS[id].limit - (counts[id] ?? 0));
  counts[id] = (counts[id] ?? 0) + Math.max(0, accepted);
  return Math.max(0, accepted);
}
