import { describe, expect, it } from 'vitest';
import { command, placePart, sellPart } from '../src/actions';
import { chooseReward, chooseRoute, generateIntents, newGame, prepareEncounter } from '../src/campaign';
import { cannonTarget, resolveTurn, tractorTarget } from '../src/combat';
import { ENEMIES, PARTS, RELICS } from '../src/content';
import { trigger } from '../src/effects';
import { attackRays, canPlace, inFiringLine, onRim, rotate } from '../src/grid';
import { allocate, networks } from '../src/power';
import { deserialize, loadLocal, saveLocal, serialize } from '../src/save';
import { clone, makePart } from '../src/state';
import type { Enemy, EnemyKind, GameState, Part } from '../src/types';

function enemy(kind: EnemyKind = 'lancer', x = 3, y = -1): Enemy {
  return { id: 'e-test', kind, x, y, hp: ENEMIES[kind].hp, maxHp: ENEMIES[kind].hp, stage: 1, strength: 0, intent: { kind: 'line', damage: ENEMIES[kind].damage, label: 'test' } };
}
function arena(parts: Part[], enemies: Enemy[] = [enemy()]): GameState {
  const s = newGame('test'); s.parts = parts; s.enemies = enemies; s.phase = 'plan'; s.nextId = 100; return s;
}
const core = () => makePart('p1', 'core', 3, 3);

describe('배치와 지휘', () => {
  it('충돌·격자 밖·소수 좌표를 거부한다', () => {
    const s = newGame('grid');
    for (const [x, y] of [[3, 3], [-1, 0], [7, 6], [2, 7], [.5, 1]]) expect(placePart(s, 'shield', x, y).error).toBeTruthy();
    expect(canPlace(s.parts, { x: 0, y: 0 })).toBe(true);
    expect(placePart(s, 'shield', 0, 0).state.scrap).toBe(s.scrap - 7);
  });
  it('배치·판매가 고철을 정산하며 핵 판매를 거부한다', () => {
    let s = newGame('sell'); s = placePart(s, 'shield', 0, 0).state;
    const id = s.parts.at(-1)!.id;
    expect(sellPart(s, id).state.scrap).toBe(22 - 7 + 4);
    expect(sellPart(s, 'p1').error).toBeTruthy();
    expect(placePart({ ...s, scrap: 0 }, 'generator', 0, 1).error).toBeTruthy();
  });
  it('전투 이동은 인접 칸만, 2회까지 가능하다', () => {
    let s = newGame('move'); s.phase = 'plan';
    expect(command(s, { type: 'move', id: 'p3', x: 6, y: 6 }).error).toBeTruthy();
    s = command(s, { type: 'move', id: 'p4', x: 4, y: 1 }).state;
    expect(s.commands).toBe(1);
    s = command(s, { type: 'rotate', id: 'p3' }).state;
    expect(s.commands).toBe(0);
    expect(command(s, { type: 'priority', id: 'p3' }).error).toBeTruthy();
  });
  it('계획 스냅샷을 복원하면 고철과 이동도 되돌아간다', () => {
    const s = newGame('undo'); s.phase = 'plan'; s.parts[3].hp = 10;
    const before = clone(s); const planned = command(s, { type: 'repair', id: 'p4' }).state;
    expect(planned.scrap).toBe(before.scrap - 3); expect(planned.parts[3].hp).toBe(16);
    expect(s).toEqual(before);
    expect(resolveTurn(before)).toEqual(resolveTurn(s));
  });
  it('회전은 4방향을 순환하고 사거리는 정렬과 방향을 검사한다', () => {
    const p = makePart('p2', 'cannon', 3, 3);
    expect(inFiringLine(p, { x: 3, y: -1 })).toBe(true);
    expect(inFiringLine(p, { x: 4, y: -1 })).toBe(false);
    expect(inFiringLine(p, { x: 3, y: -7 })).toBe(false);
    p.dir = rotate(p.dir); expect(inFiringLine(p, { x: 7, y: 3 })).toBe(true);
    expect(inFiringLine(p, { x: 3, y: -1 })).toBe(false);
    p.dir = rotate(rotate(rotate(p.dir))); expect(p.dir).toBe(0);
  });
});

