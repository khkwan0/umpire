import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@umpire/web-api': path.resolve(root, 'src/api.ts'),
      '@umpire/plugin-ui': path.resolve(root, 'src/plugin-ui.ts'),
      '@umpire/web-datetime': path.resolve(root, 'src/datetime.ts'),
      '@umpire/web-formatted-timestamp': path.resolve(
        root,
        'src/FormattedTimestamp.tsx',
      ),
    },
  },
  server: {
    port: 8089,
    strictPort: true,
    fs: {
      allow: [root, path.resolve(root, '../plugins')],
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/documentation': 'http://localhost:3000',
    },
  },
})
