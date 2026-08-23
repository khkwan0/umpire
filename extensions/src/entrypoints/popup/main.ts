import './popup.css'
import {browser} from 'wxt/browser'
import {api, ApiError, type Incident, type StatusTarget} from '../../utils/api'
import {shortHost, summarizeTargets, targetHealth} from '../../utils/health'
import {ensureHostPermission} from '../../utils/permissions'
import {getCache, getSettings} from '../../utils/storage'

const root = document.getElementById('app')!

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, string | boolean | undefined>,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === false) continue
      if (k === 'className') node.className = String(v)
      else if (k === 'text') node.textContent = String(v)
      else if (typeof v === 'boolean') node.toggleAttribute(k, v)
      else node.setAttribute(k, v)
    }
  }
  for (const child of children ?? []) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

function healthClass(target: StatusTarget): string {
  return `pill pill-${targetHealth(target)}`
}

function healthText(target: StatusTarget): string {
  const h = targetHealth(target)
  if (h === 'up') return 'Up'
  if (h === 'down') return 'Down'
  if (h === 'partial') return 'Partial'
  if (h === 'disabled') return 'Off'
  return '—'
}

async function requestRefresh(): Promise<void> {
  try {
    await browser.runtime.sendMessage({type: 'refresh'})
  } catch {
    // background may be restarting
  }
}

function renderLogin(baseUrl: string, error?: string): void {
  root.replaceChildren()
  const form = el('form', {className: 'card'}, [
    el('h1', {text: 'UMPIRE'}),
    el('p', {
      className: 'muted',
      text: 'Sign in to view target health.',
    }),
  ])
  if (error) form.append(el('p', {className: 'error', text: error}))

  const user = el('input', {
    type: 'text',
    name: 'username',
    autocomplete: 'username',
    placeholder: 'Username',
    required: true,
  }) as HTMLInputElement
  const pass = el('input', {
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    placeholder: 'Password',
    required: true,
  }) as HTMLInputElement
  const submit = el('button', {type: 'submit', text: 'Log in'}) as HTMLButtonElement

  form.append(user, pass, submit)
  form.append(
    el('button', {
      type: 'button',
      className: 'linkish',
      text: 'Open options',
    }),
  )
  const optionsBtn = form.querySelector('button.linkish') as HTMLButtonElement
  optionsBtn.addEventListener('click', () => {
    void browser.runtime.openOptionsPage()
  })

  form.addEventListener('submit', ev => {
    ev.preventDefault()
    submit.disabled = true
    void (async () => {
      try {
        await api.login(baseUrl, user.value.trim(), pass.value)
        await requestRefresh()
        await render()
      } catch (err) {
        renderLogin(
          baseUrl,
          err instanceof Error ? err.message : 'Login failed',
        )
      }
    })()
  })

  root.append(form)
}

function renderSetup(message: string): void {
  root.replaceChildren(
    el('div', {className: 'card'}, [
      el('h1', {text: 'UMPIRE'}),
      el('p', {className: 'error', text: message}),
      el('button', {type: 'button', id: 'opts', text: 'Open options'}),
    ]),
  )
  root.querySelector('#opts')?.addEventListener('click', () => {
    void browser.runtime.openOptionsPage()
  })
}