describe('연결망과 전력 보존', () => {
  it('직교 인접만 연결하며 다리 이동·단선으로 분리된다', () => {
    const p = [makePart('p1', 'generator', 0, 0), makePart('p2', 'shield', 1, 0), makePart('p3', 'cannon', 2, 0), makePart('p4', 'shield', 4, 4)];
    expect(networks(p)).toHaveLength(2);
    p[1].jammed = 1; expect(networks(p)).toHaveLength(3);
    expect(networks(p).find(n => n.members.includes('p3'))?.production).toBe(0);
    p[1].jammed = 0; p[1].y = 2; expect(networks(p)).toHaveLength(4);
  });
  it('저장 전력만 있는 연결망은 소비 가능하나 생산하지 않는다', () => {
    const cap = makePart('p2', 'capacitor', 2, 2); cap.charge = 5;
    const s = arena([core(), cap, makePart('p3', 'cannon', 3, 2)]);
    const r = resolveTurn(s); expect(r.power[0].produced).toBe(0); expect(r.events.some(e => e.kind === 'fire')).toBe(true);
  });
  it('전력 부족 시 높은 소비 우선순위부터 공급한다', () => {
    const high = makePart('p2', 'cannon', 0, 0), low = makePart('p3', 'cannon', 1, 0);
    high.priority = 1; low.priority = 3;
    expect([...allocate([low, high], 4)]).toEqual(['p2']);
    high.priority = 3; low.priority = 1; expect([...allocate([high, low], 4)]).toEqual(['p3']);
  });
  it('첫 전투에서 피격 발전 → 축전 → 대포 반격이 발생한다', () => {
    const r = resolveTurn(newGame('tutorial'));
    const hit = r.events.findIndex(e => e.kind === 'hit');
    const charge = r.events.findIndex(e => e.text.includes('폭풍 유리 → 축전기'));
    const fire = r.events.findIndex(e => e.kind === 'fire');
    expect(hit).toBeLessThan(charge); expect(charge).toBeLessThan(fire);
    expect(r.state.enemies[0].hp).toBe(8);
    expect(r.state.parts.find(p => p.kind === 'capacitor')!.charge).toBe(3);
    expect(r.power[0]).toMatchObject({ produced: 3, impact: 5, consumed: 5, stored: 3, loss: 0 });
  });
  it('축전기 없는 잔여 전력은 손실로 정산한다', () => {
    const s = arena([core(), makePart('p2', 'generator', 2, 3)]);
    const r = resolveTurn(s); expect(r.power[0]).toMatchObject({ produced: 3, stored: 0, consumed: 0, loss: 3 });
  });
  it('모든 초기 연결망에서 전력 보존식을 만족한다', () => {
    let s = newGame('ledger'); s.phase = 'plan';
    for (let i = 0; i < 3; i++) {
      const r = resolveTurn(s);
      for (const n of r.power) expect(n.initial + n.produced + n.impact).toBe(n.consumed + n.stored + n.loss);
      s = r.state;
    }
  });
  it('파괴된 연결 다리를 가로질러 에너지를 가져오지 못한다', () => {
    const bridge = makePart('p3', 'shield', 2, 2); bridge.hp = 1;
    const cap = makePart('p5', 'capacitor', 1, 1); cap.charge = 8;
    const s = arena([core(), makePart('p2', 'generator', 1, 2), bridge, makePart('p4', 'cannon', 3, 2), cap], [enemy('lancer', 2), { ...enemy(), id: 'e2' }]);
    const r = resolveTurn(s); expect(r.status.p4.active).toBe(false); expect(r.events.filter(e => e.kind === 'fire')).toHaveLength(0);
    expect(r.power.reduce((n, p) => n + p.loss + p.stored + p.consumed, 0)).toBe(11);
  });
});

