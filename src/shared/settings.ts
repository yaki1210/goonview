import { DEFAULT_SETTINGS, type Settings } from './types';

export { DEFAULT_SETTINGS };
export type { Settings };

function area(): chrome.storage.StorageArea {
  try {
    return chrome.storage.sync;
  } catch {
    return chrome.storage.local;
  }
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await area().get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    try {
      const raw = await chrome.storage.local.get(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...raw };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  try {
    await area().set(next);
  } catch {
    await chrome.storage.local.set(next);
  }
}

export function onSettingsChanged(cb: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync' && namespace !== 'local') return;
    if (!('interceptEnabled' in changes) && !('interceptXfAttachments' in changes)) return;
    void loadSettings().then(cb);
  });
}
