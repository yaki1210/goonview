import type { GalleryItem, LoadKind, ResolvePhase } from '../shared/types';
import { getItems, onGalleryChange } from './collector';
import {
  copyTarget,
  fetchGoonBoxImage,
  isSafeHttpsUrl,
  openTabTarget,
  resolveOriginal,
} from './original';
import css from './styles.css?raw';

const OPEN_TAB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V352c0-17.7-14.3-32-32-32s-32 14.3-32 32v80c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16h80c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/></svg>`;
const CHEVRON_L = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 5.5 8 12l7.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_R = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5 16 12l-7.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const X_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const FULL_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const COPY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let els: {
  backdrop: HTMLDivElement;
  stage: HTMLDivElement;
  media: HTMLImageElement;
  spinner: HTMLDivElement;
  error: HTMLDivElement;
  counter: HTMLSpanElement;
  loadOriginal: HTMLButtonElement;
  toast: HTMLDivElement;
} | null = null;

let open = false;
let index = 0;
let savedOverflow = '';
let loadGen = 0;
let loadKind: LoadKind | null = null;
let retriedSame = false;
let scale = 1;
let panX = 0;
let panY = 0;
let pointer: {
  x: number;
  y: number;
  panX: number;
  panY: number;
  moved: boolean;
  id: number;
  onMedia: boolean;
} | null = null;
let toastTimer = 0;

function currentItem(): GalleryItem | undefined {
  return getItems()[index];
}

export function isViewerOpen(): boolean {
  return open;
}

function svgButton(cls: string, label: string, svg: string, text?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.setAttribute('aria-label', label);
  b.innerHTML = text ? `${svg}<span>${text}</span>` : svg;
  return b;
}

function ensureHost(): NonNullable<typeof els> {
  if (host && shadow && els) return els;
  host = document.createElement('div');
  host.id = 'goonview-host';
  host.hidden = true;
  host.tabIndex = -1;
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'Image viewer');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.append(style);

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const stage = document.createElement('div');
  stage.className = 'stage';
  const media = document.createElement('img');
  media.className = 'media';
  media.referrerPolicy = 'no-referrer';
  media.alt = '';
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.hidden = true;
  const error = document.createElement('div');
  error.className = 'error';
  error.hidden = true;
  const prev = svgButton('nav prev', '上一张', CHEVRON_L);
  const next = svgButton('nav next', '下一张', CHEVRON_R);
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const counter = document.createElement('span');
  counter.className = 'counter';
  const loadOriginal = document.createElement('button');
  loadOriginal.type = 'button';
  loadOriginal.className = 'load-original';
  loadOriginal.textContent = '加载原图';
  const fullscreen = svgButton('fullscreen', '全屏', FULL_SVG);
  const openTab = svgButton('open-tab', '在新标签打开', OPEN_TAB_SVG);
  const copy = svgButton('copy-url', '复制链接', COPY_SVG);
  const closeBtn = svgButton('close', '关闭', X_SVG);
  toolbar.append(counter, loadOriginal, fullscreen, openTab, copy, closeBtn);
  stage.append(media, spinner, error, prev, next, toolbar);

  const toast = document.createElement('div');
  toast.className = 'toast';
  shadow.append(backdrop, stage, toast);
  document.documentElement.append(host);

  els = { backdrop, stage, media, spinner, error, counter, loadOriginal, toast };
  prev.addEventListener('click', (e) => {
    e.stopPropagation();
    step(-1);
  });
  next.addEventListener('click', (e) => {
    e.stopPropagation();
    step(1);
  });
  loadOriginal.addEventListener('click', (e) => {
    e.stopPropagation();
    void loadOriginalNow();
  });
  fullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });
  openTab.addEventListener('click', (e) => {
    e.stopPropagation();
    openInTab();
  });
  copy.addEventListener('click', (e) => {
    e.stopPropagation();
    void copyUrl();
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeViewer();
  });

  media.addEventListener('load', onMediaLoad);
  media.addEventListener('error', onMediaError);

  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('touchmove', onTouchMove, { passive: false });
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);

  onGalleryChange(() => {
    if (!open) return;
    const item = currentItem();
    const list = getItems();
    if (!item || list.length === 0) {
      closeViewer();
      return;
    }
    const nextIdx = list.indexOf(item);
    index = nextIdx >= 0 ? nextIdx : Math.min(index, list.length - 1);
    render(false);
  });

  return els;
}

function showToast(text: string): void {
  if (!els) return;
  els.toast.textContent = text;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els?.toast.classList.remove('show'), 1800);
}

function resetTransform(): void {
  scale = 1;
  panX = 0;
  panY = 0;
  applyTransform();
}

function applyTransform(): void {
  if (!els) return;
  if (scale <= 1) {
    scale = 1;
    panX = 0;
    panY = 0;
  }
  els.media.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  els.stage.classList.toggle('is-zoomed', scale > 1);
}

function clampPan(): void {
  if (!els || scale <= 1) {
    panX = 0;
    panY = 0;
    return;
  }
  const stage = els.stage.getBoundingClientRect();
  const w = els.media.getBoundingClientRect().width;
  const h = els.media.getBoundingClientRect().height;
  const maxX = Math.max(0, (w - stage.width) / 2 + 64);
  const maxY = Math.max(0, (h - stage.height) / 2 + 64);
  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
}

function onWheel(ev: WheelEvent): void {
  ev.preventDefault();
  if (!open || !els) return;
  const old = scale;
  const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
  const next = Math.min(8, Math.max(1, old * factor));
  const rect = els.stage.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const ox = (ev.clientX - cx - panX) / old;
  const oy = (ev.clientY - cy - panY) / old;
  scale = next;
  panX = ev.clientX - cx - ox * scale;
  panY = ev.clientY - cy - oy * scale;
  if (scale === 1) {
    panX = 0;
    panY = 0;
  } else {
    clampPan();
  }
  applyTransform();
}

function onTouchMove(ev: TouchEvent): void {
  if (open) ev.preventDefault();
}

function isMediaTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || !els) return false;
  return target === els.media || target === els.spinner || target === els.error;
}

function onPointerDown(ev: PointerEvent): void {
  if (!open || !els) return;
  if (ev.button !== 0) return;
  const t = ev.target as Element;
  if (t.closest('button')) return;
  pointer = {
    x: ev.clientX,
    y: ev.clientY,
    panX,
    panY,
    moved: false,
    id: ev.pointerId,
    onMedia: isMediaTarget(ev.target),
  };
  els.stage.setPointerCapture(ev.pointerId);
}

function onPointerMove(ev: PointerEvent): void {
  if (!pointer || ev.pointerId !== pointer.id || !els) return;
  const dx = ev.clientX - pointer.x;
  const dy = ev.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 5) pointer.moved = true;
  if (scale > 1) {
    panX = pointer.panX + dx;
    panY = pointer.panY + dy;
    clampPan();
    applyTransform();
    els.stage.classList.add('is-panning');
  }
}

function onPointerUp(ev: PointerEvent): void {
  if (!pointer || ev.pointerId !== pointer.id) return;
  const dx = ev.clientX - pointer.x;
  const dy = ev.clientY - pointer.y;
  const dist = Math.hypot(dx, dy);
  const wasMoved = pointer.moved || dist > 5;
  els?.stage.classList.remove('is-panning');
  els?.stage.releasePointerCapture(ev.pointerId);
  const p = pointer;
  pointer = null;

  if (scale === 1 && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
    step(dx < 0 ? 1 : -1);
    return;
  }
  if (!wasMoved && dist < 5) {
    if (p.onMedia) {
      const item = currentItem();
      if (item && item.originalState !== 'ready' && item.originalState !== 'unavailable') {
        void loadOriginalNow();
      }
    } else {
      closeViewer();
    }
  }
}

function onKey(ev: KeyboardEvent): void {
  if (!open) return;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    closeViewer();
    return;
  }
  if (ev.key === 'ArrowLeft') {
    ev.preventDefault();
    ev.stopPropagation();
    step(-1);
    return;
  }
  if (ev.key === 'ArrowRight') {
    ev.preventDefault();
    ev.stopPropagation();
    step(1);
    return;
  }
  if (ev.key === 'f' || ev.key === 'F') {
    ev.preventDefault();
    ev.stopPropagation();
    toggleFullscreen();
  }
}

function toggleFullscreen(): void {
  if (!host) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void host.requestFullscreen().catch(() => showToast('全屏不可用'));
}

function openInTab(): void {
  const item = currentItem();
  if (!item) return;
  const url = openTabTarget(item);
  window.open(url || 'about:blank', '_blank', 'noopener');
}

async function copyUrl(): Promise<void> {
  const item = currentItem();
  if (!item) return;
  const url = copyTarget(item);
  try {
    await navigator.clipboard.writeText(url);
    showToast('已复制链接');
  } catch {
    showToast(url);
  }
}

function setBusy(busy: boolean, err?: string): void {
  if (!els) return;
  els.spinner.hidden = !busy;
  if (err) {
    els.error.hidden = false;
    els.error.textContent = err;
  } else {
    els.error.hidden = true;
    els.error.textContent = '';
  }
}

function updateLoadButton(): void {
  if (!els) return;
  const item = currentItem();
  const ready = item?.originalState === 'ready';
  const unavailable = item?.originalState === 'unavailable';
  els.loadOriginal.disabled = ready || unavailable || item?.originalState === 'resolving';
  els.loadOriginal.textContent = ready ? '原图' : unavailable ? '无法加载原图' : '加载原图';
}

function preloadNeighbors(): void {
  const list = getItems();
  for (const d of [-1, 1]) {
    const it = list[index + d] ?? list[(index + d + list.length) % list.length];
    if (!it) continue;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = it.previewUrl;
  }
}

function render(resetZoom: boolean): void {
  const item = currentItem();
  const ui = ensureHost();
  const list = getItems();
  if (!item || list.length === 0) return;
  if (resetZoom) resetTransform();
  ui.counter.textContent = `${index + 1} / ${list.length}`;
  ui.media.alt = item.alt;
  loadGen += 1;
  loadKind = null;
  retriedSame = false;
  setBusy(false);
  if (item.originalState === 'ready' && item.originalUrl) {
    ui.media.src = item.originalUrl;
  } else {
    ui.media.src = item.previewUrl;
  }
  updateLoadButton();
  preloadNeighbors();
}

function step(delta: number): void {
  const n = getItems().length;
  if (n === 0) return;
  index = (index + delta + n) % n;
  render(true);
}

function fail(reason: string): void {
  const item = currentItem();
  if (item) item.originalState = 'unavailable';
  setBusy(false, reason);
  updateLoadButton();
  showToast(reason);
}

function onMediaLoad(): void {
  const item = currentItem();
  if (!item || !els) return;
  if (loadKind && item.originalState === 'resolving') {
    item.originalUrl = els.media.currentSrc || els.media.src;
    item.originalState = 'ready';
    setBusy(false);
    updateLoadButton();
  }
}

function onMediaError(): void {
  const item = currentItem();
  if (!item || !els) return;
  if (!loadKind) {
    setBusy(false, 'csp-or-hotlink');
    return;
  }
  if (!retriedSame) {
    retriedSame = true;
    const url = els.media.src;
    els.media.removeAttribute('src');
    els.media.src = url;
    return;
  }
  if (loadKind === 'strip') {
    retriedSame = false;
    void continueAfter('after-strip-error');
    return;
  }
  fail(loadKind === 'api' ? 'api-error-stop' : 'strip-404');
}

async function continueAfter(phase: ResolvePhase): Promise<void> {
  const gen = loadGen;
  const item = currentItem();
  if (!item) return;
  const result = resolveOriginal(item, phase);
  if (gen !== loadGen || currentItem() !== item) return;
  if (!result) {
    fail(phase === 'after-api-error' ? 'api-error-stop' : 'strip-404');
    return;
  }
  await applyResult(item, gen, result);
}

async function applyResult(
  item: GalleryItem,
  gen: number,
  result: NonNullable<ReturnType<typeof resolveOriginal>>,
): Promise<void> {
  if (!els) return;
  loadKind = result.kind;
  if (result.kind === 'api') {
    item.apiAttempted = true;
    const res = await fetchGoonBoxImage(result.id);
    if (gen !== loadGen || currentItem() !== item) return;
    if (!res.ok) {
      fail('api');
      return;
    }
    const url = res.data.image?.original_url ?? res.data.image?.url;
    if (!isSafeHttpsUrl(url)) {
      fail('https-check');
      return;
    }
    retriedSame = false;
    els.media.src = url;
    return;
  }
  retriedSame = false;
  els.media.src = result.url;
}

async function loadOriginalNow(): Promise<void> {
  const item = currentItem();
  const ui = els;
  if (!item || !ui) return;
  if (item.originalState === 'ready' || item.originalState === 'resolving') return;
  if (item.originalState === 'unavailable') return;
  const gen = ++loadGen;
  item.originalState = 'resolving';
  updateLoadButton();
  setBusy(true);
  const result = resolveOriginal(item, 'strip');
  if (gen !== loadGen || currentItem() !== item) return;
  if (!result) {
    fail('strip-404');
    return;
  }
  await applyResult(item, gen, result);
}

export function openViewer(item: GalleryItem): void {
  const list = getItems();
  const idx = list.indexOf(item);
  if (idx < 0) return;
  if (open && index === idx) return;
  ensureHost();
  index = idx;
  open = true;
  if (host) {
    host.hidden = false;
    host.focus();
  }
  savedOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  window.addEventListener('keydown', onKey, true);
  render(true);
}

export function closeViewer(): void {
  if (!open) return;
  open = false;
  loadGen += 1;
  resetTransform();
  if (els) {
    els.media.removeAttribute('src');
    setBusy(false);
  }
  if (host) host.hidden = true;
  document.documentElement.style.overflow = savedOverflow;
  window.removeEventListener('keydown', onKey, true);
  if (document.fullscreenElement) void document.exitFullscreen();
}
