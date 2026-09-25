/** Multiply the site's laid-out turbo.cr embed by this factor. */
export const VIDEO_ZOOM = 2;

export const TURBO_IFRAME_SELECTOR = '.message-userContent iframe[src*="turbo.cr/embed/"]';

export const EMBED_VIDEO_STYLE_ID = 'goonview-embed-video';

/**
 * Fill the embed viewport. CSS zoom on the parent scales buttons and the iframe
 * border box, but the guest layout viewport stays put, so the video frame does not grow.
 */
export const EMBED_VIDEO_CSS = `html, body {
  margin: 0 !important;
  width: 100% !important;
  height: 100% !important;
}
video {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: contain !important;
}
`;

const BOX_PROPS = ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'padding', 'overflow', 'flex', 'grid-column'] as const;

function boxOf(iframe: HTMLIFrameElement): HTMLElement | null {
  const named = iframe.closest('.generic2wide-iframe-div');
  if (named instanceof HTMLElement) return named;
  const parent = iframe.parentElement;
  if (!(parent instanceof HTMLElement)) return null;
  if (parent === iframe.ownerDocument.body) return null;
  if (parent.classList.contains('message-userContent')) return null;
  if (parent.classList.contains('bbWrapper') || parent.classList.contains('message-body')) return null;
  return parent;
}

export function applyVideoBox(iframe: HTMLIFrameElement, width: number, height: number): void {
  const widthPx = `${Math.round(width * VIDEO_ZOOM)}px`;
  const heightPx = `${Math.round(height * VIDEO_ZOOM)}px`;
  const box = boxOf(iframe);
  if (box) {
    box.style.setProperty('width', widthPx, 'important');
    box.style.setProperty('height', heightPx, 'important');
    box.style.setProperty('min-width', widthPx, 'important');
    box.style.setProperty('min-height', heightPx, 'important');
    box.style.setProperty('max-width', 'none', 'important');
    box.style.setProperty('max-height', 'none', 'important');
    box.style.setProperty('padding', '0', 'important');
    box.style.setProperty('overflow', 'visible', 'important');
    box.style.setProperty('flex', '0 0 auto', 'important');
    box.style.setProperty('grid-column', '1 / -1', 'important');
  }
  iframe.style.setProperty('width', widthPx, 'important');
  iframe.style.setProperty('height', heightPx, 'important');
  iframe.style.setProperty('min-width', widthPx, 'important');
  iframe.style.setProperty('min-height', heightPx, 'important');
  iframe.style.setProperty('max-width', 'none', 'important');
  iframe.style.setProperty('max-height', 'none', 'important');
  iframe.setAttribute('width', String(Math.round(width * VIDEO_ZOOM)));
  iframe.setAttribute('height', String(Math.round(height * VIDEO_ZOOM)));
}

export function clearVideoBox(iframe: HTMLIFrameElement): void {
  delete iframe.dataset.gvBase;
  for (const prop of BOX_PROPS) iframe.style.removeProperty(prop);
  iframe.removeAttribute('width');
  iframe.removeAttribute('height');
  const box = boxOf(iframe);
  if (!box) return;
  for (const prop of BOX_PROPS) box.style.removeProperty(prop);
}

export function scaleTurboIframe(iframe: HTMLIFrameElement): void {
  if (iframe.dataset.gvBase) return;
  const width = iframe.offsetWidth;
  const height = iframe.offsetHeight;
  if (width < 8 || height < 8) return;
  iframe.dataset.gvBase = `${width}x${height}`;
  applyVideoBox(iframe, width, height);
}

function turboIframes(doc: Document): HTMLIFrameElement[] {
  return [...doc.querySelectorAll(TURBO_IFRAME_SELECTOR)].filter((node) => node instanceof HTMLIFrameElement);
}

export function startVideoPreview(doc: Document = document): void {
  const root = doc.documentElement;
  if (!root || root.dataset.gvVideoPreview === '1') return;
  root.dataset.gvVideoPreview = '1';

  const observed = new WeakSet<HTMLIFrameElement>();

  const watch = (iframe: HTMLIFrameElement) => {
    if (!observed.has(iframe)) {
      observed.add(iframe);
      new ResizeObserver(() => scaleTurboIframe(iframe)).observe(iframe);
    }
    scaleTurboIframe(iframe);
  };

  const scan = () => {
    for (const iframe of turboIframes(doc)) watch(iframe);
  };

  const rescale = () => {
    for (const iframe of turboIframes(doc)) clearVideoBox(iframe);
    requestAnimationFrame(scan);
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', scan, { once: true });
  else scan();
  doc.defaultView?.addEventListener('load', rescale);
  doc.defaultView?.addEventListener('resize', rescale);
  new MutationObserver(scan).observe(root, { childList: true, subtree: true });
}

export function fitEmbedVideos(doc: Document, viewport?: { width: number; height: number }): void {
  const width = viewport?.width ?? doc.documentElement.clientWidth;
  const height = viewport?.height ?? doc.documentElement.clientHeight;
  for (const node of doc.querySelectorAll('video')) {
    if (!(node instanceof HTMLVideoElement)) continue;
    node.removeAttribute('width');
    node.removeAttribute('height');
    let parent = node.parentElement;
    while (parent && parent !== doc.documentElement) {
      if (width > 0 && parent.clientWidth > 0 && parent.clientWidth + 1 < width) {
        parent.style.setProperty('width', '100%', 'important');
        parent.style.setProperty('max-width', 'none', 'important');
      }
      if (height > 0 && parent.clientHeight > 0 && parent.clientHeight + 1 < height) {
        parent.style.setProperty('height', '100%', 'important');
        parent.style.setProperty('max-height', 'none', 'important');
      }
      parent = parent.parentElement;
    }
  }
}

export function installEmbedVideoFit(doc: Document = document): void {
  if (!doc.getElementById(EMBED_VIDEO_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = EMBED_VIDEO_STYLE_ID;
    style.textContent = EMBED_VIDEO_CSS;
    (doc.head ?? doc.documentElement)?.append(style);
  }
  const fit = () => fitEmbedVideos(doc);
  fit();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fit, { once: true });
  const root = doc.documentElement;
  if (!root) return;
  new MutationObserver(fit).observe(root, { childList: true, subtree: true });
  new ResizeObserver(fit).observe(root);
}