describe('공격·견인·파괴와 유물', () => {
  it('도시 밖 적의 직선과 범위 공격은 명확한 격자 좌표로 계산된다', () => {
    const e = enemy(); expect(attackRays(e)[0]).toEqual(Array.from({ length: 7 }, (_, y) => ({ x: 3, y })));
    e.intent.kind = 'area'; expect(attackRays(e)).toHaveLength(3);
    e.x = 7; e.y = 3; e.intent.kind = 'line'; expect(attackRays(e)[0][0]).toEqual({ x: 6, y: 3 });
    expect(onRim({ x: -1, y: -1 })).toBe(false);
  });
  it('파괴된 대포는 이후 발사하지 않는다', () => {
    const gun = makePart('p3', 'cannon', 3, 2); gun.hp = 1;
    const cap = makePart('p4', 'capacitor', 2, 2); cap.charge = 8;
    const r = resolveTurn(arena([core(), makePart('p2', 'generator', 2, 3), gun, cap]));
    expect(r.state.parts.some(p => p.id === gun.id)).toBe(false);
    expect(r.events.some(e => e.kind === 'fire')).toBe(false);
    expect(r.status.p3.reason).toContain('파괴');
  });
  it('견인 후 공격선과 피격 대상이 바뀐다', () => {
    const tractor = makePart('p2', 'tractor', 2, 2, 3); tractor.priority = 1;
    const s = arena([core(), tractor, makePart('p3', 'generator', 2, 3), makePart('p4', 'shield', 3, 1), makePart('p5', 'shield', 2, 1)]);
    expect(tractorTarget(s, tractor)?.destination).toEqual({ x: 2, y: -1 });
    const r = resolveTurn(s); expect(r.aimedEnemies[0].x).toBe(2);
    expect(r.state.parts.find(p => p.id === 'p4')?.hp).toBe(22);
    expect(r.state.parts.find(p => p.id === 'p5')?.hp).toBe(18);
  });
  it('견인은 도시 안과 외곽 밖, 다른 적의 칸으로 이동시키지 않는다', () => {
    const t = makePart('p2', 'tractor', 3, 0, 2); const s = arena([core(), t]);
    expect(tractorTarget(s, t)).toBeUndefined(); t.dir = 0; expect(tractorTarget(s, t)).toBeUndefined();
    t.dir = 1; s.enemies.push({ ...enemy('bomber', 4), id: 'second' });
    const target = tractorTarget(s, t); expect(target?.enemy.id).toBe('second'); expect(target?.destination.x).toBe(5);
  });
  it('폭풍 유리는 턴당 2회, 유물은 정의된 예산 이상 발동하지 않는다', () => {
    const s = arena([core(), ...[2, 3, 4].map((x, i) => makePart(`p${i + 2}`, 'shield', x, 1)), makePart('p5', 'generator', 3, 2)]);
    s.enemies[0].intent.kind = 'area';
    const r = resolveTurn(s); expect(r.power.reduce((n, p) => n + p.impact, 0)).toBe(10);
    for (const id of Object.keys(RELICS) as (keyof typeof RELICS)[]) { const counts = {}; for (let i = 0; i < 30; i++) trigger(counts, id); expect(counts).toEqual({ [id]: RELICS[id].limit }); }
  });
  it('서리 화약은 제거한 열만 다음 발사 피해로 바꾸고 자연 냉각은 제외한다', () => {
    const s = newGame('thermal'); s.relics.push('thermal');
    const r = resolveTurn(s); expect(r.state.parts.find(p => p.kind === 'cannon')!.bonus).toBe(3);
    expect(r.state.parts.find(p => p.kind === 'cannon')!.heat).toBe(0);
    const next = resolveTurn(r.state); expect(next.events.find(e => e.kind === 'fire')?.amount).toBe(8);
  });
  it('귀환 표식은 파괴된 부품에만 잔해를 남긴다', () => {
    const p = makePart('p2', 'shield', 3, 1); p.hp = 1;
    const s = arena([core(), p]); s.relics.push('remains');
    const r = resolveTurn(s); expect(r.state.debris).toContainEqual({ x: 3, y: 1, amount: 3 });
  });
  it('불안정 심장은 저장 전력 공격 보너스와 피격 전력 손실을 정산한다', () => {
    const s = newGame('overcharge'); s.parts.find(p => p.kind === 'capacitor')!.charge = 6; s.relics.push('overcharge');
    const r = resolveTurn(s); expect(r.events.find(e => e.kind === 'fire')?.amount).toBe(7); expect(r.power[0].loss).toBeGreaterThanOrEqual(2);
    expect(r.power[0].initial + r.power[0].produced + r.power[0].impact).toBe(r.power[0].consumed + r.power[0].stored + r.power[0].loss);
  });
  it('접지 나침반은 첫 단선을 막고 전력 2를 생성한다', () => {
    const s = newGame('ground'); s.relics.push('grounding'); s.enemies[0].intent.kind = 'jam';
    const r = resolveTurn(s); expect(r.state.parts.find(p => p.kind === 'shield')?.jammed).toBe(0); expect(r.power[0].impact).toBe(7);
  });
  it('연결 방해는 이번 턴과 다음 턴 작동을 차단하고 만료된다', () => {
    const s = newGame('jam'); s.enemies[0].intent.kind = 'jam';
    const first = resolveTurn(s); expect(first.state.parts.find(p => p.kind === 'shield')?.jammed).toBe(1);
    first.state.enemies[0].intent.kind = 'charge';
    const second = resolveTurn(first.state); expect(second.state.parts.find(p => p.kind === 'shield')?.jammed).toBe(0);
  });
  it('충전 적은 공격 대신 다음 턴에 강해진다', () => {
    const s = arena([core()], [enemy('charger')]); generateIntents(s);
    const r = resolveTurn(s); expect(r.state.parts[0].hp).toBe(36); expect(r.state.enemies[0].intent.damage).toBe(7);
    const r2 = resolveTurn(r.state); expect(r2.state.parts[0].hp).toBe(29);
  });
  it('보스는 절반 체력에서 측면 이동과 단선/교차 패턴으로 전환한다', () => {
    const s = newGame('boss'); s.encounter = 5; const b = prepareEncounter(s);
    expect(b.enemies[0].intent.kind).toBe('area'); b.enemies[0].hp = 24; b.turn = 2; generateIntents(b);
    expect(b.enemies[0]).toMatchObject({ x: 7, y: 3, stage: 2, intent: { kind: 'jam' } });
    b.turn = 3; generateIntents(b); expect(b.enemies[0].intent.kind).toBe('cross'); expect(attackRays(b.enemies[0])).toHaveLength(2);
  });
  it('과열 대포는 발사하지 않고 자연 냉각한다', () => {
    const s = newGame('heat'); s.parts.find(p => p.kind === 'cannon')!.heat = 8;
    const r = resolveTurn(s); expect(r.events.some(e => e.kind === 'fire')).toBe(false); expect(r.status.p3.reason).toContain('과열');
    expect(r.state.parts.find(p => p.kind === 'cannon')!.heat).toBeLessThan(8);
  });
});

