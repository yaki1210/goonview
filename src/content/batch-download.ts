import type { BgRequest, BgResponse, GalleryItem } from '../shared/types';
import {
  fetchGoonBoxImage,
  isImageDownloadUrl,
  isSafeDownloadUrl,
  isSafeHttpsUrl,
  resolveOriginal,
  suggestedDownloadFilename,
} from './original';

const ALLOWED_ORIGINS = [
  'https://*.cuckcapital.cr/*',
  'https://*.selti-delivery.ru/*',
  'https://simpcity.cr/*',
] as const;

const OPTIONAL_HOSTS: { suffix: string; pattern: (typeof ALLOWED_ORIGINS)[number]; apexOnly?: boolean }[] = [
  { suffix: 'cuckcapital.cr', pattern: 'https://*.cuckcapital.cr/*' },
  { suffix: 'selti-delivery.ru', pattern: 'https://*.selti-delivery.ru/*' },
  { suffix: 'simpcity.cr', pattern: 'https://simpcity.cr/*', apexOnly: true },
];

const SLUG_BAD = /[<>:"/\\|?*\u0000-\u001f]/g;

export type BatchDownloadCall = (opts: { url: string; filename: string }) => Promise<void>;

export type BatchDeps = {
  resolve: (item: GalleryItem) => Promise<string | null>;
  ensure: () => Promise<boolean>;
  download: BatchDownloadCall;
  onStatus: (text: string) => void;
  isCancelled: () => boolean;
};

let epoch = 0;

export function cancelPendingBatches(): void {
  epoch += 1;
}

export function batchEpoch(): number {
  return epoch;
}

/** Host patterns this batch is allowed to ask for. goonbox.cr is already required. */
export function optionalOriginFor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === 'goonbox.cr' || host.endsWith('.goonbox.cr')) return null;
  for (const row of OPTIONAL_HOSTS) {
    const match = host === row.suffix || host.endsWith('.' + row.suffix);
    if (!match) continue;
    if (row.apexOnly && host !== row.suffix) return null;
    return row.pattern;
  }
  return null;
}

export function allowedBatchOrigins(origins: string[]): string[] {
  const allowed = new Set<string>(ALLOWED_ORIGINS);
  const out: string[] = [];
  for (const origin of origins) {
    if (!allowed.has(origin) || out.includes(origin)) continue;
    out.push(origin);
  }
  return out;
}

export function candidateOrigins(items: GalleryItem[]): string[] {
  const found: string[] = [];
  for (const item of items) {
    for (const raw of [item.previewUrl, item.unwrappedHref, item.dataUrl, item.wrapperDataSrc, item.originalUrl]) {
      const pattern = optionalOriginFor(raw);
      if (pattern) found.push(pattern);
    }
  }
  return allowedBatchOrigins(found);
}

export function threadSlug(href: string): string {
  let segment = '';
  try {
    const path = new URL(href, 'https://simpcity.cr').pathname;
    const match = path.match(/\/threads\/([^/]+)/i);
    if (match?.[1]) segment = match[1].replace(/\.\d+$/, '');
  } catch {
    segment = '';
  }
  return cleanSlug(segment);
}

function cleanSlug(raw: string): string {
  let s = raw.replace(SLUG_BAD, '_');
  while (s.includes('..')) s = s.replaceAll('..', '_');
  s = s.replace(/^\.+/, '').replace(/[. ]+$/g, '').slice(0, 80);
  if (!s || s === '.' || s === '..') return 'thread';
  return s;
}

export function batchFilename(index: number, url: string): string {
  const n = String(index + 1).padStart(3, '0');
  return `${n}-${suggestedDownloadFilename(url)}`;
}

export function batchPath(slug: string, index: number, url: string): string {
  return `GoonView/${cleanSlug(slug)}/${batchFilename(index, url)}`;
}

export function isSafeBatchPath(filename: string): boolean {
  if (!filename || filename.length > 320) return false;
  if (filename.startsWith('/') || filename.startsWith('\\') || filename.includes('\\')) return false;
  const parts = filename.split('/');
  if (parts.length !== 3 || parts[0] !== 'GoonView') return false;
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function dedupeByUrl(rows: { index: number; url: string }[]): { index: number; url: string }[] {
  const seen = new Set<string>();
  const out: { index: number; url: string }[] = [];
  for (const row of [...rows].sort((a, b) => a.index - b.index)) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    out.push(row);
  }
  return out;
}

/**
 * Resolve a download URL without assigning img.src.
 * A Chevereto strip result is not marked ready: the viewer can still retry it.
 */
