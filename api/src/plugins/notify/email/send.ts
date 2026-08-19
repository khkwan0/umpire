import { spawn } from 'node:child_process'
import type { AlertEvent } from '../../types.js'
import type { EmailConfig } from './config.js'
import { isConfigured } from './config.js'

function buildMessage(config: EmailConfig, event: AlertEvent): string {
  const subject = `[UMPIRE] ${event.title}`
  const body =
    `${event.body}\n\n` +
    `Target: ${event.target.url}\n` +
    `Status: ${event.status} (previous: ${event.previousStatus})\n` +
    `Checked: ${event.checkedAt}\n` +
    (event.error ? `Error: ${event.error}\n` : '')
  return `From: ${config.from}\nTo: ${config.to.join(', ')}\nSubject: ${subject}\nContent-Type: text/plain; charset=UTF-8\n\n${body}\n`
}

function sendViaSendmail(raw: string, sendmailPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(sendmailPath, ['-t', '-i'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`sendmail exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
    child.stdin.write(raw)
    child.stdin.end()
  })
}

function sendViaSmtpCurl(raw: string, config: EmailConfig): Promise<void> {
  const protocol = config.smtp.secure ? 'smtps' : 'smtp'
  const url = `${protocol}://${config.smtp.host}:${config.smtp.port}`
  const args = [
    '--silent',
    '--show-error',
    '--fail',
    '--url',
    url,
    '--user',
    `${config.smtp.username}:${config.smtp.password}`,
    '--mail-from',
    config.from,
  ]
  if (!config.smtp.secure) {
    args.push('--ssl-reqd')
  }
  for (const rcpt of config.to) {
    args.push('--mail-rcpt', rcpt)
  }
  args.push('-T', '-')

  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`curl smtp exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
    child.stdin.write(raw)
    child.stdin.end()
  })
}

export async function sendAlert(config: EmailConfig, event: AlertEvent): Promise<void> {
  if (!isConfigured(config)) throw new Error('email from/to are not configured')
  const raw = buildMessage(config, event)
  if (config.mode === 'smtp') {
    await sendViaSmtpCurl(raw, config)
    return
  }
  await sendViaSendmail(raw, config.sendmailPath || process.env.SENDMAIL_PATH || 'sendmail')
}

export function testEvent(): AlertEvent {
  return {
    target: { id: 0, url: 'https://umpire.test/email' },
    status: 'down',
    previousStatus: 'up',
    error: 'test',
    statusCode: null,
    checkedAt: new Date().toISOString(),
    title: 'UMPIRE Email test',
    body: 'This is a test alert from the Email notifier.',
    checks: [],
  }
}
