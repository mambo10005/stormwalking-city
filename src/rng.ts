export function seedHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0 || 1;
}
export function random(seed: number): [number, number] {
  let s = seed >>> 0;
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
  return [(s >>> 0) / 4294967296, s >>> 0];
}
