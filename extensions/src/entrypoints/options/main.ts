import './options.css'
import {browser} from 'wxt/browser'
import {canonicalizeBaseUrl} from '../../utils/api'
import {ensureHostPermission} from '../../utils/permissions'
import {getSettings, setSettings} from '../../utils/storage'

const app = document.getElementById('app')!

function field(
  label: string,
  input: HTMLElement,
  hint?: string,
): HTMLLabelElement {
  const wrap = document.createElement('label')
  wrap.className = 'field'
  const title = document.createElement('span')
  title.textContent = label
  wrap.append(title, input)
  if (hint) {
    const p = document.createElement('p')
    p.className = 'hint'
    p.textContent = hint
    wrap.append(p)
  }
  return wrap
}

async function render(): Promise<void> {
  const settings = await getSettings()
  app.replaceChildren()

  const heading = document.createElement('h1')
  heading.textContent = 'UMPIRE extension'
  const intro = document.createElement('p')
  intro.className = 'intro'
  intro.textContent =
    'Point this extension at the same URL you use for the UMPIRE web UI. It will show target health and create desktop notifications when outages start or end.'

  const base = document.createElement('input')
  base.type = 'url'
  base.value = settings.baseUrl
  base.placeholder = 'https://monitor.example.com/umpire'
  base.required = true

  const poll = document.createElement('input')
  poll.type = 'number'
  poll.min = '5'
  poll.step = '1'
  poll.value = String(settings.pollIntervalSeconds)

  const outage = document.createElement('input')
  outage.type = 'checkbox'
  outage.checked = settings.notifyOnOutage

  const recovery = document.createElement('input')
  recovery.type = 'checkbox'
  recovery.checked = settings.notifyOnRecovery

  const status = document.createElement('p')
  status.className = 'status'
  status.hidden = true

  const save = document.createElement('button')
  save.type = 'button'
  save.textContent = 'Save'

  save.addEventListener('click', () => {
    void (async () => {
      status.hidden = false
      status.className = 'status'
      status.textContent = 'Saving…'
      try {
        const draft = await setSettings({
          baseUrl: base.value.trim(),
          pollIntervalSeconds: Number(poll.value),
          notifyOnOutage: outage.checked,
          notifyOnRecovery: recovery.checked,
        })
        const allowed = await ensureHostPermission(draft.baseUrl)
        if (!allowed) {
          status.className = 'status error'
          status.textContent =
            'Saved settings, but site access was not granted. Allow access when prompted, then save again.'
          return
        }
        const canonical = await canonicalizeBaseUrl(draft.baseUrl)
        const next = await setSettings({baseUrl: canonical})
        base.value = next.baseUrl
        if (canonical !== draft.baseUrl) {
          await ensureHostPermission(canonical)
        }
        await browser.runtime.sendMessage({type: 'settings-changed'})
        status.className = 'status ok'
        status.textContent =
          canonical !== draft.baseUrl
            ? `Saved. Redirected to ${canonical}. The badge will refresh shortly.`
            : 'Saved. The badge will refresh shortly.'
      } catch (err) {
        status.className = 'status error'
        status.textContent =
          err instanceof Error ? err.message : 'Failed to save'
      }
    })()
  })

  const outageLabel = document.createElement('label')
  outageLabel.className = 'check'
  outageLabel.append(outage, document.createTextNode(' Notify on outage'))

  const recoveryLabel = document.createElement('label')
  recoveryLabel.className = 'check'
  recoveryLabel.append(recovery, document.createTextNode(' Notify on recovery'))

  app.append(
    heading,
    intro,
    field(
      'UMPIRE base URL',
      base,
      'Example: https://monitor.example.com or http://localhost:8089 (include BASE_PATH if you use one, e.g. https://host/umpire). Prefer https when your server redirects HTTP to HTTPS.',
    ),
    field(
      'Poll interval (seconds)',
      poll,
      'Used as a backup when the live event stream is unavailable. Minimum 5.',
    ),
    outageLabel,
    recoveryLabel,
    save,
    status,
  )
}

void render()
