import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rescan } from './collector';
import { startIntercept } from './intercept';
import { classifyPointer, mountBatchBars, resetSelectState } from './select';
import { closeViewer, isViewerOpen } from './viewer';

const FIXTURE = `
  <article class="message" id="m1">
    <div class="message-attribution"></div>
    <div class="message-userContent">
      <div class="bbImageWrapper">
        <img class="bbImage" id="a" src="https://simp6.cuckcapital.cr/a.md.jpg" />
      </div>
      <div class="bbImageWrapper">
        <img class="bbImage" id="b" src="https://simp6.cuckcapital.cr/b.md.jpg" />
      </div>
      <img class="bbImage avatar" src="https://x.cr/avatar.jpg" />
      <img class="bbImage" src="data:image/gif;base64,AAAA" />
      <div class="bbCodeSpoiler">
        <button class="bbCodeSpoiler-button"></button>
        <div class="bbCodeSpoiler-content">
          <div class="bbImageWrapper">
            <img class="bbImage" src="https://x.cr/hidden.jpg" />
          </div>
        </div>
      </div>
    </div>
    <div class="message-actionBar"></div>
  </article>
  <article class="message" id="m2">
    <div class="message-actionBar"></div>
    <div class="message-userContent">
      <div class="bbImageWrapper">
        <img class="bbImage" id="c" src="https://simp6.cuckcapital.cr/c.md.jpg" />
      </div>
    </div>
  </article>
  <article class="message" id="m3">
    <div class="message-attribution"></div>
    <div class="message-userContent">
      <div class="bbImageWrapper">
        <img class="bbImage" src="https://simp6.cuckcapital.cr/d.md.jpg" />
      </div>
    </div>
  </article>
`;

function fire(el: Element, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
}

function message(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) throw new Error(`missing ${id}`);
  return el;
}

function dock(): HTMLElement {
  const el = document.getElementById('gv-page-bar');
  if (!(el instanceof HTMLElement)) throw new Error('missing dock');
  return el;
}

function modeButton(): HTMLButtonElement {
  const el = dock().querySelector<HTMLButtonElement>('[data-gv-mode]');
  if (!el) throw new Error('missing select');
  return el;
}

function allBox(id: string): HTMLButtonElement {
  const el = message(id).querySelector<HTMLButtonElement>('[data-gv-all-box]');
  if (!el) throw new Error(`missing all box ${id}`);
  return el;
}

function allChecked(id: string): boolean {
  return allBox(id).getAttribute('aria-checked') === 'true';
}

