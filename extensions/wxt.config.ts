import {defineConfig} from 'wxt'

export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  // Prefer MV3 for both Chrome and Firefox.
  manifestVersion: 3,
  manifest: {
    name: 'UMPIRE',
    description:
      'Monitor UMPIRE target health and get notified when outages happen.',
    version: '1.0.0',
    permissions: ['storage', 'alarms', 'notifications'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
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
        id: 'umpire@local.umpire',
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