describe('캠페인·결정성·저장', () => {
  it('동일 시드·동일 입력은 항상 동일하고 예측이 원본을 변경하지 않는다', () => {
    const a = newGame('same'), b = newGame('same'), before = clone(a);
    expect(resolveTurn(a)).toEqual(resolveTurn(b)); expect(a).toEqual(before);
    expect(resolveTurn(a).state).toEqual(resolveTurn(a).state);
  });
  it('시드가 후속 조우 편성과 보상 순열에 영향을 준다', () => {
    const values = Array.from({ length: 10 }, (_, i) => { const s = newGame(`seed-${i}`); s.encounter = 1; return prepareEncounter(s).enemies[1].x; });
    expect(new Set(values).size).toBe(2);
  });
  it('첫 전투는 기본 배치로 3턴에 돌파하고 3개 보상 중 하나를 고른다', () => {
    let s = newGame('intro'); for (let i = 0; i < 3; i++) s = resolveTurn(s).state;
    expect(s.phase).toBe('reward'); expect(s.rewards).toHaveLength(3);
    const after = chooseReward(s, 'scrap'); expect(after.encounter).toBe(1); expect(after.phase).toBe('build'); expect(after.scrap).toBe(s.scrap + 18);
    expect(chooseReward(after, 'scrap')).toBe(after);
  });
  it('2번째와 4번째 조우 후 경로 선택을 거치며 혜택과 위험이 적용된다', () => {
    let s = newGame('route'); for (let i = 0; i < 3; i++) s = resolveTurn(s).state;
    for (const encounter of [1, 3]) {
      const input = clone(s); input.encounter = encounter;
      const route = chooseReward(input, 'scrap'); expect(route.phase).toBe('route');
      const risk = chooseRoute(route, 'salvage'); expect(risk.scrap).toBe(route.scrap + 14); expect(risk.enemies[0].maxHp).toBe(ENEMIES[risk.enemies[0].kind].hp + 3);
      const safe = chooseRoute(route, 'shelter'); expect(safe.phase).toBe('build'); expect(safe.enemies[0].maxHp).toBe(ENEMIES[safe.enemies[0].kind].hp);
    }
  });
  it('도시 핵 파괴는 패배, 마지막 적 격파는 승리다', () => {
    const c = core(); c.hp = 1; const loss = resolveTurn(arena([c])); expect(loss.state.phase).toBe('lost');
    const s = newGame('win'); s.encounter = 5; s.enemies[0].hp = 1; expect(resolveTurn(s).state.phase).toBe('won');
  });
  it('핵 파괴가 같은 턴 적 전멸보다 우선한다', () => {
    const c = core(); c.hp = 1;
    const gun = makePart('p2', 'cannon', 3, 5); const cap = makePart('p3', 'capacitor', 2, 5); cap.charge = 8;
    const s = arena([c, gun, cap]); s.enemies[0].hp = 1;
    const r = resolveTurn(s); expect(r.state.enemies).toHaveLength(0); expect(r.state.phase).toBe('lost');
  });
  it('저장·복원 후 동일 입력에 동일 결과를 낸다', () => {
    const s = resolveTurn(newGame('save')).state; const loaded = deserialize(serialize(s));
    expect(loaded.error).toBeUndefined(); expect(loaded.state).toEqual(s); expect(resolveTurn(loaded.state!)).toEqual(resolveTurn(s));
    const map = new Map<string, string>(); const storage = { setItem: (k: string, v: string) => { map.set(k, v); }, getItem: (k: string) => map.get(k) ?? null };
    expect(saveLocal(s, storage)).toBeUndefined(); expect(loadLocal(storage).state).toEqual(s);
  });
  it('손상·지원하지 않는 버전·범위 오류·중복 부품을 안전하게 거부한다', () => {
    expect(deserialize('not json').error).toBeTruthy(); expect(deserialize('{"version":2}').error).toBeTruthy();
    for (const mutate of [(s: GameState) => { s.parts[0].x = 99; }, (s: GameState) => { s.parts.push(clone(s.parts[0])); }, (s: GameState) => { s.scrap = -1; }, (s: GameState) => { s.enemies[0].intent.damage = Infinity; }]) {
      const s = newGame('bad'); mutate(s); expect(deserialize(JSON.stringify({ version: 1, state: s })).error).toBeTruthy();
    }
    expect(loadLocal({ getItem: () => { throw new Error('denied'); } }).error).toBeTruthy();
    expect(saveLocal(newGame('quota'), { setItem: () => { throw new Error('quota'); } })).toBe('quota');
  });
  it('계획 도중 저장은 금지하고 실행 후 경계 저장은 허용한다', () => {
    const s = newGame('boundary'); s.phase = 'plan'; const draft = command(s, { type: 'rotate', id: 'p3' }).state;
    expect(() => serialize(draft)).toThrow(); expect(() => serialize(resolveTurn(draft).state)).not.toThrow();
  });
  it('비전투 상태에서 중복 실행은 아무 변화가 없다', () => {
    let s = newGame('lock'); for (let i = 0; i < 3; i++) s = resolveTurn(s).state;
    expect(resolveTurn(s).state).toEqual(s); expect(resolveTurn(s).events).toHaveLength(0);
  });
});
