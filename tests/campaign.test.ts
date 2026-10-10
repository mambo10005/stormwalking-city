import { expect, it } from 'vitest';
import { command, placePart } from '../src/actions';
import { chooseReward, chooseRoute, newGame } from '../src/campaign';
import { resolveTurn } from '../src/combat';
import { PARTS } from '../src/content';
import { deserialize, serialize } from '../src/save';
import type { Dir, GameState, PartKind } from '../src/types';

// A legal, reproducible player policy. No injected resources, HP, rewards, or kills.
it('실제 구입·수리·배치만으로 6개 조우와 두 경로를 돌파할 수 있다', () => {
  let s = newGame('새벽-061'); let battles = 0; let turns = 0; const trace: unknown[] = [];
  const buy = (kind: PartKind, x: number, y: number, dir: Dir = 0) => {
    const r = placePart(s, kind, x, y, dir); expect(r.error, `buy ${kind} @${x},${y}, scrap=${s.scrap}`).toBeUndefined(); s = r.state;
  };
  const move = (id: string, x: number, y: number) => {
    const r = command(s, { type: 'move', id, x, y }); expect(r.error).toBeUndefined(); s = r.state;
  };
  while (s.phase !== 'won' && s.phase !== 'lost' && turns < 100) {
    if (s.phase === 'build') {
      battles++;
      if (s.encounter === 1) {
        move('p7', 1, 1); move('p6', 5, 2); move('p5', 2, 4);
        buy('cannon', 2, 2); buy('cannon', 4, 2); buy('shield', 2, 1); buy('shield', 4, 1);
        buy('generator', 3, 4); buy('generator', 4, 4);
      }
      if (s.encounter === 5) {
        buy('cannon', 5, 3, 1); buy('shield', 6, 3); buy('generator', 5, 4); buy('shield', 0, 3);
        for (const x of [2, 3, 4]) if (!s.parts.some(p => p.x === x && p.y === 1)) buy('shield', x, 1);
      }
      // Repair the front line using only earned scrap.
      for (const p of s.parts.filter(p => p.kind === 'shield' || p.kind === 'core')) {
        while (s.scrap >= 3 && s.parts.find(q => q.id === p.id)!.hp < PARTS[p.kind].hp - 2) s = command(s, { type: 'repair', id: p.id }).state;
      }
      s.phase = 'plan';
    } else if (s.phase === 'plan') {
      for (const p of s.parts.filter(p => p.kind === 'shield' && p.hp <= 7)) {
        if (s.commands && s.scrap >= 3) s = command(s, { type: 'repair', id: p.id }).state;
      }
      const r = resolveTurn(s); s = r.state; turns++;
      if (s.encounter === 5) trace.push({ turn: s.turn, scrap: s.scrap, enemy: s.enemies.map(e => [e.hp, e.stage]), hits: r.events.filter(e => ['hit', 'fire', 'destroy'].includes(e.kind)).map(e => e.text) });
      for (const n of r.power) expect(n.initial + n.produced + n.impact).toBe(n.consumed + n.stored + n.loss);
      expect(deserialize(serialize(s)).state).toEqual(s);
    } else if (s.phase === 'reward') s = chooseReward(s, 'scrap');
    else if (s.phase === 'route') s = chooseRoute(s, 'shelter');
  }
  expect(s.phase, JSON.stringify(trace)).toBe('won'); expect(s.encounter).toBe(5);
  expect(battles).toBe(6); expect(s.routes).toHaveLength(2);
});
