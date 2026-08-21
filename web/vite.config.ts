import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = path.dirname(fileURLToPath(import.meta.url))

function viteBase(raw: string | undefined): string {
  const value = (raw ?? '/').trim() || '/'
  if (value === '/') return '/'
  const withLead = value.startsWith('/') ? value : `/${value}`
  const trimmed = withLead.replace(/\/+$/, '')
  if (!/^\/[A-Za-z0-9/_-]+$/.test(trimmed)) {
    throw new Error(
      `Invalid BASE_PATH "${raw}". Use a simple path like /umpire.`,
    )
  }
  return `${trimmed}/`
}

const base = viteBase(process.env.BASE_PATH)
const prefix = base === '/' ? '' : base.slice(0, -1)
const proxyRewrite = prefix
  ? (proxyPath: string) => proxyPath.slice(prefix.length)
  : undefined

export default defineConfig({
  base,
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
      [`${prefix}/api`]: {
        target: 'http://localhost:3000',
        ...(proxyRewrite ? {rewrite: proxyRewrite} : {}),
      },
      [`${prefix}/documentation`]: {
        target: 'http://localhost:3000',
        ...(proxyRewrite ? {rewrite: proxyRewrite} : {}),
      },
    },
  },
})
