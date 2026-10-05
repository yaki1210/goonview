# GoonView

Chrome and Edge extension that keeps you on the thread. A normal left click on a [simpcity.cr](https://simpcity.cr) post image opens a dark, full-screen viewer in the same tab instead of sending you to a GoonBox page.

The viewer works like Telegram: the pictures already on the page, left and right to move between them, and the original file only when you ask for it.

## Install

Chrome and Edge, Manifest V3. The extension matches `https://simpcity.cr/*` only. It does not run on `www.simpcity.cr` or on goonbox.cr.

### Release

1. Download `goonview-0.1.0.zip` from [Releases](https://github.com/yaki1210/goonview/releases).
2. Unzip it. `manifest.json` should sit in the folder you select.
3. Open `chrome://extensions` or `edge://extensions`.
4. Turn on **Developer mode**.
5. Choose **Load unpacked** and select that folder.

### From source

Node 18 or newer.

```bash
npm install
npm test
npm run build
```

Load the `dist/` folder the same way. After you change the code, run `npm run build` again (or `npm run dev` in another terminal) and click **Reload** on the extension card.

## Using it

Left-click a post thumbnail (`img.bbImage` inside `.message-userContent`). The overlay shows the preview the page already loaded. It does not fetch the full original until you ask.

| Action | Result |
| --- | --- |
| Left click a thumbnail | Open the viewer |
| Left / right arrows, or the side buttons | Previous / next image on this page |
| Swipe sideways while at 1× | Previous / next image |
| Mouse wheel | Zoom from 1× to 8×, anchored at the cursor |
| Drag while zoomed | Pan |
| Click the picture | Load the original |
| Sparkles button | Load the original |
| Click the dark area around the picture | Close |
| `Esc` | Leave fullscreen, then close |
| `F` or the fullscreen button | Toggle fullscreen |
| Middle click, or Ctrl / Cmd / Shift + click | Browser’s own new tab |
| Open-in-tab button | Leave the thread on purpose |
| Copy button | Copy the image link |
| Save button | System save dialog for the picture on screen |

The gallery is the thumbnails already rendered on the current document, in document order. Collapsed spoilers stay out until you open them. Avatars, smilies, reactions, and signatures stay out. Other pages and posts that have not loaded yet stay out until the site loads them.

turbo.cr embeds in a post are drawn at twice the site’s layout size. Playback stays the site’s own player. The extension does not intercept video, and it does not download video.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | The two options switches |
| `https://goonbox.cr/*` | GoonBox image API when you load an original |

Save As may ask, once, for the image host (`*.cuckcapital.cr`, `*.selti-delivery.ru`, or `simpcity.cr`). That permission is optional so browsing does not treat thumbnail CDNs as extension-accessible. Chrome would otherwise refetch every cached thumbnail on refresh.

The save dialog is `showSaveFilePicker`. The file is written where you choose. It does not show up in Chrome’s download list.

There is no `<all_urls>` permission, and the extension does not inject into goonbox.cr.

## Options

Extension details → **Extension options**.

- **Click intercept** — left click opens the viewer. Turn it off to restore the site’s own click.
- **Forum attachments** — on by default. Turn it off and XenForo’s lightbox handles `/attachments/` links again. External image hosts still open in GoonView.

To see what the collector found, open the forum page console, run the line below, and refresh. A panel in the corner lists hosts. Remove the key when you are done.

```js
localStorage.setItem('goonview-debug', '1')
```

## Develop

```bash
npm test
npx tsc --noEmit
npm run build
```

TypeScript, Vite 5, and `@crxjs/vite-plugin`. The manifest is `manifest.config.ts`. Tests use Vitest and happy-dom. `dist/` and `node_modules/` are not committed.

Product decisions and the backlog live in [`docs/design.md`](docs/design.md). Favorites, per-person folders, and a library page are written down there and are not built yet.
