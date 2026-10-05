# GoonView

在 [simpcity.cr](https://simpcity.cr) 帖内用 Telegram 风格的全屏卡片看图：普通左键不再跳到 goonbox 新标签。

## 功能

- 左键打开当前页 overlay，左右键切换本页已显示的 `img.bbImage`
- 默认显示帖里已经加载的预览；点「加载原图」再拉原图
- 工具栏「在新标签打开」按钮才跳走
- 滚轮缩放，放大后可拖动
- 中键 / Ctrl / Cmd / Shift+点击仍用浏览器原生新标签
- 帖内 turbo.cr 视频画面按站点当前尺寸放大到 2 倍。播放还是站点自己的播放器

## 开发

需要 Node 18+。

```bash
npm install
npm test
npm run build
```

Chrome / Edge：打开 `chrome://extensions`（或 `edge://extensions`）→ 开发者模式 → **加载已解压的扩展程序** → 选本仓库的 `dist/`。

改代码后重新 `npm run build`（或另开一个终端跑 `npm run dev`），再到扩展页点刷新。

## 设置

扩展管理页 → GoonView → 详细信息 → 扩展程序选项。

调试采集：在论坛页控制台执行后刷新：

```js
localStorage.setItem('goonview-debug', '1')
```

右下角会显示 hostname 直方图。确认完再 `localStorage.removeItem('goonview-debug')`。

## 权限

- `storage`：两个开关
- `https://goonbox.cr/*`：加载原图 API
- 另存为若要读 CDN 字节，会在点击时再申请对应图床权限；浏览帖子时不持有 CDN 权限，避免刷新时绕过图片缓存
- 另存为用 `showSaveFilePicker({ id: 'goonview-save' })` 记住上次目录；**不会**出现在 Chrome 最近下载里（扩展无法把自写文件登记进下载记录）

不会注入 goonbox 页面，不会申请 `<all_urls>`。

## 当前范围

看图是 Telegram 风格的预览。turbo.cr 嵌入只放大显示尺寸，不拦截播放、不收藏、不下载。收藏夹 / 按人物归档 / 库页是未来项，见 [`docs/design.md`](docs/design.md) 的 Future work，先不实现。Overlay 里的「另存为」只是当前这张图的系统保存对话框。
