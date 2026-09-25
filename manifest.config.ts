import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'GoonView',
  version: '0.1.0',
  description: 'In-page Telegram-style image viewer for simpcity.cr',
  permissions: ['storage'],
  host_permissions: [
    'https://goonbox.cr/*',
    'https://*.cuckcapital.cr/*',
    'https://*.selti-delivery.ru/*',
    'https://simpcity.cr/*',
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://simpcity.cr/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
      all_frames: false,
    },
    {
      matches: ['https://turbo.cr/embed/*'],
      js: ['src/content/embed.ts'],
      run_at: 'document_start',
      all_frames: true,
    },
  ],
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: false,
  },
  action: {
    default_title: 'GoonView',
  },
});
