import { PARTS } from './content';
import { seedHash } from './rng';
import type { Dir, GameState, Part, PartKind } from './types';
export const clone = <T>(value: T): T => structuredClone(value);
export function makePart(id: string, kind: PartKind, x: number, y: number, dir: Dir = 0): Part {
  return { id, kind, x, y, dir, hp: PARTS[kind].hp, heat: 0, charge: 0, priority: kind === 'cannon' ? 1 : kind === 'tractor' ? 2 : 3, jammed: 0, bonus: 0 };
}
export function blankState(seed = '새벽-061'): GameState {
  return {
    version: 1, seed, rng: seedHash(seed), phase: 'build', encounter: 0, turn: 1, nextId: 8,
    parts: [makePart('p1', 'core', 3, 3), makePart('p2', 'generator', 2, 3), makePart('p3', 'cannon', 3, 2), makePart('p4', 'shield', 3, 1), makePart('p5', 'capacitor', 2, 2), makePart('p6', 'cooler', 4, 2), makePart('p7', 'salvager', 2, 1)],
    enemies: [], scrap: 22, relics: ['stormglass'], debris: [], commands: 2, rewards: [], route: 'shelter', routes: [], journal: [],
  };
}
