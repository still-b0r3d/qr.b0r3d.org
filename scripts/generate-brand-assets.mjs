// Builds every b0r3d image the app ships from the cup logo in b0r3d-brand/.
// Run with `pnpm generate-brand-assets` after changing b0r3d-brand/cup.png.
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import process from 'process'

const SOURCE = 'b0r3d-brand/cup.png'

// Palette PNG keeps the logo around 17 KB, small enough to live in the bundle
// as a data URI. A data URI (rather than an asset URL) keeps exported SVGs
// self-contained when they are opened outside the browser.
async function writeCupPreset() {
  const png = await sharp(SOURCE)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer()
  const outFile = 'src/assets/presets/b0r3d-cup-logo.json'
  const json = { image: `data:image/png;base64,${png.toString('base64')}` }
  fs.writeFileSync(outFile, JSON.stringify(json, null, 2) + '\n')
  console.log(`Generated ${outFile} (${png.length} bytes of PNG)`)
}

async function main() {
  await writeCupPreset()
}

main().catch((error) => {
  console.error('Error generating brand assets:', error)
  process.exit(1)
})
