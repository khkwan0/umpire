import {defineConfig} from 'wxt'

export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  // Prefer MV3 for both Chrome and Firefox.
  manifestVersion: 3,
  manifest: {
    name: 'UMPIRE',
    description:
      'Companion for self-hosted UMPIRE. Requires your UMPIRE API server. Toolbar health badge and outage notifications.',
    version: '1.0.1',
    permissions: ['storage', 'alarms', 'notifications'],
    // Runtime request only the user's configured origin (see permissions.ts).
    // https for production servers; localhost patterns for local dev.
    optional_host_permissions: [
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://*/*',
    ],
    action: {
      default_title: 'UMPIRE',
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '96': 'icon/96.png',
        '128': 'icon/128.png',
      },
    },
    icons: {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
      '48': 'icon/48.png',
      '96': 'icon/96.png',
      '128': 'icon/128.png',
    },
    options_ui: {
      open_in_tab: true,
      page: 'options.html',
    },
    browser_specific_settings: {
      gecko: {
        id: 'umpire@nitroxstudios.com',
        strict_min_version: '115.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
  suppressWarnings: {
    firefoxDataCollection: true,
  },
})
