import type { EnemyKind, PartDef, PartKind, RelicId } from './types';

const base = { power: 0, production: 0, storage: 0, range: 0, damage: 0, heat: 0, maxHeat: 8, amount: 0, salvageCost: 0 };
export const PARTS: Record<PartKind, PartDef> = {
  core: { ...base, name: '도시 핵', glyph: '◆', cost: 0, hp: 36, color: '#eed59a', description: '마지막 정착지의 심장. 전력을 전달하지만 생산하지 않습니다. 파괴되면 여정이 끝납니다.' },
  generator: { ...base, name: '발전기', glyph: 'ϟ', cost: 9, hp: 12, production: 3, color: '#e4bf69', description: '연결망에 매 턴 전력 3 생산. 직교 인접한 부품은 전력을 공유합니다.' },
  cannon: { ...base, name: '대포', glyph: '↟', cost: 10, hp: 11, power: 4, range: 9, damage: 5, heat: 3, color: '#92c9bd', description: '지정 방향의 가장 가까운 적에게 피해 5. 아군을 관통. 열 8 이상이면 정지하며 발사 시 열 +3.' },
  shield: { ...base, name: '방벽', glyph: '▰', cost: 7, hp: 22, color: '#b6c7bc', description: '공격선의 맨 앞에서 피해를 받아냅니다. 적의 공격은 첫 부품에서 멈춥니다. 폭풍 유리로 피격을 전력으로 바꿉니다.' },
  capacitor: { ...base, name: '축전기', glyph: '▥', cost: 7, hp: 10, storage: 8, color: '#7bc8cb', description: '연결망의 남은 전력을 8까지 저장. 방벽 피격 발전은 이곳에 먼저 충전되어 같은 턴 대포를 깨웁니다.' },
  cooler: { ...base, name: '냉각기', glyph: '✣', cost: 7, hp: 10, power: 1, range: 1, amount: 3, color: '#97bbd7', description: '직교 인접한 부품의 열을 각각 3 낮춥니다. 모든 부품은 턴 종료 시 자연 냉각 1.' },
  tractor: { ...base, name: '견인기', glyph: '»', cost: 8, hp: 10, power: 1, range: 9, amount: 1, color: '#c4abd7', description: '가장 가까운 외곽 적을 화살표 방향으로 1칸 이동. 외곽 테두리 안에서만 이동하며 도시 안·적 중복 위치는 불가.' },
  repair: { ...base, name: '수리소', glyph: '+', cost: 8, hp: 10, power: 1, range: 1, amount: 3, salvageCost: 1, color: '#b5ce9e', description: '고철 1을 써서 직교 인접한 가장 손상된 부품의 내구도 3 회복. 대상이 없으면 자원을 쓰지 않습니다.' },
  salvager: { ...base, name: '회수기', glyph: '⌁', cost: 6, hp: 10, power: 1, range: 4, amount: 3, color: '#d0aa83', description: '맨해튼 거리 4 이내의 잔해를 최대 3더미 회수. 전투 승리 시 남은 잔해의 절반만 자동 회수합니다.' },
};
export const BUILDABLE = Object.keys(PARTS).filter(k => k !== 'core') as PartKind[];
export const DIR_NAMES = ['북 ↑', '동 →', '남 ↓', '서 ←'];
export const RELICS: Record<RelicId, { name: string; glyph: string; description: string; timing: string; limit: number }> = {
  stormglass: { name: '폭풍 유리', glyph: '◇', description: '방벽이 피격 후 생존하면 발전기가 연결된 망에 전력 +5. 축전기부터 채웁니다.', timing: '적 공격 직후 · 턴당 2회 · 유물 피해는 재발동 불가', limit: 2 },
  thermal: { name: '서리 화약', glyph: '❋', description: '냉각기가 제거한 열을 인접 대포의 다음 발사 추가 피해로 전환. 대포당 최대 +4.', timing: '냉각 단계 · 턴당 총 6피해 적립 · 자연 냉각 제외', limit: 6 },
  remains: { name: '귀환 표식', glyph: '✧', description: '파괴된 아군 부품 자리에 고철 3 잔해를 남깁니다.', timing: '파괴 직후 · 턴당 3개 · 도시 핵 제외', limit: 3 },
  overcharge: { name: '불안정 심장', glyph: '◈', description: '턴 시작 연결망 저장 전력 3당 대포 피해 +1 (최대 +3). 피격 시 해당 연결망 전력 2 손실.', timing: '공격 단계 · 각 대포 1회 / 피격 손실 턴당 3회', limit: 3 },
  grounding: { name: '접지 나침반', glyph: '⊙', description: '턴마다 첫 연결 방해를 접지하고 해당 연결망에 전력 +2를 만듭니다.', timing: '연결 방해 직후 · 턴당 1회 · 폭풍 유리 재발동 없음', limit: 1 },
  echo: { name: '잔향 피스톤', glyph: '◎', description: '견인에 성공한 첫 적에게 충격 피해 2. 적 위치가 바뀐 뒤 공격선이 다시 계산됩니다.', timing: '견인 직후 · 턴당 1회 · 추가 견인 없음', limit: 1 },
};
export const ENEMIES: Record<EnemyKind, { name: string; glyph: string; hp: number; damage: number; description: string }> = {
  lancer: { name: '바늘 보행자', glyph: '⋀', hp: 13, damage: 4, description: '하나의 직선으로 가장 앞의 부품을 관통 시도합니다.' },
  bomber: { name: '분진 고래', glyph: '◒', hp: 16, damage: 3, description: '중심과 양옆, 세 공격선을 동시에 포격합니다.' },
  jammer: { name: '단선 사냥꾼', glyph: '⋈', hp: 14, damage: 2, description: '피격 부품을 이번 턴 남은 단계와 다음 턴 전력망에서 분리합니다.' },
  charger: { name: '축뢰 순례자', glyph: '△', hp: 19, damage: 4, description: '홀수 턴에는 충전만, 짝수 턴에는 강화한 직선 공격을 합니다.' },
  boss: { name: '천둥의 문지기', glyph: '⬡', hp: 48, damage: 5, description: '1단계: 정면 3열 포격. 내구도 절반부터 측면 이동과 단선, 교차 공격을 반복합니다.' },
};
export const ENCOUNTERS = [
  { name: '유리 사구', sub: '처음으로 폭풍을 받아내다', kinds: ['lancer'] },
  { name: '끊어진 송전로', sub: '전선이 끊겨도 도시는 걷는다', kinds: ['jammer', 'lancer'] },
  { name: '분진 해협', sub: '세 갈래로 쏟아지는 재', kinds: ['bomber', 'lancer'] },
  { name: '침묵의 발전소', sub: '고요한 턴 뒤에 오는 천둥', kinds: ['charger', 'jammer'] },
  { name: '마지막 방파제', sub: '새벽 앞의 가장 긴 그림자', kinds: ['bomber', 'charger', 'lancer'] },
  { name: '폭풍의 눈', sub: '문지기를 넘어, 고요한 땅으로', kinds: ['boss'] },
] as const;
