import { isSafeBatchPath, requestBatchAccess, startChromeDownload } from '../content/batch-download';
import { arrayBufferToBase64, fetchImageBytes, isSafeDownloadUrl, loadGoonBoxApi } from '../content/original';
import type { BgRequest, BgResponse } from '../shared/types';

chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
  if (msg?.type === 'FETCH_GOONBOX_IMAGE') {
    const id = typeof msg.id === 'string' && /^[A-Za-z0-9_-]+$/.test(msg.id) ? msg.id : null;
    if (!id) {
      sendResponse({ ok: false, error: 'bad id' });
      return;
    }
    void loadGoonBoxApi(id).then(sendResponse);
    return true;
  }

  if (msg?.type === 'ENSURE_BATCH_ACCESS') {
    const origins = Array.isArray(msg.origins)
      ? msg.origins.filter((origin): origin is string => typeof origin === 'string')
      : [];
    // Call request() before any await so the content-script click gesture is still active.
    void requestBatchAccess(origins).then(
      (ok) => sendResponse(ok ? { ok: true } : { ok: false, error: 'denied' }),
      (err) => sendResponse({ ok: false, error: String(err) }),
    );
    return true;
  }

  if (msg?.type === 'DOWNLOAD_URL') {
    if (!isSafeDownloadUrl(msg.url) || !isSafeBatchPath(msg.filename)) {
      sendResponse({ ok: false, error: 'bad download' });
      return;
    }
    void startChromeDownload(msg.url, msg.filename).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err) }),
    );
    return true;
  }

  if (msg?.type === 'FETCH_IMAGE_BYTES') {
    if (!isSafeDownloadUrl(msg.url)) {
      sendResponse({ ok: false, error: 'bad url' });
      return;
    }
    void fetchImageBytes(msg.url).then((res) => {
      if (!res.ok) {
        sendResponse({ ok: false, error: res.error });
        return;
      }
      sendResponse({ ok: true, base64: arrayBufferToBase64(res.buffer), mime: res.mime });
    });
    return true;
  }

});
