import { PARTS } from './content';
import { adjacent } from './grid';
import type { Network, Part, PowerReport } from './types';
export function networks(parts: Part[]): Network[] {
  const alive = parts.filter(p => p.hp > 0 && p.jammed === 0);
  const seen = new Set<string>();
  const result: Network[] = [];
  for (const p of alive) {
    if (seen.has(p.id)) continue;
    const members = [p]; seen.add(p.id);
    for (let i = 0; i < members.length; i++) for (const q of alive) {
      if (!seen.has(q.id) && adjacent(members[i], q)) { seen.add(q.id); members.push(q); }
    }
    result.push({ id: result.length + 1, members: members.map(m => m.id), hasGenerator: members.some(m => m.kind === 'generator'), production: members.reduce((sum, m) => sum + PARTS[m.kind].production, 0), stored: members.reduce((sum, m) => sum + m.charge, 0), capacity: members.reduce((sum, m) => sum + PARTS[m.kind].storage, 0) });
  }
  return result;
}
export interface Bus { net: Network; pool: number; report: PowerReport }
export function createBuses(parts: Part[]): Bus[] {
  return networks(parts).map(net => ({ net, pool: net.stored + net.production, report: { id: net.id, members: net.members, produced: net.production, initial: net.stored, impact: 0, consumed: 0, stored: 0, loss: 0, capacity: net.capacity } }));
}
export const busFor = (buses: Bus[], id: string) => buses.find(b => b.net.members.includes(id));
export function priorityOrder(parts: Part[]): Part[] { return [...parts].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id, 'en')); }
/** Admission reserves energy by global priority, then each admitted consumer acts in phase order. */
export function allocate(parts: Part[], available: number): Set<string> {
  const result = new Set<string>();
  for (const p of priorityOrder(parts)) {
    const cost = PARTS[p.kind].power;
    if (p.hp <= 0 || p.jammed || (p.kind === 'cannon' && p.heat >= PARTS.cannon.maxHeat)) continue;
    if (available >= cost) { result.add(p.id); available -= cost; }
  }
  return result;
}