function renderDashboard(opts: {
  baseUrl: string
  username: string | null
  targets: StatusTarget[]
  incidents: Incident[]
  lastSyncAt: string | null
  lastError: string | null
}): void {
  const summary = summarizeTargets(opts.targets)
  root.replaceChildren()

  const header = el('header', {className: 'header'}, [
    el('div', {}, [
      el('h1', {text: 'UMPIRE'}),
      el('p', {
        className: 'muted',
        text: opts.username
          ? `Signed in as ${opts.username}`
          : opts.baseUrl.replace(/^https?:\/\//, ''),
      }),
    ]),
  ])

  const actions = el('div', {className: 'actions'})
  const refreshBtn = el('button', {
    type: 'button',
    className: 'ghost',
    text: 'Refresh',
  }) as HTMLButtonElement
  refreshBtn.addEventListener('click', () => {
    refreshBtn.disabled = true
    void requestRefresh().then(() => render())
  })
  actions.append(refreshBtn)

  if (opts.username) {
    const logoutBtn = el('button', {
      type: 'button',
      className: 'ghost',
      text: 'Log out',
    }) as HTMLButtonElement
    logoutBtn.addEventListener('click', () => {
      void api.logout(opts.baseUrl).then(async () => {
        await requestRefresh()
        await render()
      })
    })
    actions.append(logoutBtn)
  }

  const openBtn = el('button', {
    type: 'button',
    className: 'ghost',
    text: 'Open UI',
  }) as HTMLButtonElement
  openBtn.addEventListener('click', () => {
    void browser.tabs.create({url: opts.baseUrl})
  })
  actions.append(openBtn)
  header.append(actions)
  root.append(header)

  if (opts.lastError) {
    root.append(el('p', {className: 'error', text: opts.lastError}))
  }

  root.append(
    el('div', {className: 'summary'}, [
      el('span', {
        className: 'stat up',
        text: `${summary.up} up`,
      }),
      el('span', {
        className: 'stat down',
        text: `${summary.down} down`,
      }),
      el('span', {
        className: 'stat partial',
        text: `${summary.partial} partial`,
      }),
    ]),
  )

  const list = el('ul', {className: 'targets'})
  const sorted = [...opts.targets].sort((a, b) => {
    const rank = (t: StatusTarget) => {
      const h = targetHealth(t)
      if (h === 'down') return 0
      if (h === 'partial') return 1
      if (h === 'unknown') return 2
      if (h === 'up') return 3
      return 4
    }
    return rank(a) - rank(b) || a.url.localeCompare(b.url)
  })

  for (const target of sorted) {
    const item = el('li', {className: 'target'}, [
      el('div', {className: 'target-main'}, [
        el('strong', {text: shortHost(target.url)}),
        el('span', {
          className: 'muted',
          text: target.group_tag || target.url,
        }),
      ]),
      el('span', {className: healthClass(target), text: healthText(target)}),
    ])
    list.append(item)
  }
  root.append(list)

  const openIncidents = opts.incidents.filter(i => !i.recovered).slice(0, 5)
  if (openIncidents.length > 0) {
    root.append(el('h2', {text: 'Open incidents'}))
    const incList = el('ul', {className: 'incidents'})
    for (const inc of openIncidents) {
      incList.append(
        el('li', {}, [
          el('strong', {text: shortHost(inc.url)}),
          el('span', {
            className: 'muted',
            text: `${inc.status} · ${inc.started_at}${inc.error ? ` · ${inc.error}` : ''}`,
          }),
        ]),
      )
    }
    root.append(incList)
  }

  if (opts.lastSyncAt) {
    root.append(
      el('p', {
        className: 'muted footer',
        text: `Updated ${new Date(opts.lastSyncAt).toLocaleTimeString()}`,
      }),
    )
  }
}

async function render(): Promise<void> {
  root.replaceChildren(el('p', {className: 'muted', text: 'Loading…'}))
  const settings = await getSettings()
  if (!settings.baseUrl) {
    renderSetup('Set your UMPIRE URL in options.')
    return
  }

  const allowed = await ensureHostPermission(settings.baseUrl)
  if (!allowed) {
    renderSetup('Permission to access your UMPIRE site was not granted.')
    return
  }

  try {
    const policy = await api.policy(settings.baseUrl)
    if (policy.login_required) {
      try {
        await api.me(settings.baseUrl)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          renderLogin(settings.baseUrl)
          return
        }
        throw err
      }
    }

    const [status, incidents, cache] = await Promise.all([
      api.status(settings.baseUrl),
      api.incidents(settings.baseUrl, 20),
      getCache(),
    ])

    renderDashboard({
      baseUrl: settings.baseUrl,
      username: cache.username,
      targets: status.targets,
      incidents,
      lastSyncAt: cache.lastSyncAt,
      lastError: cache.lastError,
    })
    await requestRefresh()
  } catch (err) {
    renderSetup(err instanceof Error ? err.message : 'Failed to load status')
  }
}

void render()
