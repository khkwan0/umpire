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

function proxyHeaders(includeUpgrade = false) {
  const lines = [
    '    proxy_http_version 1.1;',
    '    proxy_set_header Host $host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Proto $scheme;',
  ]
  if (includeUpgrade) {
    lines.push('    proxy_set_header Upgrade $http_upgrade;')
    lines.push('    proxy_set_header Connection $connection_upgrade;')
  }
  return lines.join('\n')
}

function prefixedApiLocations(prefix) {
  const h = proxyHeaders
  return `
  location = ${prefix} {
    return 301 ${prefix}/;
  }

  location ${prefix}/api/agent/ws {
    proxy_pass http://api:3000/api/agent/ws;
${h(true)}
    proxy_read_timeout 1d;
    proxy_send_timeout 1d;
  }

  location ${prefix}/api/ws {
    proxy_pass http://api:3000/api/ws;
${h(true)}
    proxy_read_timeout 1d;
    proxy_send_timeout 1d;
  }

  location ${prefix}/api/stream {
    proxy_pass http://api:3000/api/stream;
${h(false)}
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1d;
    proxy_send_timeout 1d;
  }

  location ${prefix}/api/ {
    proxy_pass http://api:3000/api/;
${h(false)}
    proxy_set_header X-Forwarded-Prefix ${prefix};
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
  }

  location = ${prefix}/documentation {
    return 301 ${prefix}/documentation/;
  }

  location ${prefix}/documentation/ {
    proxy_pass http://api:3000/documentation/;
${h(false)}
    proxy_set_header X-Forwarded-Prefix ${prefix};
  }

  location ${prefix}/ {
    rewrite ^${prefix}/(.*)$ /$1 last;
  }
`
}

function stripPrefixProxyHeaders(prefix) {
  return `
    proxy_set_header X-Forwarded-Prefix ${prefix};`
}

function patchStripPrefixLocations(conf, prefix) {
  const header = stripPrefixProxyHeaders(prefix)
  return conf
    .replace(
      `  location /api/ {
    proxy_pass http://api:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
  }`,
      `  location /api/ {
    proxy_pass http://api:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;${header}
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
  }`,
    )
    .replace(
      `  location /documentation/ {
    proxy_pass http://api:3000/documentation/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }`,
      `  location /documentation/ {
    proxy_pass http://api:3000/documentation/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;${header}
  }`,
    )
}

const prefix = publicPrefix(process.env.BASE_PATH)
let conf = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8')
if (prefix) {
  if (!conf.includes('index index.html;')) {
    throw new Error('nginx.conf missing `index index.html;`')
  }
  conf = conf.replace(
    'index index.html;',
    `index index.html;${prefixedApiLocations(prefix)}`,
  )
  conf = patchStripPrefixLocations(conf, prefix)
}

const out = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'nginx.generated.conf')
fs.writeFileSync(out, conf)
