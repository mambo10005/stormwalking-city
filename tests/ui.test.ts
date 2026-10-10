// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { SAVE_KEY, deserialize } from '../src/save';

it('실제 DOM 버튼으로 시작·조립·판매·계획 취소·전투·보상·저장·재시작을 연결한다', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  // Only the drawing backend is stubbed. Rules, event handlers and storage are real.
  const ctx = new Proxy({}, { get: (_target, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => undefined, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, x: 0, y: 0, width: 720, height: 720, right: 720, bottom: 720, toJSON() {} });
  let reduced = true;
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  await import('../src/main');
  const click = (action: string, extra = '') => {
    const el = document.querySelector<HTMLButtonElement>(`[data-action="${action}"]${extra}`);
    expect(el, action).toBeTruthy(); expect(el!.disabled, `${action} enabled`).toBe(false); el!.click();
  };
  const cell = (x: number, y: number) => document.querySelector('canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 136 + x * 64 + 32, clientY: 136 + y * 64 + 32 }));
  const saved = () => deserialize(localStorage.getItem(SAVE_KEY)!).state!;
  expect(document.querySelector('h1')?.textContent).toContain('폭풍을');
  click('help'); expect(document.querySelector('[role="dialog"]')).toBeTruthy(); click('help');
  click('start'); expect(document.querySelector('h1')?.textContent).toContain('유리 사구');
  click('buy', '[data-kind="shield"]'); cell(0, 0); click('save');
  expect(saved().parts).toHaveLength(8); expect(saved().scrap).toBe(15);
  click('sell'); click('save'); expect(saved().parts).toHaveLength(7); expect(saved().scrap).toBe(19);
  cell(3, 2); click('execute'); click('rotate');
  expect(document.querySelector<HTMLButtonElement>('[data-action="save"]')?.disabled).toBe(true);
  click('cancel-plan'); click('save'); expect(saved().parts.find(p => p.id === 'p3')?.dir).toBe(0);
  click('preview'); expect(document.querySelector('.event-caption')?.textContent).toContain('1회 반격');

  // During animation the actual button is disabled; stale/repeated calls cannot commit twice.
  reduced = false;
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  click('execute');
  expect(document.querySelector<HTMLButtonElement>('[data-action="execute"]')!.disabled).toBe(true);
  document.querySelector<HTMLButtonElement>('[data-action="execute"]')!.click();
  for (let i = 0; i < 100 && (frames.length || document.querySelector<HTMLButtonElement>('[data-action="execute"]')?.disabled); i++) {
    frames.shift()?.(performance.now() + 1000); await Promise.resolve();
  }
  click('save'); expect(saved().turn).toBe(2); expect(saved().enemies[0].hp).toBe(8);
  reduced = true;
  click('execute'); click('execute');
  expect(document.querySelectorAll('[data-action="reward"]')).toHaveLength(3);
  click('reward', '[data-id="scrap"]'); click('save'); expect(saved().encounter).toBe(1);
  click('restart'); click('dismiss-restart'); expect(document.querySelector('h1')?.textContent).toContain('끊어진 송전로');
  click('restart'); click('new-seed'); expect(document.querySelector('#seed')).toBeTruthy();
  click('load'); expect(document.querySelector('h1')?.textContent).toContain('끊어진 송전로');
  click('restart'); click('new-seed'); click('start'); click('save'); expect(saved().encounter).toBe(0); expect(saved().scrap).toBe(22);
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
