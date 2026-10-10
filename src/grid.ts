import { PARTS } from './content';
import type { Dir, Enemy, Part, Point } from './types';
export const SIZE = 7;
export const VECTORS: Point[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
export const inside = (p: Point) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < SIZE && p.y >= 0 && p.y < SIZE;
export const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const at = (parts: Part[], p: Point) => parts.find(q => q.hp > 0 && q.x === p.x && q.y === p.y);
export const canPlace = (parts: Part[], p: Point, ignoreId?: string) => inside(p) && !parts.some(q => q.id !== ignoreId && q.hp > 0 && q.x === p.x && q.y === p.y);
export const rotate = (dir: Dir): Dir => ((dir + 1) % 4) as Dir;
export const adjacent = (a: Point, b: Point) => distance(a, b) === 1;
export const onRim = (p: Point) => Number.isInteger(p.x) && Number.isInteger(p.y) && (([p.x, p.y].includes(-1) || [p.x, p.y].includes(7)) && p.x >= -1 && p.x <= 7 && p.y >= -1 && p.y <= 7 && !(Math.abs(p.x - 3) === 4 && Math.abs(p.y - 3) === 4));
export function inFiringLine(part: Part, target: Point): boolean {
  const v = VECTORS[part.dir];
  const dx = target.x - part.x, dy = target.y - part.y;
  return dx * v.y === dy * v.x && dx * v.x + dy * v.y > 0 && distance(part, target) <= PARTS[part.kind].range;
}
export function rayCells(enemy: Enemy, offset = 0): Point[] {
  if (enemy.y === -1) return Array.from({ length: 7 }, (_, y) => ({ x: enemy.x + offset, y })).filter(inside);
  if (enemy.y === 7) return Array.from({ length: 7 }, (_, i) => ({ x: enemy.x + offset, y: 6 - i })).filter(inside);
  if (enemy.x === -1) return Array.from({ length: 7 }, (_, x) => ({ x, y: enemy.y + offset })).filter(inside);
  return Array.from({ length: 7 }, (_, i) => ({ x: 6 - i, y: enemy.y + offset })).filter(inside);
}
export function attackRays(enemy: Enemy): Point[][] {
  if (enemy.intent.kind === 'charge') return [];
  const rays = (enemy.intent.kind === 'area' ? [-1, 0, 1] : [0]).map(n => rayCells(enemy, n));
  if (enemy.intent.kind === 'cross') {
    const opposite: Enemy = { ...enemy, x: enemy.x === -1 ? 7 : enemy.x === 7 ? -1 : 3, y: enemy.y === -1 ? 7 : enemy.y === 7 ? -1 : enemy.y };
    rays.push(rayCells(opposite));
  }
  return rays;
}
