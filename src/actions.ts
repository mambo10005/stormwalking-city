import { PARTS } from './content';
import { adjacent, canPlace, rotate } from './grid';
import { clone, makePart } from './state';
import type { Command, Dir, GameState, PartKind } from './types';
export interface ActionResult { state: GameState; error?: string }
export function placePart(input: GameState, kind: PartKind, x: number, y: number, dir: Dir = 0): ActionResult {
  if (input.phase !== 'build' || kind === 'core') return { state: input, error: '정비 단계에서만 새 부품을 조립할 수 있습니다.' };
  if (!canPlace(input.parts, { x, y })) return { state: input, error: '격자 안의 빈 칸을 선택하세요.' };
  if (input.scrap < PARTS[kind].cost) return { state: input, error: '고철이 부족합니다.' };
  const s = clone(input); s.scrap -= PARTS[kind].cost; s.parts.push(makePart(`p${s.nextId++}`, kind, x, y, dir)); return { state: s };
}
export function sellPart(input: GameState, id: string): ActionResult {
  const p = input.parts.find(p => p.id === id);
  if (input.phase !== 'build' || !p || p.kind === 'core') return { state: input, error: '도시 핵은 판매할 수 없으며, 판매는 정비 단계에서만 가능합니다.' };
  const s = clone(input); s.scrap += Math.floor(PARTS[p.kind].cost * 0.6); s.parts = s.parts.filter(p => p.id !== id); return { state: s };
}
export function command(input: GameState, action: Command): ActionResult {
  if (!['build', 'plan'].includes(input.phase)) return { state: input, error: '지금은 명령할 수 없습니다.' };
  if (input.phase === 'plan' && input.commands <= 0) return { state: input, error: '남은 지휘 행동이 없습니다. 계획을 되돌리거나 실행하세요.' };
  const p = input.parts.find(p => p.id === action.id);
  if (!p) return { state: input, error: '선택한 부품이 없습니다.' };
  if (action.type === 'move') {
    if (p.kind === 'core') return { state: input, error: '도시 핵의 위치는 고정입니다.' };
    if (!canPlace(input.parts, action, p.id)) return { state: input, error: '이동할 칸이 비어 있지 않거나 격자 밖입니다.' };
    if (input.phase === 'plan' && !adjacent(p, action)) return { state: input, error: '전투 중에는 빈 직교 인접 칸으로만 이동할 수 있습니다.' };
    if (p.x === action.x && p.y === action.y) return { state: input, error: '다른 칸을 선택하세요.' };
  }
  if (action.type === 'repair' && (input.scrap < 3 || p.hp >= PARTS[p.kind].hp)) return { state: input, error: input.scrap < 3 ? '긴급 수리에는 고철 3이 필요합니다.' : '내구도가 이미 최대입니다.' };
  const s = clone(input); const q = s.parts.find(p => p.id === action.id)!;
  if (action.type === 'move') { q.x = action.x; q.y = action.y; }
  if (action.type === 'rotate') q.dir = rotate(q.dir);
  if (action.type === 'priority') q.priority = q.priority % 3 + 1;
  if (action.type === 'repair') { s.scrap -= 3; q.hp = Math.min(PARTS[q.kind].hp, q.hp + 6); }
  if (s.phase === 'plan') s.commands--; return { state: s };
}
