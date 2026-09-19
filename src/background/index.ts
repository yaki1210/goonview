import { loadGoonBoxApi } from '../content/original';
import type { BgRequest, BgResponse } from '../shared/types';

chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
  if (msg?.type !== 'FETCH_GOONBOX_IMAGE') return;
  const id = typeof msg.id === 'string' && /^[A-Za-z0-9_-]+$/.test(msg.id) ? msg.id : null;
  if (!id) {
    sendResponse({ ok: false, error: 'bad id' });
    return;
  }
  void loadGoonBoxApi(id).then(sendResponse);
  return true;
});
