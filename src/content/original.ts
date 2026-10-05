import type {
  BgRequest,
  BgResponse,
  GalleryItem,
  GoonBoxImagePayload,
  ResolvePhase,
  ResolveResult,
} from '../shared/types';

const CHEVERETO_SIZE = /\.(?:th|md|fr)(\.[a-z0-9]+)$/i;
const MAX_JSON_BYTES = 64 * 1024;

const FAMILY_APEX = [
  'goonbox.cr',
  'cuckcapital.cr',
  'selti-delivery.ru',
  'jpg.church',
  'jpg6.su',
  'jpg7.cr',
  'host.church',
] as const;

export function stripCheveretoSizeSuffix(url: string): string {
  const u = new URL(url, 'https://example.invalid');
  u.pathname = u.pathname.replace(CHEVERETO_SIZE, '$1');
  return u.toString();
}

export function isFamilyHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return FAMILY_APEX.some((apex) => h === apex || h.endsWith('.' + apex));
}

export function isGoonBoxHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'goonbox.cr' || h.endsWith('.goonbox.cr');
}

export function parseGoonBoxId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'img' || !parts[1]) return null;
  const segment = parts[1];
  const id = segment.includes('.') ? segment.slice(segment.lastIndexOf('.') + 1) : segment;
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

export function goonBoxIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!isGoonBoxHost(u.hostname)) return null;
    return parseGoonBoxId(u.pathname);
  } catch {
    return null;
  }
}

export function isXfAttachmentUrl(raw: string, base = defaultBase()): boolean {
  try {
    const u = new URL(raw, base);
    if (u.origin !== new URL(base).origin) return false;
    const p = u.pathname;
    return p.startsWith('/attachments/') || p.startsWith('/data/attachments/');
  } catch {
    return false;
  }
}

export function unwrapRedirect(raw: string, base = defaultBase()): string {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return raw;
  }
  const p = u.pathname;
  if (
    u.origin === new URL(base).origin &&
    (p === '/redirect' || p === '/redirect/') &&
    u.searchParams.has('to')
  ) {
    const to = u.searchParams.get('to') ?? '';
    try {
      const b64 = to.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const decoded = atob(padded);
      if (decoded.startsWith('https://') || decoded.startsWith('http://')) {
        return decoded;
      }
    } catch {
      /* illegal payload */
    }
  }
  return u.toString();
}

export function unwrapXfProxy(raw: string, base = defaultBase()): string {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return raw;
  }
  if (u.origin === new URL(base).origin && /\/proxy\.php$/i.test(u.pathname)) {
    const inner = u.searchParams.get('image');
    if (inner) {
      try {
        const v = new URL(inner);
        if (v.protocol === 'https:' || v.protocol === 'http:') return v.toString();
      } catch {
        /* ignore */
      }
    }
  }
  return u.toString();
}

export function hasImageExtension(url: string): boolean {
  try {
    const last = new URL(url, 'https://example.invalid').pathname.split('/').pop() ?? '';
    return /\.(?:jpe?g|png|gif|webp|avif|bmp)$/i.test(last);
  } catch {
    return false;
  }
}

export function isSafeHttpsUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function isSafeDownloadUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.startsWith('data:') || raw.startsWith('blob:')) return false;
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Pattern for chrome.permissions; required goonbox.cr is already granted. */
export function downloadOriginPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

export async function ensureDownloadOriginAccess(url: string): Promise<boolean> {
  const pattern = downloadOriginPattern(url);
  if (!pattern) return false;
  const api = chrome.permissions;
  if (!api?.contains || !api.request) return false;
  try {
    if (await api.contains({ origins: [pattern] })) return true;
    return await api.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

export function sanitizeDownloadFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'image';
  let last = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 180);
  if (!last) last = 'image';
  if (!/\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(last)) last += '.jpg';
  return last;
}

export function suggestedDownloadFilename(url: string): string {
  let last = 'image';
  try {
    last = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
  } catch {
    /* keep default */
  }
  return sanitizeDownloadFilename(last);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + size)));
  }
  return btoa(chunks.join(''));
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function fetchImageBytes(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; buffer: ArrayBuffer; mime: string } | { ok: false; error: string }> {
  if (!isSafeDownloadUrl(url)) return { ok: false, error: 'bad url' };
  try {
    const r = await fetcher(url, { credentials: 'omit', redirect: 'follow', cache: 'force-cache' });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const mime = r.headers.get('content-type') || 'application/octet-stream';
    if (mime.includes('text/html')) return { ok: false, error: 'not an image' };
    const buffer = await r.arrayBuffer();
    if (buffer.byteLength < 24 || buffer.byteLength > 80 * 1024 * 1024) {
      return { ok: false, error: 'bad size' };
    }
    return { ok: true, buffer, mime };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function isAllowedApiUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port !== '') return false;
  if (u.hostname !== 'goonbox.cr') return false;
  if (u.search !== '' || u.hash !== '') return false;
  return /^\/api\/images\/[A-Za-z0-9_-]+$/.test(u.pathname);
}

