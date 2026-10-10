import { ENEMIES, PARTS, RELICS } from './content';
import { canPlace, onRim } from './grid';
import { clone } from './state';
import type { GameState } from './types';
export const SAVE_KEY = 'stormwalker.save.v1';
export const SAVE_VERSION = 1;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, min = 0, max = 100000) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const str = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max;
const enumKey = (o: object, value: unknown) => typeof value === 'string' && Object.hasOwn(o, value);
export function isGameState(value: unknown): value is GameState {
  if (!record(value)) return false;
  const s = value;
  if (s.version !== SAVE_VERSION || !str(s.seed, 64) || !num(s.rng, 1, 4294967295) || !num(s.encounter, 0, 5) || !num(s.turn, 1) || !num(s.scrap) || !num(s.nextId, 1) || !num(s.commands, 0, 2)) return false;
  if (!['build', 'plan', 'reward', 'route', 'won', 'lost'].includes(s.phase as string) || !['shelter', 'salvage'].includes(s.route as string)) return false;
  if (!Array.isArray(s.parts) || s.parts.length > 49 || !Array.isArray(s.enemies) || s.enemies.length > 8) return false;
  const ids = new Set<string>(), cells = new Set<string>();
  let cores = 0, highestId = 0;
  for (const raw of s.parts) {
    if (!record(raw) || !enumKey(PARTS, raw.kind) || !str(raw.id, 30) || !/^p[1-9]\d*$/.test(raw.id as string)) return false;
    const p = raw as unknown as GameState['parts'][number]; const d = PARTS[p.kind];
    if (!canPlace([], p) || ids.has(p.id) || cells.has(`${p.x},${p.y}`)) return false;
    ids.add(p.id); cells.add(`${p.x},${p.y}`); highestId = Math.max(highestId, Number(p.id.slice(1)));
    if (!num(p.hp, 1, d.hp) || !num(p.heat, 0, 20) || !num(p.dir, 0, 3) || !num(p.charge, 0, d.storage) || !num(p.priority, 1, 3) || !num(p.jammed, 0, 1) || !num(p.bonus, 0, 4)) return false;
    if (p.kind === 'core') { cores++; if (p.x !== 3 || p.y !== 3) return false; }
  }
  if ((s.nextId as number) <= highestId || cores !== (s.phase === 'lost' ? 0 : 1)) return false;
  const enemyCells = new Set<string>();
  for (const raw of s.enemies) {
    if (!record(raw) || !enumKey(ENEMIES, raw.kind) || !str(raw.id, 30) || ids.has(raw.id as string)) return false;
    const e = raw as unknown as GameState['enemies'][number]; ids.add(e.id);
    if (!onRim(e) || enemyCells.has(`${e.x},${e.y}`) || !num(e.maxHp, 1, 200) || !num(e.hp, 1, e.maxHp) || !num(e.strength, 0, 30) || ![1, 2].includes(e.stage)) return false;
    enemyCells.add(`${e.x},${e.y}`);
    if (!record(e.intent) || !['line', 'area', 'jam', 'charge', 'cross'].includes(e.intent.kind) || !num(e.intent.damage, 0, 50) || !str(e.intent.label)) return false;
  }
  if (!Array.isArray(s.relics) || s.relics.length > 6 || new Set(s.relics).size !== s.relics.length || !s.relics.every(r => enumKey(RELICS, r))) return false;
  if (!Array.isArray(s.debris) || s.debris.length > 100 || !s.debris.every(d => record(d) && num(d.x, 0, 6) && num(d.y, 0, 6) && num(d.amount, 1, 20))) return false;
  if (!Array.isArray(s.journal) || s.journal.length > 60 || !s.journal.every(j => str(j, 300))) return false;
  if (!Array.isArray(s.routes) || s.routes.length > 2 || !s.routes.every(r => ['shelter', 'salvage'].includes(r))) return false;
  if (!Array.isArray(s.rewards) || s.rewards.length > 3 || !s.rewards.every(r => record(r) && str(r.id, 30) && ['relic', 'scrap', 'repair'].includes(r.type as string) && str(r.title) && str(r.description, 400) && num(r.value, 0, 30) && (r.type !== 'relic' || enumKey(RELICS, r.relic)))) return false;
  if (s.phase === 'reward' && (s.rewards.length !== 3 || s.enemies.length !== 0)) return false;
  if (s.phase === 'won' && (s.encounter !== 5 || s.enemies.length !== 0)) return false;
  if (['build', 'plan'].includes(s.phase as string) && !s.enemies.length) return false;
  if (s.phase === 'plan' && s.commands !== 2) return false;
  return true;
}
export function serialize(s: GameState): string {
  if (!isGameState(s)) throw new Error('저장은 정비 또는 확정된 턴 경계에서만 가능합니다. 계획을 취소한 뒤 저장하세요.');
  return JSON.stringify({ version: SAVE_VERSION, state: s });
}
export function deserialize(text: string): { state?: GameState; error?: string } {
  try {
    if (text.length > 150000) return { error: '저장 파일이 너무 큽니다.' };
    const data: unknown = JSON.parse(text);
    if (!record(data) || data.version !== SAVE_VERSION) return { error: '지원하지 않는 저장 버전입니다. 새 여정을 시작할 수 있습니다.' };
    if (!isGameState(data.state)) return { error: '저장 데이터가 손상되었습니다. 현재 여정은 그대로 유지됩니다.' };
    return { state: clone(data.state) };
  } catch { return { error: '저장 데이터를 읽을 수 없습니다. 현재 여정은 그대로 유지됩니다.' }; }
}
export function saveLocal(s: GameState, storage: Pick<Storage, 'setItem'> = localStorage): string | undefined {
  try { storage.setItem(SAVE_KEY, serialize(s)); return undefined; } catch (e) { return e instanceof Error ? e.message : '브라우저 저장 공간을 사용할 수 없습니다.'; }
}
export function loadLocal(storage: Pick<Storage, 'getItem'> = localStorage) {
  try { const value = storage.getItem(SAVE_KEY); return value ? deserialize(value) : { error: '저장된 여정이 없습니다.' }; } catch { return { error: '이 브라우저에서는 저장 공간을 사용할 수 없습니다.' }; }
}
