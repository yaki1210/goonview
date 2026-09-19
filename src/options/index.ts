import { loadSettings, saveSettings } from '../shared/settings';

const enabled = document.getElementById('interceptEnabled') as HTMLInputElement;
const xf = document.getElementById('interceptXfAttachments') as HTMLInputElement;

void loadSettings().then((s) => {
  enabled.checked = s.interceptEnabled;
  xf.checked = s.interceptXfAttachments;
});

function persist(): void {
  void saveSettings({
    interceptEnabled: enabled.checked,
    interceptXfAttachments: xf.checked,
  });
}

enabled.addEventListener('change', persist);
xf.addEventListener('change', persist);
