import './options.css'
import {browser} from 'wxt/browser'
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
  base.placeholder = 'http://localhost:8089'
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
        const next = await setSettings({
          baseUrl: base.value.trim(),
          pollIntervalSeconds: Number(poll.value),
          notifyOnOutage: outage.checked,
          notifyOnRecovery: recovery.checked,
        })
        const allowed = await ensureHostPermission(next.baseUrl)
        if (!allowed) {
          status.className = 'status error'
          status.textContent =
            'Saved settings, but site access was not granted. Allow access when prompted, then save again.'
          return
        }
        await browser.runtime.sendMessage({type: 'settings-changed'})
        status.className = 'status ok'
        status.textContent = 'Saved. The badge will refresh shortly.'
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
      'Example: http://localhost:8089 or https://monitor.example.com (include BASE_PATH if you use one, e.g. https://host/umpire).',
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
