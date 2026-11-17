import { describe, expect, it } from 'vitest';
import type { GalleryItem } from '../shared/types';
import {
  fetchJsonWhitelisted,
  firstStripCandidate,
  goonBoxIdFromUrl,
  hasImageExtension,
  isAllowedApiUrl,
  isFamilyHost,
  isGoonBoxHost,
  isSafeDownloadUrl,
  downloadOriginPattern,
  isSafeHttpsUrl,
  isXfAttachmentUrl,
  parseGoonBoxId,
  preferredOriginalUrl,
  resolveOriginal,
  sanitizeDownloadFilename,
  stripCheveretoSizeSuffix,
  suggestedDownloadFilename,
  arrayBufferToBase64,
  base64ToUint8Array,
  fetchGoonBoxImage,
  fetchImageBytes,
  unwrapRedirect,
  unwrapXfProxy,
} from './original';

const BASE = 'https://simpcity.cr/threads/x.1/';

function item(partial: Partial<GalleryItem> & { previewUrl: string }): GalleryItem {
  return {
    wrapperHref: null,
    unwrappedHref: null,
    dataUrl: null,
    wrapperDataSrc: null,
    alt: '',
    originalState: 'idle',
    ...partial,
  };
}

describe('isFamilyHost', () => {
  it('matches apex and subdomains', () => {
    expect(isFamilyHost('goonbox.cr')).toBe(true);
    expect(isFamilyHost('www.goonbox.cr')).toBe(true);
    expect(isFamilyHost('simp6.cuckcapital.cr')).toBe(true);
    expect(isFamilyHost('simp6.selti-delivery.ru')).toBe(true);
    expect(isFamilyHost('simp4.selti-delivery.ru')).toBe(true);
    expect(isFamilyHost('jpg6.su')).toBe(true);
  });

  it('rejects lookalikes', () => {
    expect(isFamilyHost('notcuckcapital.cr')).toBe(false);
    expect(isFamilyHost('cuckcapital.cr.evil.test')).toBe(false);
    expect(isFamilyHost('pixhost.to')).toBe(false);
  });
});

describe('isGoonBoxHost', () => {
  it('only goonbox', () => {
    expect(isGoonBoxHost('goonbox.cr')).toBe(true);
    expect(isGoonBoxHost('www.goonbox.cr')).toBe(true);
    expect(isGoonBoxHost('jpg6.su')).toBe(false);
    expect(isGoonBoxHost('cuckcapital.cr')).toBe(false);
  });
});

describe('parseGoonBoxId / goonBoxIdFromUrl', () => {
  it('takes last dot token of /img/ segment', () => {
    expect(parseGoonBoxId('/img/tgDoR4y')).toBe('tgDoR4y');
    expect(parseGoonBoxId('/img/un-pewito-choro.NcY')).toBe('NcY');
    expect(parseGoonBoxId('/img/title.encodedId')).toBe('encodedId');
  });

  it('rejects jpg6 /img/ for API', () => {
    expect(goonBoxIdFromUrl('https://jpg6.su/img/abc')).toBeNull();
    expect(goonBoxIdFromUrl('https://goonbox.cr/img/tgDoR4y')).toBe('tgDoR4y');
    expect(goonBoxIdFromUrl('https://www.goonbox.cr/img/title.encodedId')).toBe('encodedId');
  });
});

describe('stripCheveretoSizeSuffix', () => {
  it('strips .md. .th. .fr. in filename only', () => {
    expect(stripCheveretoSizeSuffix('https://simp6.cuckcapital.cr/images4/a.md.jpg')).toBe(
      'https://simp6.cuckcapital.cr/images4/a.jpg',
    );
    expect(stripCheveretoSizeSuffix('https://x.cr/a.th.webp')).toBe('https://x.cr/a.webp');
    expect(stripCheveretoSizeSuffix('https://x.cr/a.fr.png')).toBe('https://x.cr/a.png');
    expect(stripCheveretoSizeSuffix('https://x.cr/a.jpg')).toBe('https://x.cr/a.jpg');
  });
});

describe('unwrapRedirect', () => {
  it('decodes /redirect/?to= base64', () => {
    const target = 'https://goonbox.cr/img/tgDoR4y';
    const to = btoa(target);
    const href = `https://simpcity.cr/redirect/?to=${to}`;
    expect(unwrapRedirect(href, BASE)).toBe(target);
  });

  it('does not match /redirect-extra', () => {
    const href = 'https://simpcity.cr/redirect-extra/?to=aaaa';
    expect(unwrapRedirect(href, BASE)).toBe(href);
  });
});

describe('unwrapXfProxy', () => {
  it('unwraps proxy.php?image=', () => {
    const inner = 'https://simp6.cuckcapital.cr/x.md.jpg';
    const src = `https://simpcity.cr/proxy.php?image=${encodeURIComponent(inner)}`;
    expect(unwrapXfProxy(src, BASE)).toBe(inner);
  });
});

