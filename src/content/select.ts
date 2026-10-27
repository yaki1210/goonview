import {
  batchEpoch,
  cancelPendingBatches,
  candidateOrigins,
  ensureBatchAccess,
  pickSaveDirectory,
  resolveOriginalUrl,
  runBatch,
  writeImageFile,
} from './batch-download';
import { getLiveMap, imgFromEventTarget, onGalleryChange } from './collector';
import { loadImageBlob } from './original';

const STYLE_ID = 'gv-batch-style';
const DOCK_ID = 'gv-page-bar';
const BATCH_CSS = `
#${DOCK_ID} {
  position: fixed;
  z-index: 2147483000;
  right: 16px;
  bottom: max(16px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  font: 13px/1 system-ui, -apple-system, Segoe UI, sans-serif;
}
#${DOCK_ID} button {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  margin: 0;
  padding: 10px 16px;
  font: inherit;
  color: #fff;
  background: rgba(18, 18, 20, 0.92);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}
#${DOCK_ID} [data-gv-mode][aria-pressed="true"] {
  background: #3a3a40;
}
#${DOCK_ID} [data-gv-download] {
  background: #2f6fed;
  border-color: #2f6fed;
}
#${DOCK_ID} [data-gv-download]:disabled {
  background: rgba(18, 18, 20, 0.72);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.45);
  cursor: default;
}
#${DOCK_ID} .gv-batch-status {
  padding: 0 4px;
  font-size: 12px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}
.gv-all-host { position: relative; }
.message:has(> .gv-all) { overflow: visible; }
.message > .gv-all {
  position: absolute;
  left: 100%;
  top: 50%;
  margin: 0 0 0 calc(22px * 3);
  transform: translateY(-50%);
  z-index: 6;
  display: flex;
  padding: 0;
  background: none;
  cursor: pointer;
}
button.gv-all-box {
  appearance: none;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  cursor: pointer;
}
button.gv-all-box[aria-checked="true"] {
  background: #2f6fed;
  border-color: #2f6fed;
}
button.gv-all-box[aria-checked="true"]::after {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
}
.gv-check-host { position: relative; }
.gv-mask {
  position: absolute;
  z-index: 5;
  margin: 0;
  padding: 0;
  border: 0;
  max-width: none;
  max-height: none;
  background: transparent;
  pointer-events: none;
  box-sizing: border-box;
}
.gv-mask[aria-pressed="true"] {
  background: rgba(47, 111, 237, 0.45);
}
`;

export type PointerKind = 'check' | 'control' | 'toggle' | 'viewer' | 'pass';

const selected: HTMLImageElement[] = [];
const checkImg = new WeakMap<HTMLElement, HTMLImageElement>();
const checkBtn = new WeakMap<HTMLImageElement, HTMLElement>();
let pageOn = false;
let running = false;
let started = false;
let scanTimer = 0;
let maskFrame = 0;
let dock: HTMLElement | null = null;
let modeBtn: HTMLButtonElement | null = null;
let downloadBtn: HTMLButtonElement | null = null;
let statusEl: HTMLElement | null = null;

function messageOf(el: Element | null): HTMLElement | null {
  const message = el?.closest('.message');
  return message instanceof HTMLElement ? message : null;
}

function owned(message: HTMLElement, selector: string): HTMLElement | null {
  for (const el of message.querySelectorAll<HTMLElement>(selector)) {
    if (messageOf(el) === message) return el;
  }
  return null;
}

function messages(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.message')];
}

export function classifyPointer(target: EventTarget | null): PointerKind {
  if (!(target instanceof Element)) return 'pass';
  if (target.closest('[data-gv-check]')) return 'check';
  if (target.closest('[data-gv-select]')) return 'control';
  const img = imgFromEventTarget(target);
  if (!img) return 'pass';
  if (pageOn) return 'toggle';
  return 'viewer';
}

export function toggleFromPointerTarget(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const check = target.closest('[data-gv-check]');
  if (check instanceof HTMLElement) {
    const img = checkImg.get(check);
    if (img) toggleSelected(img);
    return;
  }
  const img = imgFromEventTarget(target);
  if (img) toggleSelected(img);
}