describe('page select', () => {
  beforeAll(() => {
    const storage = {
      get: async () => ({}),
      set: async () => {},
    };
    Object.assign(globalThis, {
      chrome: {
        storage: {
          sync: storage,
          local: storage,
          onChanged: { addListener() {} },
        },
        runtime: { sendMessage: async () => ({ ok: false, error: 'no' }) },
      },
    });
    startIntercept();
  });

  beforeEach(() => {
    resetSelectState();
    closeViewer();
    document.body.innerHTML = FIXTURE;
    rescan();
    mountBatchBars();
  });

  it('classifies every page image as toggle while select is on', () => {
    const img = document.getElementById('a')!;
    expect(classifyPointer(img)).toBe('viewer');
    expect(dock().closest('.message')).toBeNull();
    expect(message('m1').querySelector('[data-gv-mode]')).toBeNull();
    modeButton().click();
    expect(document.documentElement.classList.contains('gv-selecting')).toBe(true);
    expect(classifyPointer(img)).toBe('toggle');
    expect(classifyPointer(document.getElementById('c')!)).toBe('toggle');
    expect(classifyPointer(message('m1').querySelector('[data-gv-check]')!)).toBe('check');
    expect(classifyPointer(allBox('m1'))).toBe('control');
    expect(classifyPointer(dock().querySelector('[data-gv-download]')!)).toBe('control');
    expect(document.querySelectorAll('[data-gv-check]')).toHaveLength(4);
    modeButton().click();
    expect(document.documentElement.classList.contains('gv-selecting')).toBe(false);
    expect(classifyPointer(img)).toBe('viewer');
    expect(document.querySelector('[data-gv-check]')).toBeNull();
  });

  it('toggles once per click and does not open the viewer', () => {
    modeButton().click();
    const img = document.getElementById('a')!;
    const box = () => message('m1').querySelector('[data-gv-check]')!;
    fire(img);
    expect(box().getAttribute('aria-pressed')).toBe('true');
    expect(isViewerOpen()).toBe(false);
    fire(box(), { ctrlKey: true });
    expect(box().getAttribute('aria-pressed')).toBe('true');
    fire(box());
    expect(box().getAttribute('aria-pressed')).toBe('false');
    expect(isViewerOpen()).toBe(false);
  });

  it('opens the viewer after select mode is off', () => {
    const img = document.getElementById('a')!;
    fire(img);
    expect(isViewerOpen()).toBe(true);
  });

  it('checks a message checkbox only when every collected image in it is selected', () => {
    modeButton().click();
    const img = document.getElementById('a') as HTMLImageElement;
    const host = img.closest('.bbImageWrapper') as HTMLElement;
    img.getBoundingClientRect = () => new DOMRect(15, 40, 180, 120);
    host.getBoundingClientRect = () => new DOMRect(5, 10, 200, 300);
    allBox('m1').click();
    const mask = host.querySelector('.gv-mask') as HTMLElement;
    expect(mask.style.width).toBe('180px');
    expect(mask.style.height).toBe('120px');
    expect(mask.style.left).toBe('10px');
    expect(mask.style.top).toBe('30px');
    expect(mask.style.zIndex).toBe('5');
    const checks = [...message('m1').querySelectorAll('[data-gv-check]')];
    expect(checks).toHaveLength(2);
    expect(checks.every((box) => box.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(allChecked('m1')).toBe(true);
    expect(message('m2').querySelector('[data-gv-check]')!.getAttribute('aria-pressed')).toBe('false');
    expect(allChecked('m2')).toBe(false);
    expect(message('m1').querySelector('.avatar')!.closest('[data-gv-check]')).toBeNull();
    expect(allBox('m1').closest('.message-userContent')).toBeNull();
    expect(allBox('m1').parentElement?.parentElement).toBe(message('m1'));
    expect((checks[0] as HTMLElement).tagName).toBe('DIV');
    expect((checks[0] as HTMLElement).classList.contains('gv-mask')).toBe(true);
    expect(message('m1').querySelector('button.gv-check')).toBeNull();
    const css = document.getElementById('gv-batch-style')?.textContent ?? '';
    expect(css).toContain('left: 100%');
    expect(css).toContain('calc(22px * 3)');
    expect(img.style.width).toBe('');
    expect(img.style.height).toBe('');
    expect(host.style.width).toBe('');
    expect(host.style.height).toBe('');
    expect(dock().querySelector<HTMLButtonElement>('[data-gv-download]')!.disabled).toBe(false);
    expect(dock().querySelector('[data-gv-download]')!.textContent).toBe('下载 2');

    allBox('m1').click();
    const after = [...message('m1').querySelectorAll('[data-gv-check]')];
    expect(after).toHaveLength(2);
    expect(after.every((box) => box.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(allChecked('m1')).toBe(false);
    expect(document.documentElement.classList.contains('gv-selecting')).toBe(true);
    expect(dock().querySelector<HTMLButtonElement>('[data-gv-download]')!.disabled).toBe(true);

    fire(document.getElementById('a')!);
    expect(allChecked('m1')).toBe(false);
    fire(document.getElementById('b')!);
    expect(allChecked('m1')).toBe(true);
    fire(document.getElementById('c')!);
    expect(allChecked('m1')).toBe(true);
    expect(allChecked('m2')).toBe(true);
    expect(dock().querySelector('[data-gv-download]')!.textContent).toBe('下载 3');
  });
});