describe('isXfAttachmentUrl', () => {
  it('uses pathname prefix, same origin', () => {
    expect(isXfAttachmentUrl('https://simpcity.cr/attachments/1', BASE)).toBe(true);
    expect(isXfAttachmentUrl('/attachments/foo.jpg', BASE)).toBe(true);
    expect(isXfAttachmentUrl('/data/attachments/1', BASE)).toBe(true);
    expect(isXfAttachmentUrl('https://simpcity.cr/not-attachments/x', BASE)).toBe(false);
    expect(isXfAttachmentUrl('https://evil.cr/attachments/1', BASE)).toBe(false);
  });
});

describe('hasImageExtension / isSafeHttpsUrl / isAllowedApiUrl', () => {
  it('tests last path segment', () => {
    expect(hasImageExtension('https://x.cr/a.jpg?foo=bar.png')).toBe(true);
    expect(hasImageExtension('https://x.cr/show/foo')).toBe(false);
  });

  it('rejects javascript and userinfo', () => {
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpsUrl('https://user:pass@goonbox.cr/x')).toBe(false);
    expect(isSafeHttpsUrl('https://cdn.example/a.jpg')).toBe(true);
  });

  it('save-as url and filename', () => {
    expect(isSafeDownloadUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeDownloadUrl('data:image/png;base64,xx')).toBe(false);
    expect(isSafeDownloadUrl('https://cdn.example/a.jpg')).toBe(true);
    expect(sanitizeDownloadFilename('../../etc/passwd')).toBe('passwd.jpg');
    expect(sanitizeDownloadFilename('foo.webp')).toBe('foo.webp');
    expect(suggestedDownloadFilename('https://x.cr/images4/a.md.jpg?x=1')).toBe('a.md.jpg');
    expect(downloadOriginPattern('https://simp6.cuckcapital.cr/images4/a.md.jpg')).toBe(
      'https://simp6.cuckcapital.cr/*',
    );
    expect(downloadOriginPattern('javascript:alert(1)')).toBeNull();
  });

  it('roundtrips image bytes through base64 for extension messaging', () => {
    const src = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x7b]);
    const b64 = arrayBufferToBase64(src.buffer);
    expect(b64).not.toContain('object');
    expect(Array.from(base64ToUint8Array(b64))).toEqual(Array.from(src));
  });

  it('prefers original_url and ignores a medium url', () => {
    const original = 'https://simp6.cuckcapital.cr/images4/49f34841-0374-431e-bebf-ec3172e4713e.jpg';
    const medium = 'https://simp6.cuckcapital.cr/images4/2dca4818-c0ab-463f-8d48-0fa6ab908b1f.jpg';
    expect(
      preferredOriginalUrl({
        image: { original_url: original, medium_url: medium, url: '' },
      }),
    ).toBe(original);
    expect(preferredOriginalUrl({ image: { url: medium, medium_url: medium } })).toBeUndefined();
  });

  it('allows only goonbox.cr /api/images/{id}', () => {
    expect(isAllowedApiUrl('https://goonbox.cr/api/images/tgDoR4y')).toBe(true);
    expect(isAllowedApiUrl('https://www.goonbox.cr/api/images/tgDoR4y')).toBe(false);
    expect(isAllowedApiUrl('https://goonbox.cr/api/images/tgDoR4y?x=1')).toBe(false);
    expect(isAllowedApiUrl('https://goonbox.cr:444/api/images/x')).toBe(false);
    expect(isAllowedApiUrl('https://evil.cr/api/images/x')).toBe(false);
  });
});

