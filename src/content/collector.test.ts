import { beforeEach, describe, expect, it } from 'vitest';
import { isCollapsedSpoiler, rescan } from './collector';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('collector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects message-userContent img.bbImage in document order', () => {
    mount(`
      <div class="message-userContent">
        <img class="bbImage" src="https://simp6.cuckcapital.cr/a.md.jpg" />
        <img class="bbImage" src="https://simp6.cuckcapital.cr/b.md.jpg" />
      </div>
    `);
    const items = rescan();
    expect(items).toHaveLength(2);
    expect(items[0].previewUrl).toContain('a.md.jpg');
    expect(items[1].previewUrl).toContain('b.md.jpg');
  });

  it('skips avatars smilies signatures', () => {
    mount(`
      <div class="message-userContent">
        <img class="bbImage avatar" src="https://x.cr/a.jpg" />
        <img class="bbImage smilie" src="https://x.cr/b.jpg" />
        <div class="message-signature"><img class="bbImage" src="https://x.cr/c.jpg" /></div>
        <img class="bbImage" src="https://x.cr/ok.jpg" />
      </div>
    `);
    expect(rescan()).toHaveLength(1);
    expect(rescan()[0].previewUrl).toContain('ok.jpg');
  });

  it('keeps anchor href even when nested in bbImageWrapper div', () => {
    mount(`
      <div class="message-userContent">
        <a href="https://goonbox.cr/img/tgDoR4y">
          <div class="bbImageWrapper js-lbImage" data-src="https://goonbox.cr/img/tgDoR4y">
            <img class="bbImage" src="https://simp6.cuckcapital.cr/a.md.jpg" data-url="https://cdn.example/full.jpg" />
          </div>
        </a>
      </div>
    `);
    const [it] = rescan();
    expect(it.unwrappedHref).toBe('https://goonbox.cr/img/tgDoR4y');
    expect(it.dataUrl).toBe('https://cdn.example/full.jpg');
    expect(it.previewUrl).toContain('a.md.jpg');
  });

  it('treats collapsed spoiler as collapsed until is-active', () => {
    mount(`
      <div class="bbCodeSpoiler">
        <button class="bbCodeSpoiler-button"></button>
        <div class="bbCodeSpoiler-content">
          <img class="bbImage" src="https://x.cr/hidden.jpg" />
        </div>
      </div>
    `);
    const img = document.querySelector('img')!;
    expect(isCollapsedSpoiler(img)).toBe(true);
    document.querySelector('.bbCodeSpoiler-button')!.classList.add('is-active');
    expect(isCollapsedSpoiler(img)).toBe(false);
  });
});
