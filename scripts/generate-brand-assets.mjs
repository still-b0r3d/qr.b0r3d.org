// Builds every b0r3d image the app ships from the cup logo in b0r3d-brand/.
// Run with `pnpm generate-brand-assets` after changing b0r3d-brand/cup.png.
// The OG image's title is rendered with the system's Courier-style font, so
// regenerate it on a machine that has one (Courier New, FreeMono, ...).
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import process from 'process'

const SOURCE = 'b0r3d-brand/cup.png'
const BG = { r: 0x13, g: 0x13, b: 0x13, alpha: 1 } // --bg #131313
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

function write(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buffer)
  console.log(`Generated ${file} (${buffer.length} bytes)`)
}

function cup(size) {
  return sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: CLEAR, kernel: 'lanczos3' })
    .png()
    .toBuffer()
}

// Cup centred on a canvas. `scale` is the cup's share of the shorter side.
async function cupOnCanvas(width, height, scale, background) {
  const size = Math.round(Math.min(width, height) * scale)
  return sharp({ create: { width, height, channels: 4, background } })
    .composite([{ input: await cup(size), gravity: 'center' }])
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer()
}

// Preset logos. Palette PNGs keep each one small enough (~17 KB) to live in
// the bundle as a data URI. A data URI (rather than an asset URL) keeps
// exported SVGs self-contained when they are opened outside the browser.
const PRESET_LOGOS = [
  { source: SOURCE, outFile: 'src/assets/presets/b0r3d-cup-logo.json' },
  // Rukus the cat (the main site's favicon artwork).
  { source: 'b0r3d-brand/rukus.png', outFile: 'src/assets/presets/rukus-logo.json' }
]

async function writePresetLogos() {
  for (const { source, outFile } of PRESET_LOGOS) {
    const png = await sharp(source)
      .resize(256, 256, { fit: 'contain', background: CLEAR })
      .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
      .toBuffer()
    const json = { image: `data:image/png;base64,${png.toString('base64')}` }
    fs.writeFileSync(outFile, JSON.stringify(json, null, 2) + '\n')
    console.log(`Generated ${outFile} (${png.length} bytes of PNG)`)
  }
}

// Small cup shown next to the page title (displayed at up to 48px, 2x).
async function writeHeaderCup() {
  const png = await sharp(SOURCE)
    .resize(96, 96, { fit: 'contain', background: CLEAR, kernel: 'lanczos3' })
    .png({ palette: true, quality: 95, compressionLevel: 9, effort: 10 })
    .toBuffer()
  write('src/assets/b0r3d-cup.png', png)
}

// An .ico file is a small directory followed by the images; every modern
// browser accepts PNG-encoded entries, so no extra tooling is needed.
async function writeFavicon() {
  const sizes = [16, 32, 48, 64]
  const images = await Promise.all(sizes.map((size) => cup(size)))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(sizes.length, 4)
  const entries = []
  let offset = 6 + 16 * sizes.length
  sizes.forEach((size, i) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size, 0) // width
    entry.writeUInt8(size, 1) // height
    entry.writeUInt8(0, 2) // palette size
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(images[i].length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += images[i].length
    entries.push(entry)
  })
  write('public/favicon.ico', Buffer.concat([header, ...entries, ...images]))
}

async function writeAppIcons() {
  // Opaque background: iOS fills transparency with black and adds no padding.
  write('public/apple-touch-icon.png', await cupOnCanvas(180, 180, 0.82, BG))
  for (const size of [192, 512]) {
    write(`public/app_icons/web/icon-${size}.png`, await cupOnCanvas(size, size, 0.94, CLEAR))
    // Maskable icons get cropped to a circle; keep the cup inside the
    // central 80% safe zone.
    write(`public/app_icons/web/icon-${size}-maskable.png`, await cupOnCanvas(size, size, 0.62, BG))
  }
}

// iOS start-up images; each must match its device's exact pixel size.
// index.html links them with the matching media queries.
const SPLASH_SCREENS = [
  { width: 750, height: 1334 }, // iPhone SE / 8
  { width: 1170, height: 2532 }, // iPhone 12-14
  { width: 1290, height: 2796 }, // iPhone 14-15 Pro Max
  { width: 2048, height: 2732 } // iPad Pro 12.9"
]

async function writeSplashScreens() {
  for (const { width, height } of SPLASH_SCREENS) {
    // Cap the cup at 1.5x its source size so it doesn't turn to mush.
    const scale = Math.min(0.4, 384 / Math.min(width, height))
    write(
      `public/app_icons/web/splash-${width}x${height}.png`,
      await cupOnCanvas(width, height, scale, BG)
    )
  }
}

async function writeOgImage() {
  const width = 1200
  const height = 630
  const font = "'Courier New', Courier, FreeMono, 'Liberation Mono', monospace"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect y="3" width="6" height="3" fill="rgb(0,255,100)" fill-opacity="0.025"/>
    </pattern>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b1"/>
      <feFlood flood-color="#ff00ff" flood-opacity="0.75"/>
      <feComposite in2="b1" operator="in" result="pink"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="18" result="b2"/>
      <feFlood flood-color="#00ffff" flood-opacity="0.45"/>
      <feComposite in2="b2" operator="in" result="cyan"/>
      <feMerge><feMergeNode in="cyan"/><feMergeNode in="pink"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#131313"/>
  <rect width="100%" height="100%" fill="url(#scan)"/>
  <text x="520" y="300" font-family="${font}" font-size="104" font-weight="bold" fill="#e6e6e6" filter="url(#glow)">b0r3d QR</text>
  <text x="524" y="372" font-family="${font}" font-size="34" fill="#9d9d9d">Static QR codes.</text>
  <text x="524" y="418" font-family="${font}" font-size="34" fill="#9d9d9d">Nothing to expire.</text>
</svg>`
  const png = await sharp(Buffer.from(svg))
    .composite([{ input: await cup(384), left: 96, top: 123 }])
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer()
  write('public/og-image.png', png)
}

async function main() {
  await writePresetLogos()
  await writeHeaderCup()
  await writeFavicon()
  await writeAppIcons()
  await writeSplashScreens()
  await writeOgImage()
}

main().catch((error) => {
  console.error('Error generating brand assets:', error)
  process.exit(1)
})
