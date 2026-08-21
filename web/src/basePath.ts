/** Vite `base`, always with a trailing slash (`/` or `/umpire/`). */
const viteBase = import.meta.env.BASE_URL

/** Public path with no trailing slash (`''` at domain root, `/umpire` in a subdirectory). */
export function appBasePath(): string {
  return viteBase.endsWith('/') ? viteBase.slice(0, -1) : viteBase
}

/** React Router basename (`/` or `/umpire`). */
export function routerBasename(): string {
  return appBasePath() || '/'
}

/** Prefix an app-absolute URL (`/api/status` → `/umpire/api/status`). */
export function withBase(path: string): string {
  if (!path.startsWith('/')) return path
  const base = appBasePath()
  return base ? `${base}${path}` : path
}

export function assetUrl(file: string): string {
  return `${viteBase}${file.replace(/^\//, '')}`
}
