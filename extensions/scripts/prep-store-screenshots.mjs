import {spawnSync} from 'node:child_process'
import {mkdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {chromium} from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(root, 'store/screenshots/source')
const composeDir = join(root, 'store/screenshots/compose')
const mockupsDir = join(root, 'store/screenshots/mockups')
const outDir = join(root, 'store/screenshots')

/** @type {[string, string, 'compose' | 'mockup'][]} */
const shots = [
  ['01-popup-dashboard.html', '01-popup-dashboard.png', 'compose'],
  ['02-options.html', '02-options.png', 'mockup'],
  ['03-notifications.html', '03-notifications.png', 'mockup'],
  ['04-web-dashboard.html', '04-web-dashboard.png', 'compose'],
  ['05-web-agent.html', '05-web-agent.png', 'compose'],
  ['06-web-settings.html', '06-web-settings.png', 'compose'],
]

const prepSources = join(root, 'scripts/prep-screenshot-sources.py')
const prep = spawnSync('python3', [prepSources], {stdio: 'inherit'})
if (prep.status !== 0) {
  process.exit(prep.status ?? 1)
}

mkdirSync(outDir, {recursive: true})
mkdirSync(sourceDir, {recursive: true})

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: {width: 1280, height: 800},
  deviceScaleFactor: 1,
})

for (const [html, png, kind] of shots) {
  const baseDir = kind === 'compose' ? composeDir : mockupsDir
  const file = join(baseDir, html)
  await page.goto(pathToFileURL(file).href, {waitUntil: 'load'})
  await page.waitForTimeout(150)
  await page.screenshot({
    path: join(outDir, png),
    type: 'png',
  })
  console.log(`store/screenshots/${png}`)
}

await browser.close()
