import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMBED_VIDEO_CSS,
  TURBO_IFRAME_SELECTOR,
  VIDEO_ZOOM,
  applyVideoBox,
  clearVideoBox,
  fitEmbedVideos,
  scaleTurboIframe,
} from './video-preview';

function mount(html: string): void {
  document.body.innerHTML = html;
}

describe('video preview', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sizes the iframe box by 2 and does not use zoom', () => {
    mount(`
      <div class="message-userContent">
        <div class="generic2wide-iframe-div">
          <iframe class="saint-iframe" src="data:text/html,https://turbo.cr/embed/abc"></iframe>
        </div>
        <button style="width:80px;height:32px">play</button>
      </div>
    `);
    const iframe = document.querySelector('iframe');
    const button = document.querySelector('button');
    if (!(iframe instanceof HTMLIFrameElement) || !(button instanceof HTMLButtonElement)) {
      throw new Error('fixture missing');
    }
    applyVideoBox(iframe, 600, 340);
    expect(VIDEO_ZOOM).toBe(2);
    expect(iframe.style.width).toBe('1200px');
    expect(iframe.style.height).toBe('680px');
    expect(iframe.getAttribute('width')).toBe('1200');
    expect(iframe.style.cssText).not.toContain('zoom');
    const wrapper = document.querySelector('.generic2wide-iframe-div');
    expect(wrapper instanceof HTMLElement && wrapper.style.width).toBe('1200px');
    expect(wrapper instanceof HTMLElement && wrapper.style.height).toBe('680px');
    expect(button.style.width).toBe('80px');
    expect(EMBED_VIDEO_CSS).toContain('video');
    expect(EMBED_VIDEO_CSS).toContain('width: 100%');
    expect(EMBED_VIDEO_CSS).not.toContain('zoom');
    expect(EMBED_VIDEO_CSS).not.toContain('button');
  });

  it('scales a laid-out turbo iframe once', () => {
    mount(`
      <div class="message-userContent">
        <iframe src="data:text/html,https://turbo.cr/embed/bare" style="width:600px;height:340px"></iframe>
        <iframe src="data:text/html,https://www.youtube.com/embed/xyz" style="width:600px;height:340px"></iframe>
      </div>
    `);
    const turbo = document.querySelector(TURBO_IFRAME_SELECTOR);
    const youtube = document.querySelector('iframe[src*="youtube.com"]');
    if (!(turbo instanceof HTMLIFrameElement) || !(youtube instanceof HTMLIFrameElement)) {
      throw new Error('fixture missing');
    }
    Object.defineProperty(turbo, 'offsetWidth', { value: 600 });
    Object.defineProperty(turbo, 'offsetHeight', { value: 340 });
    scaleTurboIframe(turbo);
    scaleTurboIframe(turbo);
    expect(turbo.style.width).toBe('1200px');
    expect(youtube.style.width).toBe('600px');
    clearVideoBox(turbo);
    expect(turbo.style.width).toBe('');
    expect(turbo.hasAttribute('width')).toBe(false);
  });

  it('makes the video fill the viewport and leaves the button alone', () => {
    mount(`
      <div id="stage" style="width:600px;height:340px">
        <video id="main-video" width="600" height="340" style="width:600px;height:340px"></video>
        <button style="width:80px;height:32px">play</button>
      </div>
    `);
    const video = document.querySelector('video');
    const stage = document.getElementById('stage');
    const button = document.querySelector('button');
    if (!stage) throw new Error('fixture missing');
    Object.defineProperty(stage, 'clientWidth', { value: 600 });
    Object.defineProperty(stage, 'clientHeight', { value: 340 });
    fitEmbedVideos(document, { width: 1200, height: 680 });
    expect(video?.hasAttribute('width')).toBe(false);
    expect(video?.hasAttribute('height')).toBe(false);
    expect(stage?.style.width).toBe('100%');
    expect(stage?.style.height).toBe('100%');
    expect(button?.style.width).toBe('80px');
    expect(button?.style.height).toBe('32px');
  });
});
