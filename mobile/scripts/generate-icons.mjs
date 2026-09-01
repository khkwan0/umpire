/**
 * Generate mobile app icons from web/public/umpire_logo.svg
 * Run: node scripts/generate-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const svgPath = path.resolve(root, '../web/public/umpire_logo.svg')
const outDir = path.resolve(root, 'assets/images')
const brandLogo = '#225a80'
const splashFg = '#f7f2e8'

const rawSvg = fs.readFileSync(svgPath, 'utf8')
const pathMatch = rawSvg.match(/<path[\s\S]*?\sd="([^"]+)"/)
if (!pathMatch) throw new Error('Could not parse logo path from SVG')

const pathData = pathMatch[1]

/** Tight square SVG so renderers don't shrink the glyph inside extra canvas. */
const normalizedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 62" width="1024" height="1024">
  <g transform="translate(-74.713,-122.146)">
    <path fill="${brandLogo}" d="${pathData}"/>
  </g>
</svg>`

function logoSvg(fill) {
  return normalizedSvg.replace(`fill="${brandLogo}"`, `fill="${fill}"`)
}

async function renderLogoPng({
  size,
  fill = brandLogo,
  background = null,
  paddingRatio = 0.08,
}) {
  const inner = Math.round(size * (1 - paddingRatio * 2))
  const logo = await sharp(Buffer.from(logoSvg(fill)))
    .resize(inner, inner, {fit: 'contain'})
    .png()
    .toBuffer()

  if (!background) {
    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: {r: 0, g: 0, b: 0, alpha: 0},
      },
    })
      .composite([{input: logo, gravity: 'center'}])
      .png()
      .toBuffer()
  }

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{input: logo, gravity: 'center'}])
    .png()
    .toBuffer()
}

async function assertNonBlank(buffer, label) {
  const {channels, width, height} = await sharp(buffer).metadata()
  const stats = await sharp(buffer).stats()
  const hasColor = stats.channels.some((ch, i) => {
    if (channels === 4 && i === 3) return false
    return ch.min < 240 || ch.max < 250
  })
  if (!hasColor) {
    throw new Error(`${label} appears blank (${width}x${height})`)
  }
}

async function write(file, buffer) {
  await assertNonBlank(buffer, file)
  const target = path.join(outDir, file)
  await sharp(buffer).toFile(target)
  console.log('wrote', target)
}

async function main() {
  await write(
    'icon.png',
    await renderLogoPng({size: 1024, background: '#ffffff', paddingRatio: 0.08}),
  )
  await write(
    'android-icon-foreground.png',
    await renderLogoPng({size: 1024, paddingRatio: 0.14}),
  )
  await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toFile(path.join(outDir, 'android-icon-background.png'))
  console.log('wrote', path.join(outDir, 'android-icon-background.png'))
  await write(
    'android-icon-monochrome.png',
    await renderLogoPng({size: 1024, fill: '#ffffff', paddingRatio: 0.14}),
  )
  await write(
    'splash-icon.png',
    await renderLogoPng({
      size: 512,
      fill: splashFg,
      paddingRatio: 0.08,
    }),
  )
  await write(
    'favicon.png',
    await renderLogoPng({size: 48, background: '#ffffff', paddingRatio: 0.08}),
  )

  const expoIconAssets = path.resolve(root, 'assets/expo.icon/Assets')
  fs.writeFileSync(path.join(expoIconAssets, 'umpire_logo.svg'), normalizedSvg)
  console.log('wrote normalized umpire_logo.svg to expo.icon assets')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
