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
