import './style.css';
import { command, placePart, sellPart, type ActionResult } from './actions';
import { chooseReward, chooseRoute, newGame } from './campaign';
import { resolveTurn } from './combat';
import { BUILDABLE, DIR_NAMES, ENCOUNTERS, ENEMIES, PARTS, RELICS } from './content';
import { at, canPlace } from './grid';
import { networks, priorityOrder } from './power';
import { loadLocal, saveLocal } from './save';
import { clone } from './state';
import { boardPoint, drawBoard } from './ui/board';
import type { BattleEvent, GameState, PartKind, Point, TurnResult } from './types';

const root = document.querySelector<HTMLDivElement>('#app')!;
let game = newGame('새벽-061');
let title = true, busy = false, selected = 'p3', building: PartKind | undefined, moving = false, help = false, restart = false, sound = false, showPreview = false;
let history: GameState[] = [], hover: Point | undefined, keyboard: Point = { x: 3, y: 3 }, forecast: TurnResult | undefined, lastResult: TurnResult | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const coord = (p: Point) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
const coreHp = () => game.parts.find(p => p.kind === 'core')?.hp ?? 0;
const editable = () => !busy && (game.phase === 'build' || (game.phase === 'plan' && game.commands > 0));
const button = (action: string, label: string, cls = '', disabled = false, extra = '') => `<button type="button" data-action="${action}" class="${cls}" ${disabled ? 'disabled' : ''} ${extra}>${label}</button>`;
function toast(text: string) {
  clearTimeout(toastTimer); let el = document.querySelector<HTMLDivElement>('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = text; el.classList.add('visible'); toastTimer = setTimeout(() => el?.classList.remove('visible'), 4500);
}
function banner() { return `<header class="topbar"><a class="brand" href="#" data-action="home" aria-label="폭풍을 걷는 도시 시작 화면"><span class="brand-icon">◈</span><span>폭풍을 걷는 도시<small>STORMWALKER · CITY 061</small></span></a><div class="top-note"><span class="signal"></span> 이동도시 통신 정상 <span class="separator">/</span> ${title ? '항해 기록 001' : `SEED ${esc(game.seed)}`}</div><nav aria-label="게임 메뉴">${button('sound', sound ? '♪ 소리 켜짐' : '♪ 소리 꺼짐', 'text-button', busy)}${button('help', '? 지휘 안내', 'text-button', busy)}${!title ? button('save', '↓ 저장', 'text-button', busy || (game.phase === 'plan' && history.length > 0)) + button('load', '↗ 불러오기', 'text-button', busy) + button('restart', '↻ 새 여정', 'text-button', busy) : ''}</nav></header>`; }
function render() {
  const keepBoardFocus = document.activeElement?.id === 'board';
  root.classList.toggle('is-playing', !title);
  forecast = ['build', 'plan'].includes(game.phase) ? resolveTurn(game) : undefined;
  if (title) {
    root.innerHTML = `${banner()}<main class="landing"><section class="landing-copy"><p class="eyebrow">A SPATIAL STRATEGY ROGUELIKE</p><div class="edition">항해자에게 보내는 마지막 신호 <span>01 / 06</span></div><h1>폭풍을<br>걷는 도시<span class="title-dot">.</span></h1><p class="lead">폭풍을 막아내고.<br>그 힘으로, 다시 걸어라.</p><p class="intro">땅이 사라진 세계. 마지막 도시는 멈출 수 없습니다.<br>부품을 연결하고 공격을 받아내세요.<br>당신의 배치가, 도시의 반격이 됩니다.</p><div class="start-form"><label for="seed">항해 시드 <small>같은 시드, 같은 여정</small></label><input id="seed" maxlength="64" value="새벽-061" autocomplete="off" spellcheck="false"><div class="start-buttons">${button('start', '새 여정 시작 <span>↗</span>', 'primary')}${button('load', '저장된 여정 불러오기', 'secondary')}</div></div><div class="landing-facts"><span>7 × 7<br><b>당신만의 도시</b></span><span>6개 조우<br><b>새벽까지의 여정</b></span><span>2회 지휘<br><b>매 턴의 선택</b></span></div></section><section class="landing-art" aria-label="이동도시 미리보기"><div class="art-label"><span>설계도 061 — 새벽호</span><b>LIVE SCHEMATIC</b></div><canvas id="board" aria-label="7×7 도시 설계도"></canvas><div class="art-quote"><span>◇</span><p>“우리는 폭풍을 피하지 않는다.<br>폭풍으로 움직인다.”</p><small>도시 061, 초대 항해자의 기록</small></div></section></main><footer class="landing-footer"><span>오리지널 2D 전략 로그라이크</span><span>설치 없이 · 이 브라우저에 저장</span><span>폭풍 저편에도, 아침은 온다.</span></footer>${help ? helpDialog() : ''}`;
  } else {
    root.innerHTML = `${banner()}<main class="game-shell"><section class="journey-bar"><div><span class="eyebrow">THE LAST PILGRIMAGE</span><h1>${ENCOUNTERS[game.encounter].name} <span>${ENCOUNTERS[game.encounter].sub}</span></h1></div><ol class="route-progress" aria-label="캠페인 진행">${ENCOUNTERS.map((e, i) => `<li class="${i < game.encounter ? 'done' : i === game.encounter ? 'current' : ''}" title="${e.name}"><span>${i < game.encounter ? '✓' : i === 5 ? '◆' : String(i + 1).padStart(2, '0')}</span><small>${i === game.encounter ? '현재 위치' : i === 5 ? '폭풍의 눈' : ''}</small></li>`).join('')}</ol></section><section class="resources" aria-label="도시 현황"><div><span class="resource-icon core">◆</span><p>도시 핵 내구도<strong>${coreHp()} <small>/ 36</small></strong></p><div class="mini-meter"><i style="width:${coreHp() / 36 * 100}%"></i></div></div><div><span class="resource-icon">⛶</span><p>보유 고철<strong>${game.scrap} <small>SCRAP</small></strong></p></div><div><span class="resource-icon mint">ϟ</span><p>전력 생산 / 저장<strong>${networks(game.parts).reduce((n, net) => n + net.production, 0)} <small>/</small> ${game.parts.reduce((n, p) => n + p.charge, 0)} <small>EP</small></strong></p></div><div><span class="resource-icon mint">⌘</span><p>남은 지휘 행동<strong>${game.phase === 'build' ? '∞' : game.commands} <small>${game.phase === 'build' ? '정비 중 자유 배치' : '/ 2 ACTIONS'}</small></strong></p></div></section><div class="workspace"><aside class="left-panel"><section class="panel phase-panel"><p class="eyebrow">${busy ? 'EXECUTING' : game.phase === 'build' ? 'CITY WORKSHOP' : 'COMMAND DECK'}</p><div class="phase-heading"><h2>${busy ? '도시 가동 중' : game.phase === 'build' ? '도시 정비' : game.phase === 'plan' ? '다음 턴을 설계하세요' : '항해 기록'}</h2><span class="turn-badge">턴 ${String(game.turn).padStart(2, '0')}</span></div><p class="muted">${game.phase === 'build' ? '부품을 골라 빈 칸에 조립하세요. 정비 중 이동과 회전은 자유롭습니다.' : '예고된 공격을 읽고, 두 번의 지휘로 도시의 운명을 바꾸세요.'}</p><div class="steps"><span class="${!busy ? 'active' : ''}">01 예고</span><i>→</i><span class="${!busy ? 'active' : ''}">02 계획</span><i>→</i><span class="${busy ? 'active' : ''}">03 실행</span></div>${game.encounter === 0 ? `<div class="tutorial"><b>◇ 첫 번째 항해</b><p>기본 배치를 유지해 1턴을 실행해 보세요.</p><ol><li>방벽이 바늘 보행자를 막고</li><li>폭풍 유리가 전력 +5를 만들고</li><li>축전기에 충전한 전력으로</li><li>대포가 반격합니다.</li></ol></div>` : ''}</section><section class="panel enemy-panel"><div class="section-heading"><h2>적의 다음 행동</h2><span>${game.enemies.length} 신호</span></div>${game.enemies.length ? game.enemies.map(e => `<article class="enemy-card"><div class="enemy-title"><span class="enemy-glyph">${ENEMIES[e.kind].glyph}</span><div><h3>${ENEMIES[e.kind].name}</h3><small>${e.y === -1 ? `북 · ${String.fromCharCode(65 + e.x)}열` : e.y === 7 ? `남 · ${String.fromCharCode(65 + e.x)}열` : `${e.x === -1 ? '서' : '동'} · ${e.y + 1}행`}${e.kind === 'boss' ? ` / ${e.stage}단계` : ''}</small></div><b>${e.hp}<small> HP</small></b></div><p class="intent"><span>${e.intent.kind === 'charge' ? '△' : e.intent.kind === 'jam' ? '×' : '↳'}</span> ${esc(e.intent.label)}</p><div class="enemy-damage">${e.intent.kind === 'charge' ? '공격 없음 · 지금이 기회입니다' : `공격선마다 피해 ${e.intent.damage} · 첫 부품에서 멈춤`}</div></article>`).join('') : '<p class="muted">주변에서 적 신호가 사라졌습니다.</p>'}</section><section class="panel relic-panel"><div class="section-heading"><h2>도시의 유물</h2><span>${game.relics.length} / 6</span></div>${game.relics.map(id => `<details class="relic"><summary><span>${RELICS[id].glyph}</span>${RELICS[id].name}<i>+</i></summary><p>${RELICS[id].description}</p><small>${RELICS[id].timing}</small></details>`).join('')}</section></aside><section class="battle-panel"><div class="board-toolbar"><div><span class="signal"></span> 전술 지도 <small>GRID 07 × 07</small></div>${button('preview', showPreview ? '◉ 결과 예측 켜짐' : '◎ 결과 예측', showPreview ? 'preview-toggle on' : 'preview-toggle', busy || !forecast)}</div><div class="board-wrap"><canvas id="board" tabindex="0" aria-label="도시 격자. 방향키로 칸 이동, Enter로 선택 또는 배치. R 회전, M 이동, Escape 취소."></canvas>${phaseOverlay()}</div><div class="board-legend"><span><i class="dash"></i> 적 공격선</span><span><i class="wire"></i> 전력 연결</span><span>Ⅱ 작동 대기</span><span>H 열 · 숫자 내구도</span></div><div class="command-strip"><div><span class="mode-label">${building ? '조립 위치 선택' : moving ? '이동 위치 선택' : busy ? '실행 중 · 입력 잠금' : game.phase === 'build' ? '정비 단계' : '계획 단계'}</span><p id="board-hint">${building ? `${PARTS[building].name} · 빈 칸을 선택하세요 (Esc 취소)` : moving ? '이동할 빈 칸을 선택하세요 (Esc 취소)' : '부품을 선택해 정보를 확인하세요.'}</p></div>${button('cancel-tool', '선택 취소', 'text-button', busy || (!building && !moving))}</div><div class="turn-controls">${button('undo', '↶ 한 행동 취소', 'secondary', busy || !history.length)}${button('cancel-plan', '계획 전체 취소', 'text-button', busy || !history.length)}${button('execute', busy ? '<span class="spinner"></span> 도시 가동 중' : game.phase === 'build' ? '배치 완료 · 전투 진입 →' : `턴 ${game.turn} 실행 <span>→</span>`, 'primary execute', busy || !['build', 'plan'].includes(game.phase))}</div><p class="event-caption" id="event-caption" aria-live="polite">${showPreview && forecast ? `예측: 도시 핵 ${forecast.state.parts.find(p => p.kind === 'core')?.hp ?? 0} · 생존 적 ${forecast.state.enemies.length} · ${forecast.events.filter(e => e.kind === 'fire').length}회 반격` : '실행 전에는 계획을 취소할 수 있습니다. 실행한 턴은 되돌릴 수 없습니다.'}</p></section><aside class="right-panel">${inspector()}${powerPanel()}<section class="panel log-panel"><div class="section-heading"><h2>${showPreview ? '예측 기록' : '항해 기록'}</h2><span>${showPreview ? 'SIMULATION' : 'LOG'}</span></div><div class="logs">${(showPreview && forecast ? forecast.events.map(e => e.text).reverse() : game.journal).slice(0, 7).map((text, i) => `<p class="${i === 0 ? 'newest' : ''}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(text)}</p>`).join('')}</div></section></aside></div><section class="workshop"><div class="workshop-heading"><h2>조립 부품 <span>8종</span></h2><p>${game.phase === 'build' ? '부품 선택 → 빈 칸 클릭 · 이동 M · 회전 R · 취소 Esc' : '전투 중 조립·판매 불가 · 다음 정비 때 다시 이용할 수 있습니다'}</p></div><div class="part-shop">${BUILDABLE.map(kind => `<button data-action="buy" data-kind="${kind}" class="shop-card ${building === kind ? 'chosen' : ''}" ${busy || game.phase !== 'build' || game.scrap < PARTS[kind].cost ? 'disabled' : ''} title="${PARTS[kind].description}"><span class="shop-icon" style="color:${PARTS[kind].color}">${PARTS[kind].glyph}</span><span><b>${PARTS[kind].name}</b><small>${PARTS[kind].power ? `소비 ${PARTS[kind].power}` : PARTS[kind].production ? `생산 ${PARTS[kind].production}` : kind === 'capacitor' ? '저장 8' : '내구도 22'}</small></span><strong>${PARTS[kind].cost}<small>⛶</small></strong></button>`).join('')}</div></section><footer class="game-footer"><span>조우 ${game.encounter + 1} / 6 <i>·</i> ${game.routes.length ? game.routes.map(r => r === 'shelter' ? '방풍 터널' : '폐철 고원').join(' → ') : '새벽 항로'}</span><span>도시는 멈추지 않는다.</span><span>로컬 저장 · v1</span></footer></main>${help ? helpDialog() : ''}${restart ? restartDialog() : ''}`;
  }
  bindBoard(); redraw();
  if (keepBoardFocus && !help && !restart) document.querySelector<HTMLCanvasElement>('#board')?.focus();
  if (help || restart) document.querySelector<HTMLButtonElement>('.dialog button')?.focus();
}
function inspector(): string {
  const p = game.parts.find(p => p.id === selected); const d = p ? PARTS[p.kind] : building ? PARTS[building] : undefined;
  if (!d) return '<section class="panel inspector"><p class="eyebrow">MODULE INSPECTOR</p><h2>도시를 살펴보세요</h2><p class="muted">격자의 부품을 선택하면 내구도, 열, 전력 연결과 작동 사유를 확인할 수 있습니다.</p></section>';
  const n = p ? networks(game.parts).find(n => n.members.includes(p.id)) : undefined;
  const status = p ? forecast?.status[p.id] : undefined;
  return `<section class="panel inspector"><div class="section-heading"><p class="eyebrow">MODULE INSPECTOR</p><span>${p ? coord(p) : '조립 중'}</span></div><div class="inspect-title"><span style="color:${d.color}">${d.glyph}</span><div><h2>${d.name}</h2><small>${p ? `${DIR_NAMES[p.dir]} · ${n ? `연결망 ${n.id}` : '단선 상태'}` : `조립 비용: 고철 ${d.cost}`}</small></div>${p ? `<span class="tag">P${p.priority}</span>` : ''}</div><p class="description">${d.description}</p><div class="inspect-stats"><span>내구도<b>${p?.hp ?? d.hp}<small> / ${d.hp}</small></b></span><span>열<b>${p?.heat ?? 0}<small> / ${d.maxHeat}</small></b></span><span>전력 소비<b>${d.power}<small> EP</small></b></span><span>${p?.kind === 'capacitor' ? '저장 전력' : '사거리'}<b>${p?.kind === 'capacitor' ? p.charge : d.range}<small>${p?.kind === 'capacitor' ? ' / 8' : '칸'}</small></b></span></div>${p ? `<div class="operation ${status?.active ? 'ready' : 'idle'}"><b>${status?.active ? '● 예상 작동' : 'Ⅱ 예상 대기'}</b><span>${esc(status?.reason ?? '다음 전투에서 계산')}</span></div><div class="inspector-actions">${button('move', '↔ 이동 [M]', moving ? 'selected' : '', !editable() || p.kind === 'core')}${button('rotate', '↻ 회전 [R]', '', !editable())}${button('priority', `ϟ 우선순위 ${p.priority}`, '', !editable() || !d.power)}${button('repair', '+ 긴급 수리', '', !editable() || game.scrap < 3 || p.hp === d.hp)}</div><div class="inspect-foot"><span>긴급 수리: 고철 3 → 내구도 +6</span>${button('sell', `판매 +${Math.floor(d.cost * .6)} ⛶`, 'text-button danger', busy || game.phase !== 'build' || p.kind === 'core')}</div>` : '<div class="operation ready"><b>+ 조립 준비</b><span>격자 안의 빈 칸을 클릭하세요.</span></div>'}</section>`;
}
function powerPanel() {
  const nets = networks(game.parts); const reports = showPreview ? forecast?.power : lastResult?.power;
  return `<section class="panel power-panel"><div class="section-heading"><h2>전력 연결망</h2><span>${nets.length} NETWORK</span></div>${nets.map(n => `<div class="network"><div class="network-head"><b><i class="${n.hasGenerator ? 'live' : ''}"></i> 연결망 ${n.id}</b><span>${n.members.length} 부품</span></div><div class="power-numbers"><span>생산 <b>+${n.production}</b></span><span>저장 <b>${n.stored}/${n.capacity}</b></span><span>소비 요구 <b>${game.parts.filter(p => n.members.includes(p.id)).reduce((v, p) => v + PARTS[p.kind].power, 0)}</b></span></div><p class="priorities">${priorityOrder(game.parts.filter(p => n.members.includes(p.id) && PARTS[p.kind].power)).map(p => `P${p.priority} ${PARTS[p.kind].name}(${coord(p)})`).join(' → ') || '소비 부품 없음'}</p>${!n.hasGenerator ? '<small class="warning">발전기 없음 · 저장 전력만 사용 가능</small>' : ''}</div>`).join('')}${game.parts.some(p => p.jammed) ? '<p class="warning">× 단선 부품은 전력망에서 제외됩니다.</p>' : ''}${reports?.length ? `<details class="power-ledger" open><summary>${showPreview ? '이번 턴 예상 수지' : '지난 실행 수지'}</summary>${reports.map(n => `<p>시작망 ${n.id}: 저장 ${n.initial} + 생산 ${n.produced} + 피격 ${n.impact}<br><b>= 소비 ${n.consumed} + 축전 ${n.stored} + 손실 ${n.loss}</b></p>`).join('')}</details>` : '<p class="fine-print">생산 + 이전 저장 + 피격 발전<br>= 소비 + 다음 저장 + 손실</p>'}</section>`;
}
function phaseOverlay() {
  if (game.phase === 'reward') return `<div class="board-overlay"><span class="reward-emblem">✧</span><p class="eyebrow">ENCOUNTER COMPLETE</p><h2>도시는 한 걸음 더.</h2><p>잔해 속에서 발견한 세 가지 기회.<br>하나를 골라 다음 정박지로 이동하세요.</p><div class="reward-options">${game.rewards.map((r, i) => `<button data-action="reward" data-id="${esc(r.id)}"><span>0${i + 1}</span><div><b>${esc(r.title)}</b><small>${esc(r.description)}</small></div><i>↗</i></button>`).join('')}</div></div>`;
  if (game.phase === 'route') return `<div class="board-overlay"><span class="reward-emblem">⤨</span><p class="eyebrow">CHOOSE YOUR PASSAGE</p><h2>두 갈래의 흔적</h2><p>항로는 다음 경로 선택까지 유지됩니다.</p><div class="reward-options"><button data-action="route" data-route="shelter"><span>◠</span><div><b>방풍 터널</b><small>모든 부품 내구도 +5. 일반 적의 기본 내구도.<br>상처를 정비하고 안전하게 전진합니다.</small></div><i>↗</i></button><button data-action="route" data-route="salvage"><span>⛰</span><div><b>폐철 고원</b><small>즉시 고철 +14 / 전투 승리 고철 +3.<br>일반 적 내구도 +3. 더 큰 도시를 위한 모험.</small></div><i>↗</i></button></div></div>`;
  if (game.phase === 'won' || game.phase === 'lost') return `<div class="board-overlay ending ${game.phase}"><span class="reward-emblem">${game.phase === 'won' ? '☀' : '◇'}</span><p class="eyebrow">${game.phase === 'won' ? 'A NEW DAWN' : 'THE SIGNAL FADES'}</p><h2>${game.phase === 'won' ? '그리고, 새벽이 왔다.' : '도시가 걸음을 멈췄다.'}</h2><p>${game.phase === 'won' ? '여섯 번의 폭풍 너머, 고요한 땅.<br>당신의 도시가 다음 세계의 시작입니다.' : '도시 핵이 파괴되었습니다.<br>다음 항해자는 당신의 기록에서 길을 찾을 것입니다.'}</p><div class="end-stats"><span>도달 조우<b>${game.encounter + 1} / 6</b></span><span>유물 수<b>${game.relics.length}</b></span><span>남은 고철<b>${game.scrap}</b></span></div>${button('again', '같은 시드로 다시 걷기 →', 'primary')}${button('new-seed', '새로운 항해 설계', 'secondary')}</div>`;
  return '';
}
function helpDialog() { return `<div class="modal-backdrop"><section class="dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="section-heading"><p class="eyebrow">FIELD MANUAL 061</p>${button('help', '닫기 ×', 'text-button')}</div><h2 id="help-title">폭풍을 읽는 법</h2><p class="lead-small">공격을 받아낼 자리, 반격할 연결을 만드세요.</p><div class="help-grid"><article><b>01. 도시를 조립하세요</b><p>정비 중 부품을 구입한 뒤 빈 칸을 클릭합니다. 선택한 부품은 이동·회전·판매할 수 있습니다. 도시 핵은 고정입니다.</p></article><article><b>02. 선을 읽으세요</b><p>도시 좌표는 A–G열, 1–7행입니다. 외곽 좌표 −1 또는 7에서 적이 안쪽으로 공격합니다. 점선은 첫 부품에서 멈추며 대포는 아군을 관통합니다.</p></article><article><b>03. 두 번 지휘하세요</b><p>전투 중 인접 이동, 회전, 소비 우선순위 변경, 긴급 수리 중 두 번 행동합니다. P1이 가장 높습니다. 실행 전 취소할 수 있습니다.</p></article><article><b>04. 폭풍으로 충전하세요</b><p>직교 연결마다 발전기가 전력을 생산합니다. 방벽 피격은 폭풍 유리로 전력을 만듭니다. 축전기가 먼저 충전되고 대포가 같은 턴 반격합니다.</p></article><article><b>05. 정확한 미래를 보세요</b><p>결과 예측은 실제 전투와 같은 규칙입니다. 견인 후 공격선도 반영합니다. 발전 → 견인 → 적 공격 → 아군 포격 → 냉각·수리·회수 → 저장 순서입니다.</p></article><article><b>06. 도시를 이어가세요</b><p>6개 조우와 두 번의 경로 선택을 돌파하세요. 저장은 정비·보상·경로·종료 또는 계획하지 않은 턴 경계에서 가능합니다. 이 브라우저의 한 슬롯을 사용합니다.</p></article></div><p class="help-note">전력은 생산·축전 부품 위치에 남습니다. 연결이 끊어지면 공유도 끊어지고, 파괴된 전원에 남은 전력은 손실됩니다. 전력 부족 시 P1 → P2 → P3 순으로 배정합니다. 유물의 조건·한도는 왼쪽 유물을 펼쳐 확인하세요.</p><p class="help-note">키보드: 격자에 Tab으로 진입 → 방향키 → Enter로 선택/배치 · R 회전 · M 이동 · Escape 취소. 터치는 클릭과 동일합니다.</p></section></div>`; }
function restartDialog() { return `<div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="restart-title"><p class="eyebrow">A NEW JOURNEY</p><h2 id="restart-title">새 여정을 시작할까요?</h2><p>저장하지 않은 현재 진행은 사라집니다.<br>기존 저장 슬롯은 직접 저장하기 전까지 유지됩니다.</p><div class="dialog-actions">${button('dismiss-restart', '계속 항해하기', 'secondary')}${button('new-seed', '새 여정으로', 'primary')}</div></section></div>`; }
function redraw(event?: BattleEvent, progress?: number) {
  const canvas = document.querySelector<HTMLCanvasElement>('#board');
  if (canvas) drawBoard(canvas, game, { selected: title ? undefined : selected, hover, keyboard: !title && document.activeElement === canvas ? keyboard : undefined, placing: !!building || moving, preview: forecast, showPreview, event, progress });
}
function accept(result: ActionResult, record = false) {
  if (result.error) { toast(result.error); return; }
  if (record && game.phase === 'plan') history.push(clone(game));
  game = result.state; render();
}
function selectCell(pos: Point) {
  if (busy || title || !canPlace([], pos)) return;
  keyboard = pos;
  if (building) {
    const result = placePart(game, building, pos.x, pos.y);
    if (!result.error) { selected = result.state.parts.at(-1)!.id; building = undefined; }
    accept(result); return;
  }
  if (moving) {
    const result = command(game, { type: 'move', id: selected, ...pos });
    if (!result.error) moving = false; accept(result, true); return;
  }
  const p = at(game.parts, pos); selected = p?.id ?? ''; render();
}
function bindBoard() {
  const canvas = document.querySelector<HTMLCanvasElement>('#board'); if (!canvas || title) return;
  canvas.addEventListener('click', e => selectCell(boardPoint(canvas, e.clientX, e.clientY)));
  canvas.addEventListener('pointermove', e => { hover = boardPoint(canvas, e.clientX, e.clientY); if (!busy) redraw(); });
  canvas.addEventListener('pointerleave', () => { hover = undefined; if (!busy) redraw(); });
  canvas.addEventListener('focus', () => redraw());
  canvas.addEventListener('keydown', e => {
    if (busy) return;
    const dirs: Record<string, Point> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
    if (dirs[e.key]) { e.preventDefault(); keyboard = { x: Math.max(0, Math.min(6, keyboard.x + dirs[e.key].x)), y: Math.max(0, Math.min(6, keyboard.y + dirs[e.key].y)) }; hover = undefined; redraw(); const hint = document.querySelector('#board-hint')!; hint.textContent = `${coord(keyboard)} · ${at(game.parts, keyboard) ? PARTS[at(game.parts, keyboard)!.kind].name : '빈 칸'}`; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCell(keyboard); document.querySelector<HTMLCanvasElement>('#board')?.focus(); }
  });
}
let audio: AudioContext | undefined;
function tone(event: BattleEvent) {
  if (!sound) return;
  try { audio ??= new AudioContext(); void audio.resume(); const o = audio.createOscillator(), g = audio.createGain(); o.connect(g); g.connect(audio.destination); o.type = event.kind === 'hit' ? 'triangle' : 'sine'; o.frequency.value = { power: 540, hit: 100, fire: 180, destroy: 65, move: 240, cool: 740, repair: 420, salvage: 620, info: 320 }[event.kind]; g.gain.setValueAtTime(.035, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .12); o.start(); o.stop(audio.currentTime + .13); } catch { /* Sound is optional; rules never depend on audio support. */ }
}
async function execute() {
  if (busy || !['build', 'plan'].includes(game.phase)) return;
  if (game.phase === 'build') { game.phase = 'plan'; building = undefined; moving = false; history = []; render(); toast('적 의도를 확인하고 지휘하세요. 준비되면 턴을 실행합니다.'); return; }
  busy = true; building = undefined; moving = false; history = [];
  const result = resolveTurn(game); render();
  try {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const event of result.events) {
      document.querySelector('#event-caption')!.textContent = event.text; tone(event);
      if (reduced) { redraw(event, 1); continue; }
      await new Promise<void>(done => { const start = performance.now(); function tick(now: number) { const t = Math.min(1, (now - start) / 160); redraw(event, t); if (t < 1) requestAnimationFrame(tick); else done(); } requestAnimationFrame(tick); });
    }
    game = result.state; lastResult = result;
  } finally { busy = false; render(); }
}
root.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement | HTMLAnchorElement>('[data-action]'); if (!target || target.hasAttribute('disabled')) return;
  event.preventDefault(); const action = target.dataset.action;
  if (busy) return;
  if (action === 'start') { const seed = document.querySelector<HTMLInputElement>('#seed')!.value; game = newGame(seed); title = false; selected = 'p3'; history = []; lastResult = undefined; render(); }
  else if (action === 'load') { const loaded = loadLocal(); if (loaded.state) { game = loaded.state; title = false; history = []; lastResult = undefined; building = undefined; moving = false; selected = game.parts.find(p => p.kind === 'cannon')?.id ?? 'p1'; render(); toast('저장된 여정을 불러왔습니다.'); } else toast(loaded.error!); }
  else if (action === 'save') { toast(saveLocal(game) ?? '현재 턴 경계를 이 브라우저에 저장했습니다.'); }
  else if (action === 'sound') { sound = !sound; if (sound) tone({ kind: 'power', text: '' }); render(); }
  else if (action === 'help') { help = !help; render(); }
  else if (action === 'restart' || action === 'home') { if (!title) { restart = true; render(); } }
  else if (action === 'dismiss-restart') { restart = false; render(); }
  else if (action === 'new-seed') { title = true; restart = false; game = newGame('새벽-061'); history = []; selected = 'p3'; building = undefined; moving = false; lastResult = undefined; showPreview = false; render(); }
  else if (action === 'again') { game = newGame(game.seed); selected = 'p3'; history = []; building = undefined; moving = false; lastResult = undefined; render(); }
  else if (action === 'buy') { building = target.dataset.kind as PartKind; moving = false; selected = ''; render(); }
  else if (action === 'cancel-tool') { building = undefined; moving = false; render(); }
  else if (action === 'move') { moving = !moving; building = undefined; render(); }
  else if (action === 'rotate' || action === 'priority' || action === 'repair') accept(command(game, { type: action, id: selected }), true);
  else if (action === 'sell') { const result = sellPart(game, selected); if (!result.error) selected = ''; accept(result); }
  else if (action === 'undo') { if (history.length) { game = history.pop()!; moving = false; render(); } }
  else if (action === 'cancel-plan') { if (history.length) { game = history[0]; history = []; moving = false; render(); } }
  else if (action === 'execute') void execute();
  else if (action === 'preview') { showPreview = !showPreview; render(); }
  else if (action === 'reward') { game = chooseReward(game, target.dataset.id!); lastResult = undefined; showPreview = false; render(); }
  else if (action === 'route') { game = chooseRoute(game, target.dataset.route as 'shelter' | 'salvage'); render(); }
});
document.addEventListener('keydown', e => {
  if (busy || (e.target as HTMLElement).matches('input,textarea,select')) return;
  if ((help || restart) && e.key === 'Tab') {
    const focusable = [...document.querySelectorAll<HTMLElement>('.dialog button:not(:disabled), .dialog a, .dialog input')];
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    return;
  }
  if (e.key === 'Escape') { help = false; restart = false; moving = false; building = undefined; render(); }
  if (help || restart || title) return;
  if (e.key.toLowerCase() === 'r' && selected && editable()) accept(command(game, { type: 'rotate', id: selected }), true);
  if (e.key.toLowerCase() === 'm' && selected && editable() && game.parts.find(p => p.id === selected)?.kind !== 'core') { moving = !moving; building = undefined; render(); }
});
window.addEventListener('resize', () => { if (!busy) redraw(); });
render();