describe('resolveOriginal D6 order', () => {
  it('asks the API when a goonbox id exists, even if the preview suffix strips', () => {
    const medium = 'https://simp6.cuckcapital.cr/images4/2dca4818-c0ab-463f-8d48-0fa6ab908b1f.md.jpg';
    const g = item({
      previewUrl: medium,
      unwrappedHref: 'https://goonbox.cr/img/tdd6IOy',
    });
    expect(firstStripCandidate(g, BASE)).toBe(
      'https://simp6.cuckcapital.cr/images4/2dca4818-c0ab-463f-8d48-0fa6ab908b1f.jpg',
    );
    expect(resolveOriginal(g, 'strip', BASE)).toEqual({ kind: 'api', id: 'tdd6IOy' });
  });

  it('uses the API for a medium UUID that has no size suffix', () => {
    const g = item({
      previewUrl: 'https://simp6.cuckcapital.cr/images4/2dca4818-c0ab-463f-8d48-0fa6ab908b1f.jpg',
      unwrappedHref: 'https://goonbox.cr/img/tdd6IOy',
    });
    expect(resolveOriginal(g, 'strip', BASE)).toEqual({ kind: 'api', id: 'tdd6IOy' });
  });

  it('jpg6 /img/ does not request goonbox API', () => {
    const g = item({
      previewUrl: 'https://jpg6.su/images/a.md.jpg',
      unwrappedHref: 'https://jpg6.su/img/abc',
    });
    const strip = resolveOriginal(g, 'strip', BASE);
    expect(strip?.kind).toBe('strip');
    const after = resolveOriginal(g, 'after-strip-error', BASE);
    expect(after).toBeNull();
  });

  it('falls to API after strip no-op when goonbox id exists', () => {
    const g = item({
      previewUrl: 'https://simp6.cuckcapital.cr/images4/uuid.jpg',
      unwrappedHref: 'https://goonbox.cr/img/title.NcY',
    });
    expect(resolveOriginal(g, 'strip', BASE)).toEqual({ kind: 'api', id: 'NcY' });
  });

  it('after-api-error does not call the API again', () => {
    const g = item({
      previewUrl: 'https://simp6.cuckcapital.cr/images4/uuid.jpg',
      unwrappedHref: 'https://goonbox.cr/img/tgDoR4y',
      apiAttempted: true,
    });
    expect(resolveOriginal(g, 'after-api-error', BASE)).toBeNull();
  });

  it('after-api-error can still strip a suffix', () => {
    const g = item({
      previewUrl: 'https://simp6.cuckcapital.cr/images4/a.md.jpg',
      unwrappedHref: 'https://goonbox.cr/img/tgDoR4y',
      apiAttempted: true,
    });
    expect(resolveOriginal(g, 'after-api-error', BASE)).toEqual({
      kind: 'strip',
      url: 'https://simp6.cuckcapital.cr/images4/a.jpg',
    });
  });

  it('attachments use prefix', () => {
    const g = item({
      previewUrl: 'https://simpcity.cr/data/attachments/0/thumb.jpg',
      dataUrl: 'https://simpcity.cr/attachments/file.jpg',
    });
    expect(resolveOriginal(g, 'after-strip-error', BASE)).toEqual({
      kind: 'attachment',
      url: 'https://simpcity.cr/attachments/file.jpg',
    });
  });
});

describe('fetchJsonWhitelisted', () => {
  it('follows one JSON redirect then requires https original_url', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/api/images/a')) {
        return new Response(JSON.stringify({ redirect: 'https://goonbox.cr/api/images/b' }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({ image: { original_url: 'https://simp6.cuckcapital.cr/orig.jpg' } }),
        { status: 200 },
      );
    };
    const res = await fetchJsonWhitelisted('https://goonbox.cr/api/images/a', 0, fetcher);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      'https://goonbox.cr/api/images/a',
      'https://goonbox.cr/api/images/b',
    ]);
  });

  it('rejects arbitrary redirect hosts', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ redirect: 'https://evil.example/steal' }), { status: 200 });
    const res = await fetchJsonWhitelisted('https://goonbox.cr/api/images/a', 0, fetcher);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('url not allowed');
  });
});

describe('fetchGoonBoxImage', () => {
  it('does not throw when the extension runtime is gone', async () => {
    const previous = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = {};
    try {
      const res = await fetchGoonBoxImage('tgDoR4y');
      expect(res).toEqual({ ok: false, error: 'extension reloaded' });
    } finally {
      if (previous === undefined) delete (globalThis as { chrome?: unknown }).chrome;
      else (globalThis as { chrome?: unknown }).chrome = previous;
    }
  });
});

describe('fetchImageBytes', () => {
  it('sets a simpcity Referer rule around the CDN fetch', async () => {
    const order: string[] = [];
    let rule: { action?: { requestHeaders?: { value?: string }[] }; condition?: { requestDomains?: string[] } } | undefined;
    const previous = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = {
      declarativeNetRequest: {
        updateSessionRules: async (opts: { addRules?: typeof rule[]; removeRuleIds?: number[] }) => {
          if (opts.addRules?.length) {
            order.push('add');
            rule = opts.addRules[0];
          } else {
            order.push('remove');
          }
        },
      },
    };
    const bytes = new Uint8Array(32);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    const fetcher: typeof fetch = async () => {
      order.push('fetch');
      return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    };
    try {
      const res = await fetchImageBytes('https://simp6.cuckcapital.cr/images4/a.jpg', fetcher);
      expect(res.ok).toBe(true);
      expect(order).toEqual(['add', 'fetch', 'remove']);
      expect(rule?.condition?.requestDomains).toEqual(['simp6.cuckcapital.cr']);
      expect(rule?.action?.requestHeaders?.[0]?.value).toBe('https://goonbox.cr/img/');
    } finally {
      if (previous === undefined) delete (globalThis as { chrome?: unknown }).chrome;
      else (globalThis as { chrome?: unknown }).chrome = previous;
    }
  });
});
