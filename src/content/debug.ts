import { getItems, hostHistogram, onGalleryChange } from './collector';

export function startDebug(): void {
  let enabled = false;
  try {
    enabled = localStorage.getItem('goonview-debug') === '1';
  } catch {
    enabled = false;
  }
  if (!enabled) return;

  const panel = document.createElement('div');
  panel.id = 'goonview-debug';
  panel.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:2147483646;max-height:40vh;overflow:auto;background:#111;color:#eee;font:12px/1.4 monospace;padding:8px;border-radius:6px;max-width:420px;opacity:.92';
  document.documentElement.append(panel);

  const render = () => {
    const items = getItems();
    const hist = hostHistogram(items);
    const histLines = Object.entries(hist)
      .sort((a, b) => b[1] - a[1])
      .map(([h, n]) => `${n}\t${h}`)
      .join('\n');
    const rows = items
      .slice(0, 40)
      .map((it, i) => `${i + 1}\t${it.previewUrl.slice(0, 80)}`)
      .join('\n');
    panel.textContent = `GoonView debug (${items.length})\n${histLines}\n---\n${rows}`;
  };

  onGalleryChange(render);
  render();
}
