import { ENEMIES, PARTS } from './content';
import { generateIntents, makeRewards } from './campaign';
import { adjacent, at, attackRays, distance, inFiringLine, onRim, VECTORS } from './grid';
import { trigger, type EffectCounts } from './effects';
import { allocate, networks, priorityOrder } from './power';
import { clone } from './state';
import type { BattleEvent, Enemy, GameState, Part, PartStatus, Point, PowerReport, TurnResult } from './types';

interface Energy { owner: string; origin: number; amount: number }
export function tractorTarget(s: GameState, p: Part): { enemy: Enemy; destination: Point } | undefined {
  const v = VECTORS[p.dir];
  for (const enemy of [...s.enemies].filter(e => e.hp > 0 && distance(p, e) <= PARTS.tractor.range).sort((a, b) => distance(p, a) - distance(p, b) || a.id.localeCompare(b.id))) {
    const destination = { x: enemy.x + v.x, y: enemy.y + v.y };
    if (onRim(destination) && !s.enemies.some(e => e.hp > 0 && e.id !== enemy.id && e.x === destination.x && e.y === destination.y)) return { enemy, destination };
  }
  return undefined;
}
export function cannonTarget(s: GameState, p: Part): Enemy | undefined {
  return s.enemies.filter(e => e.hp > 0 && inFiringLine(p, e)).sort((a, b) => distance(p, a) - distance(p, b) || a.id.localeCompare(b.id))[0];
}
/** Pure, deterministic turn transaction. Both preview and commit call this function. */
export function resolveTurn(input: GameState): TurnResult {
  const s = clone(input);
  const events: BattleEvent[] = [], status: Record<string, PartStatus> = {};
  if (!['plan', 'build'].includes(s.phase)) return { state: s, events, status, power: [], aimedEnemies: clone(s.enemies) };
  const counts: EffectCounts = {};
  const initialNetworks = networks(s.parts);
  const power: PowerReport[] = initialNetworks.map(n => ({ id: n.id, members: n.members, produced: n.production, initial: n.stored, impact: 0, consumed: 0, stored: 0, loss: 0, capacity: n.capacity }));
  const energy: Energy[] = [];
  const completed = new Set<string>();
  const emit = (kind: BattleEvent['kind'], text: string, at?: Point, amount?: number, to?: Point) => events.push({ kind, text, at: at ? { x: at.x, y: at.y } : undefined, amount, to });
  const networkFor = (p: Part) => networks(s.parts).find(n => n.members.includes(p.id));
  const original = (id: string) => power.find(n => n.members.includes(id));
  const funds = (ids: string[]) => energy.filter(e => ids.includes(e.owner)).reduce((sum, e) => sum + e.amount, 0);
  function debit(ids: string[], amount: number, category: 'consumed' | 'loss' | 'stored'): number {
    let remaining = amount;
    for (const e of energy) {
      if (!ids.includes(e.owner) || remaining <= 0) continue;
      const take = Math.min(e.amount, remaining); e.amount -= take; remaining -= take;
      power[e.origin - 1][category] += take;
    }
    return amount - remaining;
  }
  function gain(p: Part, amount: number, source: string): void {
    const net = networkFor(p); const report = original(p.id);
    if (!net || !net.hasGenerator || !report) { emit('info', `${source}: 발전기 연결이 없어 변환 실패`, p); return; }
    report.impact += amount;
    let remaining = amount;
    for (const cap of s.parts.filter(q => q.kind === 'capacitor' && net.members.includes(q.id))) {
      const held = funds([cap.id]);
      const fill = Math.min(remaining, Math.max(0, PARTS.capacitor.storage - held));
      if (fill > 0) { energy.push({ owner: cap.id, origin: report.id, amount: fill }); remaining -= fill; emit('power', `${source} → 축전기 충전 +${fill}`, cap, fill); }
    }
    if (remaining > 0) { energy.push({ owner: p.id, origin: report.id, amount: remaining }); emit('power', `${source} → 연결망 전력 +${remaining}`, p, remaining); }
  }
  function destroy(p: Part): void {
    p.hp = 0; debit([p.id], funds([p.id]), 'loss');
    emit('destroy', `${PARTS[p.kind].name} 파괴 · 이후 작동 중지`, p);
    status[p.id] = { active: false, reason: '실행 전 파괴됨' };
    if (p.kind !== 'core' && s.relics.includes('remains') && trigger(counts, 'remains')) { s.debris.push({ x: p.x, y: p.y, amount: 3 }); emit('salvage', '귀환 표식 · 고철 3 잔해 생성', p); }
  }
  function killEnemy(e: Enemy): void {
    emit('destroy', `${ENEMIES[e.kind].name} 격파 · 잔해 생성`, e);
    // Wrecks fall into the nearest city edge so recovery placement matters.
    s.debris.push({ x: Math.max(0, Math.min(6, e.x)), y: Math.max(0, Math.min(6, e.y)), amount: 4 });
  }
  function eligible(p: Part): boolean {
    if (completed.has(p.id) || p.hp <= 0 || p.jammed > 0) return false;
    if (p.kind === 'cannon') return p.heat < PARTS.cannon.maxHeat && !!cannonTarget(s, p);
    if (p.kind === 'tractor') return !!tractorTarget(s, p);
    if (p.kind === 'cooler') return s.parts.some(q => q.hp > 0 && adjacent(p, q) && (q.heat > 0 || q.kind === 'cannon'));
    if (p.kind === 'repair') return s.scrap >= PARTS.repair.salvageCost && s.parts.some(q => q.hp > 0 && q.hp < PARTS[q.kind].hp && adjacent(p, q));
    if (p.kind === 'salvager') return s.debris.some(d => distance(p, d) <= PARTS.salvager.range);
    return false;
  }
  function reason(p: Part): string {
    if (p.hp <= 0) return '파괴됨';
    if (p.jammed > 0) return '단선 · 연결 방해 중';
    if (p.kind === 'cannon' && p.heat >= PARTS.cannon.maxHeat) return `과열 ${p.heat}/${PARTS.cannon.maxHeat}`;
    if (p.kind === 'cannon' && !cannonTarget(s, p)) return '공격 방향에 적이 없음';
    if (p.kind === 'tractor' && !tractorTarget(s, p)) return '외곽으로 이동 가능한 적이 없음';
    if (p.kind === 'repair' && s.scrap < PARTS.repair.salvageCost) return '수리용 고철 부족';
    if (!eligible(p)) return '유효한 대상이 없음';
    const n = networkFor(p);
    if (!n?.hasGenerator && (!n || funds(n.members) === 0)) return '발전기 연결 없음 · 저장 전력 없음';
    return '전력 부족 · 높은 우선순위부터 배정';
  }
  function consume(p: Part): boolean {
    if (!eligible(p)) { if (p.hp > 0) status[p.id] = { active: false, reason: reason(p) }; completed.add(p.id); return false; }
    const net = networkFor(p);
    const pending = s.parts.filter(q => net?.members.includes(q.id) && eligible(q));
    const accepted = net ? allocate(pending, funds(net.members)) : new Set<string>();
    if (!net || !accepted.has(p.id)) { status[p.id] = { active: false, reason: reason(p) }; completed.add(p.id); return false; }
    debit(net.members, PARTS[p.kind].power, 'consumed'); completed.add(p.id);
    status[p.id] = { active: true, reason: `작동 · 전력 ${PARTS[p.kind].power} 소비` }; return true;
  }

  // 1. Production. Energy stays physically at its generator or capacitor until consumed.
  for (const p of s.parts) {
    const report = original(p.id);
    if (report) {
      energy.push({ owner: p.id, origin: report.id, amount: PARTS[p.kind].production + p.charge }); p.charge = 0;
      if (p.kind === 'generator') emit('power', `발전기 생산 +${PARTS.generator.production}`, p, PARTS.generator.production);
    }
    if (!PARTS[p.kind].power) status[p.id] = { active: p.jammed === 0, reason: p.jammed ? '단선 · 전력망에서 분리' : p.kind === 'generator' ? '전력 3 생산' : '수동 효과 · 전력 소비 없음' };
  }

  // 2. Tractor: move first, then recompute the actual attack lines.
  for (const p of priorityOrder(s.parts.filter(q => q.kind === 'tractor'))) {
    if (!consume(p)) continue;
    const target = tractorTarget(s, p)!; const from = { x: target.enemy.x, y: target.enemy.y };
    Object.assign(target.enemy, target.destination); emit('move', `견인 · ${ENEMIES[target.enemy.kind].name} 공격선 이동`, from, 1, target.destination);
    if (s.relics.includes('echo') && trigger(counts, 'echo')) {
      target.enemy.hp -= 2; emit('hit', '잔향 피스톤 · 충격 피해 2', target.enemy, 2);
      if (target.enemy.hp <= 0) killEnemy(target.enemy);
    }
  }
  const aimedEnemies = clone(s.enemies.filter(e => e.hp > 0));

  // 3. Enemy attacks. Every ray stops at its first surviving part.
  for (const e of s.enemies.filter(e => e.hp > 0)) {
    if (e.intent.kind === 'charge') { e.strength += 3; emit('info', `${ENEMIES[e.kind].name} 축뢰 · 다음 공격 +3`, e); continue; }
    for (const ray of attackRays(e)) {
      const p = ray.map(pos => at(s.parts, pos)).find(Boolean);
      if (!p) { emit('info', `${ENEMIES[e.kind].name}의 공격이 빈 공간을 통과`); continue; }
      const taken = Math.min(p.hp, e.intent.damage); p.hp -= taken;
      emit('hit', `${PARTS[p.kind].name} 피격 −${taken}`, p, taken, { x: e.x, y: e.y });
      if (taken && s.relics.includes('overcharge') && trigger(counts, 'overcharge')) {
        const n = networkFor(p) ?? initialNetworks.find(n => n.members.includes(p.id));
        const lost = n ? debit(n.members, 2, 'loss') : 0;
        if (lost) emit('power', `불안정 심장 · 피격 손실 −${lost}`, p, -lost);
      }
      if (p.hp <= 0) { destroy(p); continue; }
      if (p.kind === 'shield' && taken && s.relics.includes('stormglass') && trigger(counts, 'stormglass')) gain(p, 5, '폭풍 유리');
      if (e.intent.kind === 'jam') {
        if (s.relics.includes('grounding') && trigger(counts, 'grounding')) gain(p, 2, '접지 나침반');
        else { p.jammed = 2; emit('hit', `${PARTS[p.kind].name} 단선 · 다음 턴까지 분리`, p); }
      }
    }
    e.strength = 0;
  }

  // 4. Surviving guns. Admission is recalculated after impact energy and disconnections.
  for (const p of priorityOrder(s.parts.filter(q => q.kind === 'cannon'))) {
    if (!consume(p)) continue;
    const target = cannonTarget(s, p)!;
    const n = networkFor(p);
    const startStored = initialNetworks.filter(old => old.members.some(id => n?.members.includes(id))).reduce((sum, old) => sum + old.stored, 0);
    const boost = s.relics.includes('overcharge') ? Math.min(3, Math.floor(startStored / 3)) : 0;
    const damage = PARTS.cannon.damage + p.bonus + boost;
    target.hp -= damage; p.bonus = 0; p.heat += PARTS.cannon.heat;
    emit('fire', `대포 반격 · ${ENEMIES[target.kind].name} −${damage}`, p, damage, { x: target.x, y: target.y });
    if (target.hp <= 0) killEnemy(target);
  }

  // 5. Cooling, repair, recovery. No destroyed part can act or become a target.
  for (const kind of ['cooler', 'repair', 'salvager'] as const) for (const p of priorityOrder(s.parts.filter(q => q.kind === kind))) {
    if (!consume(p)) continue;
    if (kind === 'cooler') {
      let cooled = 0;
      for (const q of s.parts.filter(q => q.hp > 0 && adjacent(p, q))) { const d = Math.min(q.heat, PARTS.cooler.amount); q.heat -= d; cooled += d; }
      emit('cool', `냉각기 · 열 −${cooled}`, p, cooled);
      if (s.relics.includes('thermal') && cooled > 0) for (const q of priorityOrder(s.parts.filter(q => q.kind === 'cannon' && q.hp > 0 && adjacent(p, q)))) {
        const bonus = trigger(counts, 'thermal', Math.min(cooled, 4 - q.bonus)); q.bonus += bonus; cooled -= bonus;
        if (bonus) emit('power', `서리 화약 · 다음 대포 피해 +${bonus}`, q, bonus);
      }
    } else if (kind === 'repair') {
      const target = s.parts.filter(q => q.hp > 0 && q.hp < PARTS[q.kind].hp && adjacent(p, q)).sort((a, b) => a.hp / PARTS[a.kind].hp - b.hp / PARTS[b.kind].hp || a.id.localeCompare(b.id))[0];
      if (target) { const healed = Math.min(PARTS.repair.amount, PARTS[target.kind].hp - target.hp); target.hp += healed; s.scrap -= PARTS.repair.salvageCost; emit('repair', `수리소 · ${PARTS[target.kind].name} +${healed} / 고철 −1`, target, healed); }
    } else {
      const targets = s.debris.filter(d => distance(p, d) <= PARTS.salvager.range).slice(0, PARTS.salvager.amount);
      const amount = targets.reduce((sum, d) => sum + d.amount, 0); s.scrap += amount; s.debris = s.debris.filter(d => !targets.includes(d)); emit('salvage', `잔해 회수 · 고철 +${amount}`, p, amount);
    }
  }

  // 6. Storage and loss. Every unit is accounted for, including destroyed source loss.
  for (const net of networks(s.parts)) {
    for (const p of s.parts.filter(q => net.members.includes(q.id) && q.kind === 'capacitor')) {
      const fill = Math.min(funds(net.members), PARTS.capacitor.storage); p.charge = fill;
      debit(net.members, fill, 'stored');
      if (fill) emit('power', `잔여 전력 축전 +${fill}`, p, fill);
    }
  }
  for (const e of energy) { if (e.amount) { power[e.origin - 1].loss += e.amount; e.amount = 0; } }
  for (const p of s.parts) { p.heat = Math.max(0, p.heat - 1); p.jammed = Math.max(0, p.jammed - 1); }
  s.parts = s.parts.filter(p => p.hp > 0); s.enemies = s.enemies.filter(e => e.hp > 0);

  // 7. Core defeat takes precedence over a simultaneous enemy wipe.
  if (!s.parts.some(p => p.kind === 'core')) { s.phase = 'lost'; emit('info', '도시 핵 소실. 기록은 다음 도시로 전해집니다.'); }
  else if (!s.enemies.length) {
    s.scrap += 8 + (s.route === 'salvage' ? 3 : 0) + Math.floor(s.debris.reduce((n, d) => n + d.amount, 0) / 2); s.debris = [];
    if (s.encounter === 5) { s.phase = 'won'; emit('info', '폭풍의 눈을 통과했습니다. 도시는 새벽에 도착합니다.'); }
    else { s.phase = 'reward'; s.rewards = makeRewards(s); emit('salvage', '조우 돌파 · 기본 고철 +8 · 보상 하나를 선택하세요.'); }
  } else { s.turn++; s.phase = 'plan'; generateIntents(s); }
  s.commands = 2; s.journal = [...events.map(e => e.text).reverse(), ...s.journal].slice(0, 60);
  return { state: s, events, power, status, aimedEnemies };
}
