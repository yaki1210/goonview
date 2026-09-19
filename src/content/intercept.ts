import { getLiveMap, imgFromEventTarget } from './collector';
import { isXfAttachmentUrl } from './original';
import { loadSettings, onSettingsChanged, type Settings } from '../shared/settings';
import { closeViewer, isViewerOpen, openViewer } from './viewer';

let settings: Settings = {
  interceptEnabled: true,
  interceptXfAttachments: true,
};

export function getSettings(): Settings {
  return settings;
}

function isModifiedClick(ev: MouseEvent): boolean {
  return ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey;
}

function shouldBypassAttachment(img: HTMLImageElement): boolean {
  if (settings.interceptXfAttachments) return false;
  const item = getLiveMap().get(img);
  if (!item) return false;
  const candidates = [item.unwrappedHref, item.dataUrl, item.wrapperDataSrc, item.previewUrl];
  return candidates.some((u) => u && isXfAttachmentUrl(u));
}

function handlePointer(ev: Event): void {
  if (!settings.interceptEnabled) return;
  if (ev instanceof MouseEvent && isModifiedClick(ev)) return;
  const img = imgFromEventTarget(ev.target);
  if (!img) return;
  if (shouldBypassAttachment(img)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  document.querySelectorAll('.fancybox-container, .fancybox__container').forEach((n) => n.remove());
  const item = getLiveMap().get(img);
  if (item) openViewer(item);
}

export function startIntercept(): void {
  void loadSettings().then((s) => {
    settings = s;
  });
  onSettingsChanged((s) => {
    settings = s;
    if (!s.interceptEnabled && isViewerOpen()) closeViewer();
  });
  document.addEventListener('click', handlePointer, true);
  document.addEventListener('pointerdown', handlePointer, true);
}
