import type { GalleryItem } from '../shared/types';
import { unwrapRedirect } from './original';

const SELECTOR = '.message-userContent img.bbImage';
const live = new WeakMap<HTMLImageElement, GalleryItem>();
let items: GalleryItem[] = [];
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let debounceTimer = 0;

export function getLiveMap(): WeakMap<HTMLImageElement, GalleryItem> {
  return live;
}

export function getItems(): GalleryItem[] {
  return items;
}

export function onGalleryChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) cb();
}

function isTinyOrData(src: string, img: HTMLImageElement): boolean {
  if (!src) return true;
  if (src.startsWith('data:')) return true;
  if (img.getAttribute('width') === '1' && img.getAttribute('height') === '1') return true;
  return false;
}

function isExcluded(img: HTMLImageElement): boolean {
  if (img.classList.contains('smilie') || img.classList.contains('avatar')) return true;
  if (img.closest('.message-avatar, .message-signature, .reaction, .reactionsBar, .button')) {
    return true;
  }
  return false;
}

export function isCollapsedSpoiler(img: Element): boolean {
  const content = img.closest('.bbCodeSpoiler-content');
  if (!content) return false;
  if (content.hasAttribute('hidden')) return true;
  const el = content as HTMLElement;
  if (el.style.display === 'none') return true;
  const root = img.closest('.bbCodeSpoiler');
  const button = root?.querySelector('.bbCodeSpoiler-button');
  if (
    content.classList.contains('is-active') ||
    root?.classList.contains('is-active') ||
    button?.classList.contains('is-active')
  ) {
    return false;
  }
  return Boolean(content.closest('.bbCodeSpoiler'));
}

function previewOf(img: HTMLImageElement): string | null {
  const src = img.currentSrc || img.src;
  if (isTinyOrData(src, img)) return null;
  return src;
}

function wrapOf(img: HTMLImageElement): { anchor: HTMLAnchorElement | null; lb: HTMLElement | null } {
  const anchor = img.closest('a[href]');
  const lbRaw = img.closest('.bbImageWrapper, .js-lbImage');
  return {
    anchor: anchor instanceof HTMLAnchorElement ? anchor : null,
    lb: lbRaw instanceof HTMLElement ? lbRaw : null,
  };
}

export function imgFromEventTarget(target: EventTarget | null): HTMLImageElement | null {
  if (!target || !(target instanceof Element)) return null;
  if (target instanceof HTMLImageElement && live.has(target)) return target;
  const wrap = target.closest('a[href], .bbImageWrapper, .js-lbImage');
  if (!wrap) return null;
  const img = wrap.querySelector('img.bbImage');
  if (img instanceof HTMLImageElement && live.has(img)) return img;
  return null;
}

export function rescan(): GalleryItem[] {
  const next: GalleryItem[] = [];
  const seen = new Set<HTMLImageElement>();
  const nodeList = document.querySelectorAll<HTMLImageElement>(SELECTOR);
  for (const img of nodeList) {
    if (!img.isConnected) continue;
    if (seen.has(img)) continue;
    seen.add(img);
    if (isExcluded(img)) continue;
    if (isCollapsedSpoiler(img)) continue;
    const previewUrl = previewOf(img);
    if (!previewUrl) continue;

    const existing = live.get(img);
    const { anchor, lb } = wrapOf(img);
    const wrapperHref = anchor?.href ?? null;
    const unwrappedHref = wrapperHref ? unwrapRedirect(wrapperHref) : null;
    const dataUrl = img.dataset.url ?? null;
    const wrapperDataSrc = lb?.dataset.src ?? null;
    const alt = img.alt || img.title || '';

    if (existing) {
      existing.previewUrl = previewUrl;
      existing.wrapperHref = wrapperHref;
      existing.unwrappedHref = unwrappedHref;
      existing.dataUrl = dataUrl;
      existing.wrapperDataSrc = wrapperDataSrc;
      existing.alt = alt;
      next.push(existing);
    } else {
      const created: GalleryItem = {
        previewUrl,
        wrapperHref,
        unwrappedHref,
        dataUrl,
        wrapperDataSrc,
        alt,
        originalState: 'idle',
      };
      live.set(img, created);
      next.push(created);
    }
  }
  items = next;
  notify();
  return items;
}

function scheduleRescan(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => rescan(), 80);
}

export function startCollector(): void {
  const root = document.documentElement;
  observer = new MutationObserver(() => scheduleRescan());
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'src'],
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => rescan(), { once: true });
  } else {
    rescan();
  }
}

export function hostHistogram(list = items): Record<string, number> {
  const counts: Record<string, number> = {};
  const bump = (host: string) => {
    counts[host] = (counts[host] ?? 0) + 1;
  };
  for (const it of list) {
    try {
      bump(new URL(it.unwrappedHref || it.previewUrl).hostname);
    } catch {
      bump('(invalid)');
    }
  }
  return counts;
}
