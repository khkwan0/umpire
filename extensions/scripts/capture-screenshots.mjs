import {mkdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {chromium} from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mockupsDir = join(root, 'store/screenshots/mockups')
const outDir = join(root, 'store/screenshots')

const shots = [
  ['01-popup-dashboard.html', '01-popup-dashboard.png'],
  ['02-options.html', '02-options.png'],
  ['03-notifications.html', '03-notifications.png'],
]

mkdirSync(outDir, {recursive: true})

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: {width: 1280, height: 800},
  deviceScaleFactor: 1,
})

for (const [html, png] of shots) {
  const file = join(mockupsDir, html)
  await page.goto(pathToFileURL(file).href, {waitUntil: 'load'})
  await page.screenshot({
    path: join(outDir, png),
    type: 'png',
  })
  console.log(`store/screenshots/${png}`)
}

await browser.close()
