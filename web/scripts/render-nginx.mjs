import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function publicPrefix(raw) {
  const value = (raw ?? '/').trim() || '/'
  if (value === '/') return ''
  const withLead = value.startsWith('/') ? value : `/${value}`
  const trimmed = withLead.replace(/\/+$/, '')
  if (!/^\/[A-Za-z0-9/_-]+$/.test(trimmed)) {
    throw new Error(`Invalid BASE_PATH "${raw}". Use a simple path like /umpire.`)
  }
  return trimmed
}

const prefix = publicPrefix(process.env.BASE_PATH)
let conf = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8')
if (prefix) {
  if (!conf.includes('index index.html;')) {
    throw new Error('nginx.conf missing `index index.html;`')
  }
  const block = `
  location = ${prefix} {
    return 301 ${prefix}/;
  }
  location ${prefix}/ {
    rewrite ^${prefix}/(.*)$ /$1 last;
  }
`
  conf = conf.replace('index index.html;', `index index.html;${block}`)
}

const out = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'nginx.generated.conf')
fs.writeFileSync(out, conf)
