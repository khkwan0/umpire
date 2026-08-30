import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Resvg} from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/icon/icon.svg'))

for (const size of [16, 32, 48, 96, 128]) {
  const resvg = new Resvg(svg, {
    fitTo: {mode: 'width', value: size},
  })
  writeFileSync(join(root, `public/icon/${size}.png`), resvg.render().asPng())
  console.log(`public/icon/${size}.png`)
}