export async function resolveOriginalUrl(
  item: GalleryItem,
  loadApi: (id: string) => Promise<BgResponse> = fetchGoonBoxImage,
): Promise<string | null> {
  if (item.originalState === 'ready' && isImageDownloadUrl(item.originalUrl)) return item.originalUrl;
  const first = resolveOriginal(item, 'strip');
  if (first && first.kind !== 'api' && isImageDownloadUrl(first.url)) return first.url;
  if (first?.kind === 'api') {
    item.apiAttempted = true;
    try {
      const res = await loadApi(first.id);
      const raw = res.ok ? (res.data?.image?.original_url ?? res.data?.image?.url) : undefined;
      if (isSafeHttpsUrl(raw) && isImageDownloadUrl(raw)) {
        item.originalUrl = raw;
        item.originalState = 'ready';
        return raw;
      }
    } catch {
      /* fall through */
    }
    const second = resolveOriginal(item, 'after-strip-error');
    if (second && second.kind !== 'api' && isImageDownloadUrl(second.url)) return second.url;
  }
  return isImageDownloadUrl(item.previewUrl) ? item.previewUrl : null;
}

function extensionChrome(): typeof chrome | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome;
}

/** Ask only for image origins. The permissions.request call is synchronous. */
export async function requestBatchAccess(origins: string[]): Promise<boolean> {
  const list = allowedBatchOrigins(origins);
  if (list.length === 0) return true;
  const api = extensionChrome()?.permissions;
  if (!api?.request) return false;
  try {
    return await api.request({ origins: list });
  } catch {
    return false;
  }
}

export type SaveDirectory = {
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
};

/** One folder prompt, same save id as the viewer. Cancel returns null. */
export async function pickSaveDirectory(): Promise<SaveDirectory | null> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (opts: { id?: string; mode?: string; startIn?: string }) => Promise<SaveDirectory>;
    }
  ).showDirectoryPicker;
  if (typeof picker !== 'function') return null;
  try {
    return await picker({ id: 'goonview-save', mode: 'readwrite', startIn: 'downloads' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

export async function writeImageFile(dir: SaveDirectory, filename: string, blob: Blob): Promise<void> {
  const base = filename.split('/').pop() || filename;
  if (!base || base === '.' || base === '..') throw new Error('bad name');
  const handle = await dir.getFileHandle(base, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function ensureBatchAccess(origins: string[]): Promise<boolean> {
  if (extensionChrome()?.permissions?.request) return requestBatchAccess(origins);
  try {
    const res = await extensionChrome()?.runtime.sendMessage<BgRequest, BgResponse>({
      type: 'ENSURE_BATCH_ACCESS',
      origins: allowedBatchOrigins(origins),
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function startChromeDownload(url: string, filename: string): Promise<void> {
  if (!isSafeDownloadUrl(url) || !isSafeBatchPath(filename)) throw new Error('bad download');
  const api = extensionChrome()?.downloads;
  if (!api?.download) throw new Error('downloads unavailable');
  await api.download({
    url,
    filename,
    saveAs: false,
    conflictAction: 'uniquify',
  });
}

export async function downloadBatchFile(opts: { url: string; filename: string }): Promise<void> {
  if (extensionChrome()?.downloads?.download) {
    await startChromeDownload(opts.url, opts.filename);
    return;
  }
  const runtime = extensionChrome()?.runtime;
  if (!runtime?.sendMessage) throw new Error('downloads unavailable');
  const res = await runtime.sendMessage<BgRequest, BgResponse>({
    type: 'DOWNLOAD_URL',
    url: opts.url,
    filename: opts.filename,
  });
  if (!res?.ok) throw new Error(res?.error || 'download failed');
}

export async function runBatch(items: GalleryItem[], pageUrl: string, deps: BatchDeps): Promise<void> {
  if (items.length === 0 || deps.isCancelled()) return;
  const allowed = await deps.ensure();
  if (deps.isCancelled()) return;
  if (!allowed) {
    deps.onStatus('需要下载权限');
    return;
  }

  deps.onStatus(`下载中 0/${items.length}`);
  const resolved: ({ index: number; url: string } | null)[] = new Array(items.length).fill(null);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (deps.isCancelled()) return;
      const index = cursor++;
      if (index >= items.length) return;
      let url: string | null = null;
      try {
        url = await deps.resolve(items[index]!);
      } catch {
        url = null;
      }
      if (url && isSafeDownloadUrl(url)) resolved[index] = { index, url };
    }
  };
  const workers = Math.min(3, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  if (deps.isCancelled()) return;

  const unique = dedupeByUrl(resolved.filter((row): row is { index: number; url: string } => row !== null));
  const failedResolve = items.length - resolved.filter((row) => row !== null).length;
  const total = unique.length + failedResolve;
  let ok = 0;
  let failed = failedResolve;
  let finished = failedResolve;
  const slug = threadSlug(pageUrl);
  for (const row of unique) {
    if (deps.isCancelled()) return;
    try {
      await deps.download({ url: row.url, filename: batchPath(slug, row.index, row.url) });
      ok += 1;
    } catch {
      failed += 1;
    }
    finished += 1;
    deps.onStatus(`下载中 ${finished}/${total}`);
  }
  if (deps.isCancelled()) return;
  deps.onStatus(failed > 0 ? `完成 ${ok}，失败 ${failed}` : `完成 ${ok}`);
}
