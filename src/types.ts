export type Dir = 0 | 1 | 2 | 3;
export type PartKind = 'core' | 'generator' | 'cannon' | 'shield' | 'capacitor' | 'cooler' | 'tractor' | 'repair' | 'salvager';
export type RelicId = 'stormglass' | 'thermal' | 'remains' | 'overcharge' | 'grounding' | 'echo';
export type EnemyKind = 'lancer' | 'bomber' | 'jammer' | 'charger' | 'boss';
export type Phase = 'build' | 'plan' | 'reward' | 'route' | 'won' | 'lost';
export interface Point { x: number; y: number }
export interface Part extends Point { id: string; kind: PartKind; dir: Dir; hp: number; heat: number; charge: number; priority: number; jammed: number; bonus: number }
export interface Intent { kind: 'line' | 'area' | 'jam' | 'charge' | 'cross'; damage: number; label: string }
export interface Enemy extends Point { id: string; kind: EnemyKind; hp: number; maxHp: number; strength: number; intent: Intent; stage: 1 | 2 }
export interface Debris extends Point { amount: number }
export interface Reward { id: string; type: 'relic' | 'scrap' | 'repair'; title: string; description: string; relic?: RelicId; value: number }
export interface GameState {
  version: 1; seed: string; rng: number; phase: Phase; encounter: number; turn: number; nextId: number;
  parts: Part[]; enemies: Enemy[]; scrap: number; relics: RelicId[]; debris: Debris[];
  commands: number; rewards: Reward[]; route: 'shelter' | 'salvage'; routes: string[]; journal: string[];
}
export interface PartDef {
  name: string; glyph: string; cost: number; hp: number; power: number; production: number; storage: number;
  range: number; damage: number; heat: number; maxHeat: number; amount: number; salvageCost: number; description: string; color: string;
}
export interface Network {
  id: number; members: string[]; production: number; stored: number; capacity: number; hasGenerator: boolean;
}
export interface PowerReport { id: number; members: string[]; produced: number; initial: number; impact: number; consumed: number; stored: number; loss: number; capacity: number }
export type EventKind = 'power' | 'hit' | 'fire' | 'destroy' | 'move' | 'cool' | 'repair' | 'salvage' | 'info';
export interface BattleEvent { kind: EventKind; text: string; at?: Point; to?: Point; amount?: number }
export interface PartStatus { active: boolean; reason: string }
export interface TurnResult { state: GameState; events: BattleEvent[]; power: PowerReport[]; status: Record<string, PartStatus>; aimedEnemies: Enemy[] }
export type Command = { type: 'move'; id: string; x: number; y: number } | { type: 'rotate' | 'priority' | 'repair'; id: string };
