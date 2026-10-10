import { ENCOUNTERS, ENEMIES, PARTS, RELICS } from './content';
import { random } from './rng';
import { blankState, clone } from './state';
import type { Enemy, GameState, RelicId, Reward } from './types';

export function generateIntents(state: GameState): void {
  for (const enemy of state.enemies) {
    const base = ENEMIES[enemy.kind].damage;
    if (enemy.kind === 'boss') {
      if (enemy.hp <= enemy.maxHp / 2 && enemy.stage === 1) {
        enemy.stage = 2; enemy.x = 7; enemy.y = 3;
        state.journal.unshift('문지기가 측면으로 이동했습니다. 대포를 동쪽으로 돌리세요.');
      }
      enemy.intent = enemy.stage === 1
        ? { kind: 'area', damage: base, label: '정면 붕괴 · 3열 포격' }
        : state.turn % 2 === 0
          ? { kind: 'jam', damage: base, label: '측면 단선 · 피격 부품 연결 차단' }
          : { kind: 'cross', damage: base, label: '양측 협공 · 동서 교차 포격' };
    } else if (enemy.kind === 'charger' && state.turn % 2 === 1) {
      enemy.intent = { kind: 'charge', damage: 0, label: '축뢰 · 이번 턴 공격 없음 / 다음 공격 +3' };
    } else {
      const kind = enemy.kind === 'bomber' ? 'area' : enemy.kind === 'jammer' ? 'jam' : 'line';
      enemy.intent = { kind, damage: base + enemy.strength, label: kind === 'area' ? '산개 포격 · 3개 공격선' : kind === 'jam' ? '단선탄 · 다음 턴까지 연결 차단' : `직선 관통${enemy.strength ? ' · 강화됨' : ''}` };
    }
  }
}
export function prepareEncounter(input: GameState): GameState {
  const s = clone(input); s.phase = 'build'; s.turn = 1; s.commands = 2; s.debris = []; s.rewards = [];
  s.parts.forEach(p => { p.jammed = 0; p.heat = 0; });
  // Fixed tutorial lane; seed controls later formations and reward choices.
  const [r, next] = random(s.rng); s.rng = next;
  const lanes = s.encounter === 0 ? [3] : s.encounter === 5 ? [3] : r < 0.5 ? [3, 2, 4] : [3, 4, 2];
  s.enemies = ENCOUNTERS[s.encounter].kinds.map((kind, i): Enemy => {
    const def = ENEMIES[kind];
    const hp = def.hp + (s.route === 'salvage' && s.encounter !== 5 ? 3 : 0);
    return { id: `e${s.encounter}-${i}`, kind, x: lanes[i], y: -1, hp, maxHp: hp, strength: 0, stage: 1, intent: { kind: 'line', damage: def.damage, label: '' } };
  });
  generateIntents(s);
  s.journal.unshift(`${s.encounter + 1}번째 정박지: ${ENCOUNTERS[s.encounter].name}. 도시를 정비하세요.`);
  s.journal = s.journal.slice(0, 60); return s;
}
export function newGame(seed: string): GameState { return prepareEncounter(blankState(seed.trim().slice(0, 64) || '새벽-061')); }
export function makeRewards(s: GameState): Reward[] {
  const remaining = (Object.keys(RELICS) as RelicId[]).filter(id => !s.relics.includes(id));
  const [r, next] = random(s.rng); s.rng = next;
  const relic = remaining[Math.floor(r * remaining.length)];
  return [
    relic ? { id: 'relic', type: 'relic', title: RELICS[relic].name, description: RELICS[relic].description, relic, value: 0 } : { id: 'cache', type: 'scrap', title: '깊은 고철 창고', description: '고철 22를 추가로 얻습니다.', value: 22 },
    { id: 'scrap', type: 'scrap', title: '떠돌이의 부품 상자', description: '고철 18을 얻습니다. 새 부품을 조립할 수 있습니다.', value: 18 },
    { id: 'repair', type: 'repair', title: '새벽 정비대', description: '모든 부품 내구도 8 회복, 도시 핵은 완전 수리.', value: 8 },
  ];
}
export function chooseReward(input: GameState, id: string): GameState {
  if (input.phase !== 'reward') return input;
  const reward = input.rewards.find(r => r.id === id); if (!reward) return input;
  const s = clone(input);
  if (reward.type === 'relic' && reward.relic && !s.relics.includes(reward.relic)) s.relics.push(reward.relic);
  if (reward.type === 'scrap') s.scrap += reward.value;
  if (reward.type === 'repair') s.parts.forEach(p => { p.hp = p.kind === 'core' ? PARTS.core.hp : Math.min(PARTS[p.kind].hp, p.hp + reward.value); });
  s.journal.unshift(`보상 선택: ${reward.title}`); s.rewards = []; s.encounter++;
  if (s.encounter === 2 || s.encounter === 4) { s.phase = 'route'; return s; }
  return prepareEncounter(s);
}
export function chooseRoute(input: GameState, route: 'shelter' | 'salvage'): GameState {
  if (input.phase !== 'route') return input;
  const s = clone(input); s.route = route;
  s.routes.push(route);
  if (route === 'shelter') s.parts.forEach(p => { p.hp = Math.min(PARTS[p.kind].hp, p.hp + 5); });
  else s.scrap += 14;
  s.journal.unshift(route === 'shelter' ? '방풍 터널: 모든 부품 +5 수리.' : '폐철 고원: 고철 +14, 다음 경로 선택까지 일반 적 내구도 +3.');
  return prepareEncounter(s);
}