function defaultBase(): string {
  try {
    return location.href;
  } catch {
    return 'https://simpcity.cr/';
  }
}

function tryStrip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return null;
  }
  if (!isFamilyHost(host)) return null;
  const stripped = stripCheveretoSizeSuffix(raw);
  return stripped !== raw ? stripped : null;
}

export function firstStripCandidate(item: GalleryItem, base = defaultBase()): string | null {
  const previewInner = unwrapXfProxy(item.previewUrl, base);
  const fromInner = tryStrip(previewInner);
  if (fromInner) return fromInner;
  if (item.previewUrl !== previewInner) {
    const fromPreview = tryStrip(item.previewUrl);
    if (fromPreview) return fromPreview;
  }
  for (const c of [item.unwrappedHref, item.dataUrl, item.wrapperDataSrc]) {
    const s = tryStrip(c);
    if (s) return s;
  }
  return null;
}

export function goonBoxIdFromItem(item: GalleryItem, base = defaultBase()): string | null {
  const previewInner = unwrapXfProxy(item.previewUrl, base);
  for (const raw of [item.unwrappedHref, item.dataUrl, item.wrapperDataSrc, previewInner]) {
    if (!raw) continue;
    const id = goonBoxIdFromUrl(raw);
    if (id) return id;
  }
  return null;
}

function firstAttachmentUrl(item: GalleryItem, base: string): string | null {
  const previewInner = unwrapXfProxy(item.previewUrl, base);
  for (const raw of [item.unwrappedHref, item.dataUrl, item.wrapperDataSrc, item.previewUrl, previewInner]) {
    if (!raw) continue;
    if (isXfAttachmentUrl(raw, base)) return new URL(raw, base).toString();
  }
  return null;
}

function firstDirectUrl(item: GalleryItem, base: string): string | null {
  const previewInner = unwrapXfProxy(item.previewUrl, base);
  for (const raw of [item.unwrappedHref, item.dataUrl, item.wrapperDataSrc, previewInner]) {
    if (!raw) continue;
    try {
      const u = new URL(raw, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      if (isFamilyHost(u.hostname)) continue;
      if (hasImageExtension(u.toString())) return u.toString();
    } catch {
      /* skip */
    }
  }
  return null;
}

function fallbackAttachOrDirect(item: GalleryItem, base: string): ResolveResult | null {
  const att = firstAttachmentUrl(item, base);
  if (att) return { kind: 'attachment', url: att };
  const direct = firstDirectUrl(item, base);
  if (direct) return { kind: 'direct', url: direct };
  return null;
}

export function resolveOriginal(
  item: GalleryItem,
  phase: ResolvePhase,
  base = defaultBase(),
): ResolveResult | null {
  if (phase === 'strip') {
    const stripped = firstStripCandidate(item, base);
    if (stripped) return { kind: 'strip', url: stripped };
    return resolveOriginal(item, 'after-strip-error', base);
  }
  if (phase === 'after-strip-error') {
    if (!item.apiAttempted) {
      const id = goonBoxIdFromItem(item, base);
      if (id) return { kind: 'api', id };
    }
    return fallbackAttachOrDirect(item, base);
  }
  return null;
}

export async function loadGoonBoxApi(
  id: string,
  fetcher: typeof fetch = fetch,
  hop = 0,
): Promise<BgResponse> {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, error: 'bad id' };
  const url = `https://goonbox.cr/api/images/${id}`;
  return fetchJsonWhitelisted(url, hop, fetcher);
}

export async function fetchJsonWhitelisted(
  url: string,
  hop: number,
  fetcher: typeof fetch = fetch,
): Promise<BgResponse> {
  if (!isAllowedApiUrl(url) || hop > 1) return { ok: false, error: 'url not allowed' };
  try {
    const r = await fetcher(url, { credentials: 'omit', redirect: 'follow' });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const text = await r.text();
    if (text.length > MAX_JSON_BYTES) return { ok: false, error: 'payload too large' };
    const data = JSON.parse(text) as GoonBoxImagePayload;
    if (typeof data.redirect === 'string' && hop === 0) {
      return fetchJsonWhitelisted(data.redirect, 1, fetcher);
    }
    const orig = data.image?.original_url ?? data.image?.url;
    if (!isSafeHttpsUrl(orig)) return { ok: false, error: 'no https original_url' };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function fetchGoonBoxImage(id: string): Promise<BgResponse> {
  return chrome.runtime.sendMessage<BgRequest, BgResponse>({
    type: 'FETCH_GOONBOX_IMAGE',
    id,
  });
}

export function openTabTarget(item: GalleryItem): string {
  if (item.originalState === 'ready' && item.originalUrl) return item.originalUrl;
  return item.unwrappedHref || item.previewUrl;
}

export function copyTarget(item: GalleryItem): string {
  return openTabTarget(item);
}
