import { describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../shared/types';
import {
  batchFilename,
  dedupeByUrl,
  ensureBatchAccess,
  isSafeBatchPath,
  resolveOriginalUrl,
  runBatch,
  threadSlug,
} from './batch-download';

function item(preview: string, extra: Partial<GalleryItem> = {}): GalleryItem {
  return {
    previewUrl: preview,
    wrapperHref: null,
    unwrappedHref: null,
    dataUrl: null,
    wrapperDataSrc: null,
    alt: '',
    originalState: 'idle',
    ...extra,
  };
}

describe('batch download names', () => {
  it('reads the thread slug and numbers the original filename', () => {
    expect(threadSlug('https://simpcity.cr/threads/some-name.12345/')).toBe('some-name');
    expect(threadSlug('https://simpcity.cr/threads/some-name.12345/page-2')).toBe('some-name');
    expect(threadSlug('https://simpcity.cr/forums/a.1/')).toBe('thread');
    expect(threadSlug('https://simpcity.cr/threads/foo..bar.9/')).toBe('foo_bar');
    expect(batchFilename(0, 'https://x.cr/images4/a.md.jpg?x=1')).toBe('001-a.md.jpg');
  });

  it('keeps the first index when the same final url appears twice', () => {
    expect(
      dedupeByUrl([
        { index: 2, url: 'https://a.cr/b.jpg' },
        { index: 0, url: 'https://a.cr/a.jpg' },
        { index: 1, url: 'https://a.cr/a.jpg' },
      ]),
    ).toEqual([
      { index: 0, url: 'https://a.cr/a.jpg' },
      { index: 2, url: 'https://a.cr/b.jpg' },
    ]);
  });

  it('rejects download paths outside GoonView/<slug>/<file>', () => {
    expect(isSafeBatchPath('GoonView/some-name/001-a.jpg')).toBe(true);
    expect(isSafeBatchPath('GoonView/../001-a.jpg')).toBe(false);
    expect(isSafeBatchPath('/etc/passwd')).toBe(false);
    expect(isSafeBatchPath('GoonView/slug/nested/001-a.jpg')).toBe(false);
  });
});

describe('resolveOriginalUrl', () => {
  it('does not download a json url', async () => {
    const pic = item('https://cdn.example/10000020092726a78b1ab1e4eb.json');
    const loadApi = vi.fn(async () => ({ ok: false as const, error: 'no' }));
    expect(await resolveOriginalUrl(pic, loadApi)).toBeNull();
    expect(loadApi).not.toHaveBeenCalled();
  });

  it('uses the stripped url and does not call the API', async () => {
    const pic = item('https://simp6.cuckcapital.cr/images4/a.md.jpg');
    const loadApi = vi.fn(async () => ({ ok: false as const, error: 'no' }));
    const url = await resolveOriginalUrl(pic, loadApi);
    expect(url).toBe('https://simp6.cuckcapital.cr/images4/a.jpg');
    expect(loadApi).not.toHaveBeenCalled();
    expect(pic.originalState).toBe('idle');
  });
});

describe('runBatch', () => {
  const page = 'https://simpcity.cr/threads/some-name.12345/';

  it('downloads one file when two items share a url', async () => {
    const download = vi.fn(async () => {});
    const statuses: string[] = [];
    await runBatch(
      [item('https://cdn.example/a.jpg'), item('https://cdn.example/a.jpg')],
      page,
      {
        resolve: async (pic) => pic.previewUrl,
        ensure: async () => true,
        download,
        onStatus: (text) => statuses.push(text),
        isCancelled: () => false,
      },
    );
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith({
      url: 'https://cdn.example/a.jpg',
      filename: 'GoonView/some-name/001-a.jpg',
    });
    expect(statuses.at(-1)).toBe('完成 1');
  });

  it('starts no downloads when the batch is already cancelled', async () => {
    const download = vi.fn(async () => {});
    await runBatch([item('https://cdn.example/a.jpg')], page, {
      resolve: async (pic) => pic.previewUrl,
      ensure: async () => true,
      download,
      onStatus: () => {},
      isCancelled: () => true,
    });
    expect(download).not.toHaveBeenCalled();
  });

  it('reports resolve failures and stops when permission is denied', async () => {
    const download = vi.fn(async () => {});
    const statuses: string[] = [];
    await runBatch([item('https://cdn.example/a.jpg'), item('https://cdn.example/missing.jpg')], page, {
      resolve: async (pic) => (pic.previewUrl.includes('missing') ? null : pic.previewUrl),
      ensure: async () => true,
      download,
      onStatus: (text) => statuses.push(text),
      isCancelled: () => false,
    });
    expect(statuses.at(-1)).toBe('完成 1，失败 1');

    statuses.length = 0;
    await runBatch([item('https://cdn.example/a.jpg')], page, {
      resolve: async () => {
        throw new Error('should not resolve');
      },
      ensure: async () => false,
      download,
      onStatus: (text) => statuses.push(text),
      isCancelled: () => false,
    });
    expect(statuses).toEqual(['需要下载权限']);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('resolves at most three images at once', async () => {
    let started = 0;
    const release: (() => void)[] = [];
    const pending = runBatch(
      Array.from({ length: 6 }, (_, i) => item(`https://cdn.example/${i}.jpg`)),
      page,
      {
        resolve: (pic) => {
          started += 1;
          return new Promise((resolve) => {
            release.push(() => resolve(pic.previewUrl));
          });
        },
        ensure: async () => true,
        download: async () => {},
        onStatus: () => {},
        isCancelled: () => false,
      },
    );
    await vi.waitUntil(() => started === 3);
    expect(release).toHaveLength(3);
    release.splice(0).forEach((done) => done());
    await vi.waitUntil(() => started === 6);
    release.splice(0).forEach((done) => done());
    await pending;
  });
});

describe('ensureBatchAccess', () => {
  it('asks the service worker only for known optional origins', async () => {
    const sent: unknown[] = [];
    Object.assign(globalThis, {
      chrome: {
        runtime: {
          sendMessage: async (msg: unknown) => {
            sent.push(msg);
            return { ok: true };
          },
        },
      },
    });
    const ok = await ensureBatchAccess(['https://*.cuckcapital.cr/*', 'https://evil.example/*']);
    expect(ok).toBe(true);
    expect(sent).toEqual([
      { type: 'ENSURE_BATCH_ACCESS', origins: ['https://*.cuckcapital.cr/*'] },
    ]);
  });
});