function liveSelected(): HTMLImageElement[] {
  const live = getLiveMap();
  const next = selected.filter((img) => img.isConnected && live.has(img));
  selected.length = 0;
  selected.push(...next);
  return selected;
}

export function toggleSelected(img: HTMLImageElement): void {
  if (!pageOn) return;
  const message = messageOf(img);
  if (!message || !getLiveMap().has(img)) return;
  const at = selected.indexOf(img);
  if (at >= 0) selected.splice(at, 1);
  else selected.push(img);
  checkBtn.get(img)?.setAttribute('aria-pressed', at >= 0 ? 'false' : 'true');
  syncAllBox(message);
  updateDownload();
}

function collectedIn(message: HTMLElement): HTMLImageElement[] {
  const live = getLiveMap();
  const out: HTMLImageElement[] = [];
  for (const img of message.querySelectorAll<HTMLImageElement>('.message-userContent img.bbImage')) {
    if (messageOf(img) !== message) continue;
    if (live.has(img)) out.push(img);
  }
  return out;
}

function isStatic(el: HTMLElement): boolean {
  try {
    const pos = getComputedStyle(el).position;
    return !pos || pos === 'static';
  } catch {
    return true;
  }
}

function overlayZ(img: HTMLImageElement): string {
  let z = 4;
  try {
    const parsed = Number.parseInt(getComputedStyle(img).zIndex, 10);
    if (Number.isFinite(parsed)) z = parsed;
  } catch {
    /* keep the default */
  }
  return String(Math.min(Math.max(z + 1, 5), 80));
}

function syncMaskBox(mask: HTMLElement, img: HTMLImageElement): void {
  const host = mask.parentElement;
  if (!host) return;
  const hostRect = host.getBoundingClientRect();
  const rect = img.getBoundingClientRect();
  const edge = getComputedStyle(host);
  const borderLeft = Number.parseFloat(edge.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(edge.borderTopWidth) || 0;
  const left = rect.left - hostRect.left + host.scrollLeft - borderLeft;
  const top = rect.top - hostRect.top + host.scrollTop - borderTop;
  mask.style.setProperty('left', `${left}px`, 'important');
  mask.style.setProperty('top', `${top}px`, 'important');
  mask.style.setProperty('width', `${rect.width}px`, 'important');
  mask.style.setProperty('height', `${rect.height}px`, 'important');
  mask.style.setProperty('right', 'auto', 'important');
  mask.style.setProperty('bottom', 'auto', 'important');
  mask.style.setProperty('max-width', 'none', 'important');
  mask.style.setProperty('max-height', 'none', 'important');
  mask.style.setProperty('z-index', overlayZ(img), 'important');
}

function syncOpenMasks(): void {
  if (!pageOn) return;
  for (const message of messages()) {
    for (const img of collectedIn(message)) {
      const mask = checkBtn.get(img);
      if (mask?.isConnected) syncMaskBox(mask, img);
    }
  }
}

function scheduleMaskSync(): void {
  if (!pageOn || maskFrame) return;
  maskFrame = window.requestAnimationFrame(() => {
    maskFrame = 0;
    syncOpenMasks();
  });
}

function placeCheck(img: HTMLImageElement): HTMLElement | null {
  const host = img.parentElement;
  if (!host) return null;
  if (isStatic(host)) host.classList.add('gv-check-host');
  const mask = document.createElement('div');
  mask.className = 'gv-mask';
  mask.setAttribute('data-gv-check', '');
  mask.setAttribute('aria-hidden', 'true');
  mask.setAttribute('aria-pressed', 'false');
  host.append(mask);
  checkImg.set(mask, img);
  checkBtn.set(img, mask);
  syncMaskBox(mask, img);
  return mask;
}

function removeCheck(btn: HTMLElement): void {
  const img = checkImg.get(btn);
  if (img) checkBtn.delete(img);
  checkImg.delete(btn);
  const host = btn.parentElement;
  btn.remove();
  if (host && !host.querySelector('[data-gv-check]')) host.classList.remove('gv-check-host');
}

function allBoxOf(message: HTMLElement): HTMLButtonElement | null {
  const box = owned(message, '[data-gv-all-box]');
  return box instanceof HTMLButtonElement ? box : null;
}

function syncAllBox(message: HTMLElement): void {
  const box = allBoxOf(message);
  if (!box) return;
  const all = collectedIn(message);
  const on = all.length > 0 && all.every((img) => selected.includes(img));
  box.setAttribute('aria-checked', on ? 'true' : 'false');
}

function removeAllBox(message: HTMLElement): void {
  owned(message, '.gv-all')?.remove();
  const still = [...message.children].some((child) => child.classList.contains('gv-all'));
  if (!still) message.classList.remove('gv-all-host');
}

function ensureAllBox(message: HTMLElement): void {
  if (collectedIn(message).length === 0) {
    removeAllBox(message);
    return;
  }
  if (owned(message, '.gv-all')) return;
  if (isStatic(message)) message.classList.add('gv-all-host');
  const row = document.createElement('div');
  row.className = 'gv-all';
  row.setAttribute('data-gv-select', '');
  row.setAttribute('data-gv-all', '');
  const box = document.createElement('button');
  box.type = 'button';
  box.className = 'gv-all-box';
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', 'false');
  box.setAttribute('aria-label', '全选这条消息');
  box.setAttribute('data-gv-all-box', '');
  box.setAttribute('data-gv-select', '');
  row.append(box);
  row.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleMessageAll(message);
  });
  message.append(row);
}

