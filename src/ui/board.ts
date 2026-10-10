import { DIR_NAMES, ENEMIES, PARTS } from '../content';
import { attackRays, inFiringLine, VECTORS } from '../grid';
import { networks } from '../power';
import type { BattleEvent, GameState, Part, Point, TurnResult } from '../types';
export const CELL = 64, OFFSET = 136, BOARD = 720;
export const center = (p: Point): Point => ({ x: OFFSET + p.x * CELL + CELL / 2, y: OFFSET + p.y * CELL + CELL / 2 });
export const boardPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number): Point => {
  const r = canvas.getBoundingClientRect();
  return { x: Math.floor(((clientX - r.left) / r.width * BOARD - OFFSET) / CELL), y: Math.floor(((clientY - r.top) / r.height * BOARD - OFFSET) / CELL) };
};
export interface BoardOptions { selected?: string; hover?: Point; placing?: boolean; preview?: TurnResult; showPreview?: boolean; event?: BattleEvent; progress?: number; keyboard?: Point }
function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 5) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function line(c: CanvasRenderingContext2D, a: Point, b: Point) { c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
function arrow(c: CanvasRenderingContext2D, a: Point, b: Point, size = 7) {
  line(c, a, b); const angle = Math.atan2(b.y - a.y, b.x - a.x);
  c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - Math.cos(angle - .5) * size, b.y - Math.sin(angle - .5) * size); c.lineTo(b.x - Math.cos(angle + .5) * size, b.y - Math.sin(angle + .5) * size); c.closePath(); c.fill();
}
export function drawBoard(canvas: HTMLCanvasElement, s: GameState, options: BoardOptions = {}): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== BOARD * dpr) { canvas.width = BOARD * dpr; canvas.height = BOARD * dpr; }
  const c = canvas.getContext('2d')!; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, BOARD, BOARD);
  const glow = c.createRadialGradient(360, 345, 30, 360, 360, 450); glow.addColorStop(0, '#27352e'); glow.addColorStop(1, '#15201f'); c.fillStyle = glow; c.fillRect(0, 0, BOARD, BOARD);
  c.strokeStyle = '#a9b7a30b'; c.lineWidth = 1;
  for (let i = 0; i < 22; i++) { c.beginPath(); c.ellipse(365, 365, 200 + i * 22, 110 + i * 20, -.5, 0, Math.PI * 2); c.stroke(); }
  // Deterministic dust and ground markings, never gameplay RNG.
  for (let i = 0; i < 190; i++) { const x = (i * 137.51) % BOARD, y = (i * 89.33 + 19) % BOARD; c.fillStyle = i % 3 ? '#b0ac8712' : '#d9cf9820'; c.fillRect(x, y, 2, 2); }
  c.fillStyle = '#a7b1a3'; c.font = '11px monospace'; c.textAlign = 'left'; c.fillText('FIELD / 07 × 07', 30, 36); c.fillStyle = '#677b73'; c.fillText(`WIND  ↘  ${s.encounter === 5 ? 'HIGH' : 'NE'}`, 30, 53);
  c.textAlign = 'right'; c.fillText('북 N ↑', 688, 36); c.fillText('외곽 전장', 688, 53);
  // Mobile city chassis.
  c.fillStyle = '#091312'; rounded(c, OFFSET - 13, OFFSET - 10, CELL * 7 + 26, CELL * 7 + 31, 12); c.fill();
  c.fillStyle = '#4b5345'; for (const x of [OFFSET + 18, OFFSET + CELL * 7 - 38]) for (let y = OFFSET + 14; y < OFFSET + CELL * 7; y += 34) { rounded(c, x - 34, y, 24, 22, 3); c.fill(); }
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const px = OFFSET + x * CELL, py = OFFSET + y * CELL;
    c.fillStyle = (x + y) % 2 ? '#26332e' : '#293630'; c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    c.strokeStyle = '#6d7a5430'; c.strokeRect(px + .5, py + .5, CELL, CELL);
    c.fillStyle = '#74826832'; c.fillRect(px + 5, py + 5, 2, 2); c.fillRect(px + CELL - 7, py + CELL - 7, 2, 2);
  }
  c.font = '10px monospace'; c.fillStyle = '#a2ac92'; c.textAlign = 'center';
  for (let i = 0; i < 7; i++) { c.fillText(String.fromCharCode(65 + i), OFFSET + i * CELL + 32, OFFSET + 7 * CELL + 24); c.fillText(`${i + 1}`, OFFSET - 21, OFFSET + i * CELL + 36); }
  // Actual component adjacency lines (jammed parts excluded).
  const nets = networks(s.parts);
  for (const n of nets) for (const p of s.parts.filter(p => n.members.includes(p.id))) for (const q of s.parts.filter(q => n.members.includes(q.id))) {
    if (q.id <= p.id || Math.abs(q.x - p.x) + Math.abs(q.y - p.y) !== 1) continue;
    c.strokeStyle = n.hasGenerator ? '#d6b96370' : '#83928c50'; c.lineWidth = 5; c.setLineDash(n.hasGenerator ? [] : [3, 4]); line(c, center(p), center(q));
  } c.setLineDash([]);
  const selected = s.parts.find(p => p.id === options.selected);
  if (selected && PARTS[selected.kind].range > 0) {
    c.fillStyle = '#90d9cc19';
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const valid = selected.kind === 'cannon' ? inFiringLine(selected, { x, y }) : Math.abs(x - selected.x) + Math.abs(y - selected.y) <= PARTS[selected.kind].range;
      if (valid) c.fillRect(OFFSET + x * CELL + 2, OFFSET + y * CELL + 2, CELL - 4, CELL - 4);
    }
  }
  // Dashed hostile telegraphs use the exact same ray builder as execution.
  for (const e of (options.showPreview && options.preview ? options.preview.aimedEnemies : s.enemies)) {
    for (const ray of attackRays(e)) {
      if (!ray.length) continue;
      const first = ray.find(pos => s.parts.some(p => p.x === pos.x && p.y === pos.y));
      const end = center(first ?? ray[ray.length - 1]); const start = center(e);
      c.strokeStyle = e.intent.kind === 'jam' ? '#c5a2d1' : '#ed956f'; c.fillStyle = c.strokeStyle; c.lineWidth = 1.6; c.setLineDash(e.intent.kind === 'jam' ? [2, 5] : [8, 5]);
      const startOffset = e.y === -1 || e.y === 7 ? { x: center(ray[0]).x, y: start.y } : { x: start.x, y: center(ray[0]).y };
      arrow(c, startOffset, end, 8); c.setLineDash([]);
      if (first) { c.strokeStyle = '#ed956f90'; c.strokeRect(OFFSET + first.x * CELL + 3, OFFSET + first.y * CELL + 3, CELL - 6, CELL - 6); }
    }
  }
  for (const d of s.debris) { const p = center(d); c.fillStyle = '#dbb474'; c.font = '20px monospace'; c.fillText('⛶', p.x, p.y + 4); c.font = '10px monospace'; c.fillText(`+${d.amount}`, p.x, p.y + 20); }
  for (const p of s.parts) drawPart(c, p, options.selected === p.id, options.preview?.status[p.id]?.active === false);
  for (const e of s.enemies) {
    const p = center(e); c.save(); c.translate(p.x, p.y);
    c.fillStyle = '#101b19'; c.strokeStyle = e.kind === 'boss' ? '#e3bd79' : '#c6846e'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -23); c.lineTo(25, -9); c.lineTo(21, 16); c.lineTo(0, 24); c.lineTo(-21, 16); c.lineTo(-25, -9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = e.kind === 'boss' ? '#e3bd79' : '#e1a48a'; c.font = 'bold 27px sans-serif'; c.fillText(ENEMIES[e.kind].glyph, 0, 9);
    c.fillStyle = '#29342c'; c.fillRect(-23, 29, 46, 3); c.fillStyle = '#d28d77'; c.fillRect(-23, 29, 46 * e.hp / e.maxHp, 3);
    c.font = '10px monospace'; c.fillStyle = '#eed3ba'; c.fillText(`${Math.max(0, e.hp)} / ${e.maxHp}`, 0, -30); c.restore();
  }
  const cursor = options.hover ?? options.keyboard;
  if (cursor && cursor.x >= 0 && cursor.x < 7 && cursor.y >= 0 && cursor.y < 7) {
    c.strokeStyle = options.placing ? '#e7cc86' : '#e5eed9'; c.lineWidth = 2; c.setLineDash([5, 3]); c.strokeRect(OFFSET + cursor.x * CELL + 4, OFFSET + cursor.y * CELL + 4, CELL - 8, CELL - 8); c.setLineDash([]);
    if (options.placing) { c.fillStyle = '#e7cc8624'; c.fillRect(OFFSET + cursor.x * CELL + 4, OFFSET + cursor.y * CELL + 4, CELL - 8, CELL - 8); }
  }
  if (options.event?.at) {
    const e = options.event, p = center(e.at!); const t = options.progress ?? 0.5;
    const colors = { hit: '#f0a17b', fire: '#ffe8a6', power: '#a2e5d3', destroy: '#f46e56', cool: '#9dd8ff', repair: '#b8e892', salvage: '#e6c395', move: '#d4b5ec', info: '#ddd' };
    c.strokeStyle = colors[e.kind]; c.fillStyle = colors[e.kind]; c.lineWidth = 3;
    if (e.kind === 'fire' && e.to) { c.shadowBlur = 14; c.shadowColor = colors.fire; line(c, p, center(e.to)); c.shadowBlur = 0; }
    else if (e.kind === 'destroy') { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.fillRect(p.x + Math.cos(a) * 38 * t, p.y + Math.sin(a) * 38 * t, 5, 5); } }
    else if (e.kind === 'power') { c.strokeRect(p.x - 27 - t * 5, p.y - 27 - t * 5, 54 + t * 10, 54 + t * 10); }
    else { c.beginPath(); c.arc(p.x, p.y, 16 + t * 32, 0, Math.PI * 2); c.stroke(); }
    if (e.amount) { c.font = 'bold 21px monospace'; c.fillText(`${e.kind === 'hit' ? '−' : '+'}${Math.abs(e.amount)}`, p.x, p.y - 32 - t * 18); }
  }
  c.textAlign = 'center'; c.fillStyle = '#7b8d7f'; c.font = '10px monospace'; c.fillText('이동도시 061  /  마지막 새벽을 향하여', 360, 680);
}
function drawPart(c: CanvasRenderingContext2D, p: Part, selected: boolean, inactive: boolean) {
  const d = PARTS[p.kind], q = center(p); c.save(); c.translate(q.x, q.y);
  c.fillStyle = '#09131090'; rounded(c, -25, -21, 52, 51, 5); c.fill();
  c.fillStyle = selected ? '#425449' : '#35453c'; c.strokeStyle = selected ? '#e7d296' : '#6c7c6355'; c.lineWidth = selected ? 2 : 1;
  rounded(c, -26, -26, 52, 49, 5); c.fill(); c.stroke();
  c.strokeStyle = d.color; c.fillStyle = d.color; c.lineWidth = 2;
  if (p.kind === 'core') {
    c.fillStyle = '#6a674a'; c.beginPath(); c.moveTo(-20, 9); c.lineTo(-20, -8); c.lineTo(0, -23); c.lineTo(20, -8); c.lineTo(20, 9); c.lineTo(0, 20); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#f5d993'; c.beginPath(); c.moveTo(0, -16); c.lineTo(13, -7); c.lineTo(0, 2); c.lineTo(-13, -7); c.closePath(); c.fill(); c.fillRect(-2, 3, 4, 11);
  } else if (p.kind === 'cannon') {
    c.save(); c.rotate(p.dir * Math.PI / 2); c.fillStyle = '#577e71'; rounded(c, -15, -10, 30, 26, 6); c.fill(); c.stroke(); c.fillStyle = '#a3cdb6'; c.fillRect(-5, -27, 10, 29); c.fillStyle = '#254135'; c.fillRect(-2, -28, 4, 8); c.beginPath(); c.arc(0, 5, 6, 0, Math.PI * 2); c.fill(); c.restore();
  } else if (p.kind === 'generator') {
    c.fillStyle = '#aa9456'; rounded(c, -17, -18, 34, 34, 4); c.fill(); c.stroke(); c.fillStyle = '#ddcd8d'; for (let i = 0; i < 4; i++) c.fillRect(-12, -13 + i * 7, 24, 3); c.fillStyle = '#413e26'; c.font = 'bold 32px sans-serif'; c.fillText('ϟ', 0, 14);
  } else if (p.kind === 'shield') {
    c.fillStyle = '#7b8a76'; c.beginPath(); c.moveTo(-20, -16); c.lineTo(20, -16); c.lineTo(17, 10); c.lineTo(0, 21); c.lineTo(-17, 10); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = '#d5dec2'; line(c, { x: -14, y: -8 }, { x: 14, y: -8 }); line(c, { x: 0, y: -13 }, { x: 0, y: 11 });
  } else if (p.kind === 'capacitor') {
    for (let i = -1; i <= 1; i++) { c.fillStyle = '#497f76'; rounded(c, i * 13 - 5, -18, 10, 34, 3); c.fill(); c.stroke(); c.fillStyle = '#a8e2c9'; c.fillRect(i * 13 - 3, 10 - p.charge * 3, 6, 4 + p.charge * 3); }
  } else if (p.kind === 'cooler') {
    c.fillStyle = '#526b69'; c.beginPath(); c.arc(0, -2, 19, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#a8cdd2'; for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2 + .4); c.fillRect(-3, -17, 8, 13); c.restore(); } c.fillStyle = '#273e38'; c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill();
  } else { c.fillStyle = '#496051'; rounded(c, -19, -18, 38, 35, 4); c.fill(); c.stroke(); c.fillStyle = d.color; c.font = 'bold 30px sans-serif'; c.save(); if (p.kind === 'tractor') c.rotate((p.dir - 1) * Math.PI / 2); c.fillText(d.glyph, 0, 10); c.restore(); }
  // Durability and heat always remain visible on the tile.
  c.fillStyle = '#12251d'; c.fillRect(-22, 20, 44, 4); c.fillStyle = p.hp / d.hp < .35 ? '#ec9d77' : '#b5c79d'; c.fillRect(-22, 20, 44 * p.hp / d.hp, 4);
  c.font = '8px monospace'; c.fillStyle = '#e4edcf'; c.textAlign = 'left'; c.fillText(`${p.hp}`, -22, 16);
  c.textAlign = 'right'; c.fillStyle = p.heat >= d.maxHeat ? '#ffac87' : '#a7c4bc'; c.fillText(`H${p.heat}`, 23, -17);
  if (PARTS[p.kind].power) { c.font = '8px monospace'; c.fillStyle = inactive ? '#c9a89c' : '#b9d4b6'; c.fillText(`${inactive ? 'Ⅱ' : 'ϟ'}${p.priority}`, 22, 16); }
  if (p.jammed) { c.strokeStyle = '#d0a5dc'; c.lineWidth = 2; c.setLineDash([3, 3]); c.strokeRect(-24, -24, 48, 48); c.setLineDash([]); c.fillStyle = '#efcaf8'; c.font = 'bold 18px sans-serif'; c.fillText('×', 22, 1); }
  if (selected) { c.fillStyle = '#eed59a'; c.font = '10px sans-serif'; c.textAlign = 'center'; c.fillText(DIR_NAMES[p.dir].slice(-1), 0, -30); }
  c.restore();
}