function renderChecks(message: HTMLElement): void {
  const collected = collectedIn(message);
  if (collected.length === 0) {
    clearChecks(message);
    removeAllBox(message);
    return;
  }
  ensureAllBox(message);
  const have = new Set(collected);
  for (let i = selected.length - 1; i >= 0; i--) {
    const img = selected[i]!;
    if (messageOf(img) === message && !have.has(img)) selected.splice(i, 1);
  }
  const picked = new Set(selected);
  for (const btn of [...message.querySelectorAll<HTMLElement>('[data-gv-check]')]) {
    if (messageOf(btn) !== message) continue;
    const img = checkImg.get(btn);
    if (!img || !img.isConnected || !have.has(img)) removeCheck(btn);
  }
  for (const img of collected) {
    let btn = checkBtn.get(img);
    if (!btn?.isConnected) btn = placeCheck(img) ?? undefined;
    else syncMaskBox(btn, img);
    btn?.setAttribute('aria-pressed', picked.has(img) ? 'true' : 'false');
  }
  syncAllBox(message);
}

function clearChecks(message: HTMLElement): void {
  for (const btn of [...message.querySelectorAll<HTMLElement>('[data-gv-check]')]) {
    if (messageOf(btn) !== message) continue;
    removeCheck(btn);
  }
}

function updateDownload(): void {
  if (!downloadBtn) return;
  const n = liveSelected().length;
  downloadBtn.disabled = n === 0 || running;
  downloadBtn.textContent = n > 0 ? `下载 ${n}` : '下载';
}

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function enterPage(): void {
  pageOn = true;
  document.documentElement.classList.add('gv-selecting');
  modeBtn?.setAttribute('aria-pressed', 'true');
  for (const message of messages()) renderChecks(message);
  updateDownload();
}

function exitPage(): void {
  pageOn = false;
  running = false;
  selected.length = 0;
  document.documentElement.classList.remove('gv-selecting');
  modeBtn?.setAttribute('aria-pressed', 'false');
  for (const message of messages()) {
    clearChecks(message);
    removeAllBox(message);
  }
  setStatus('');
  updateDownload();
  if (maskFrame) {
    window.cancelAnimationFrame(maskFrame);
    maskFrame = 0;
  }
}

function togglePage(): void {
  if (pageOn) exitPage();
  else enterPage();
}

function toggleMessageAll(message: HTMLElement): void {
  if (!pageOn) return;
  const all = collectedIn(message);
  const allOn = all.length > 0 && all.every((img) => selected.includes(img));
  if (allOn) {
    for (const img of all) {
      const at = selected.indexOf(img);
      if (at >= 0) selected.splice(at, 1);
    }
  } else {
    for (const img of all) {
      if (!selected.includes(img)) selected.push(img);
    }
  }
  renderChecks(message);
  updateDownload();
}

async function startDownload(): Promise<void> {
  if (running) return;
  const imgs = liveSelected();
  const items = imgs.map((img) => getLiveMap().get(img)!);
  if (items.length === 0) return;
  running = true;
  updateDownload();
  const origins = candidateOrigins(items);
  const token = batchEpoch();
  try {
    const allowed = await ensureBatchAccess(origins);
    if (token !== batchEpoch()) return;
    if (!allowed) {
      setStatus('需要图片权限');
      return;
    }
    const dir = await pickSaveDirectory();
    if (token !== batchEpoch()) return;
    if (!dir) {
      setStatus('未选择保存位置');
      return;
    }
    await runBatch(items, location.href, {
      resolve: (item) => resolveOriginalUrl(item),
      ensure: async () => true,
      download: async ({ url, filename }) => {
        const blob = await loadImageBlob(url);
        if (!blob) throw new Error('not an image');
        await writeImageFile(dir, filename, blob);
      },
      onStatus: (text) => {
        if (token === batchEpoch()) setStatus(text);
      },
      isCancelled: () => token !== batchEpoch(),
    });
  } finally {
    running = false;
    updateDownload();
  }
}

function onDockClick(ev: Event): void {
  if (!(ev.target instanceof Element)) return;
  const hit = ev.target.closest('[data-gv-mode], [data-gv-download]');
  if (!(hit instanceof HTMLElement) || hit.closest(`#${DOCK_ID}`) !== dock) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (hit.hasAttribute('data-gv-mode')) togglePage();
  else void startDownload();
}

function ensurePageBar(): void {
  if (dock?.isConnected) return;
  dock = document.createElement('div');
  dock.id = DOCK_ID;
  dock.setAttribute('data-gv-select', '');

  modeBtn = document.createElement('button');
  modeBtn.type = 'button';
  modeBtn.textContent = '选择';
  modeBtn.setAttribute('data-gv-select', '');
  modeBtn.setAttribute('data-gv-mode', '');
  modeBtn.setAttribute('aria-pressed', pageOn ? 'true' : 'false');

  downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.textContent = '下载';
  downloadBtn.setAttribute('data-gv-select', '');
  downloadBtn.setAttribute('data-gv-download', '');
  downloadBtn.disabled = true;

  statusEl = document.createElement('span');
  statusEl.className = 'gv-batch-status';
  statusEl.setAttribute('data-gv-select', '');
  statusEl.setAttribute('data-gv-status', '');

  dock.append(modeBtn, downloadBtn, statusEl);
  dock.addEventListener('click', onDockClick);
  document.documentElement.append(dock);
  updateDownload();
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BATCH_CSS;
  (document.head || document.documentElement).append(style);
}

export function mountBatchBars(): void {
  ensureStyle();
  ensurePageBar();
  if (pageOn) refreshSelecting();
}

function refreshSelecting(): void {
  liveSelected();
  if (!pageOn) {
    updateDownload();
    return;
  }
  for (const message of messages()) renderChecks(message);
  updateDownload();
}

function watchNewMessages(): void {
  const observer = new MutationObserver(() => {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      if (document.readyState === 'loading') return;
      mountBatchBars();
    }, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function resetSelectState(): void {
  pageOn = false;
  running = false;
  selected.length = 0;
  dock = null;
  modeBtn = null;
  downloadBtn = null;
  statusEl = null;
  document.getElementById(DOCK_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.classList.remove('gv-selecting');
}

export function startSelect(): void {
  const boot = () => {
    if (started) return;
    started = true;
    ensureStyle();
    ensurePageBar();
    watchNewMessages();
    onGalleryChange(refreshSelecting);
    window.addEventListener('resize', scheduleMaskSync, { passive: true });
    document.addEventListener('load', scheduleMaskSync, true);
    window.addEventListener('pagehide', () => cancelPendingBatches());
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
