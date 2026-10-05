// Static-code proof. Drives the built app in headless Chromium, exports a URL,
// text with emoji/Unicode and a Wi-Fi network as PNG and SVG, decodes every
// file and checks the decoded bytes equal the input byte for byte. It also
// fails if the browser requests anything from another origin.
//
//   pnpm build && pnpm verify:static          # serves dist/ itself
//   pnpm verify:static https://qr.b0r3d.org   # or any running copy
//
// Needs Playwright's Chromium (`pnpm exec playwright install chromium`).
import fs from 'fs'
import path from 'path'
import process from 'process'
import { chromium } from 'playwright'
import { decodePng, decodeSvg, outputDir, withSite } from './lib/verify-helpers.mjs'

const CASES = [
  { name: 'url', input: 'https://b0r3d.org/qr-test?a=1&b=two#frag' },
  { name: 'text-emoji', input: 'Static QR ✅ no expiry 🎉☕ — ünïcödé 日本語' },
  { name: 'wifi', wifi: { ssid: 'b0r3d Guest', password: 'p@ss;w0rd,1', encryption: 'WPA' } }
]

// Wi-Fi string per the ZXing "WIFI:" format: \ ; , " : are backslash-escaped.
const escapeWifi = (s) => s.replace(/([\\;,":])/g, '\\$1')

async function run(base) {
  const out = outputDir('verify-static')
  const origin = new URL(base).origin
  const requests = []
  let ok = true

  const browser = await chromium.launch()
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 }
  })
  context.on('request', (r) => requests.push(r.url()))

  for (const c of CASES) {
    const page = await context.newPage()
    await page.goto(base)
    await page.waitForTimeout(800)

    let expected
    if (c.wifi) {
      await page.getByRole('button', { name: /open data type generator/i }).click()
      await page.locator('#dataType').selectOption('wifi')
      await page.locator('#wifiSSID').fill(c.wifi.ssid)
      await page.locator('#wifiEncryption').selectOption(c.wifi.encryption)
      await page.locator('#wifiPassword').fill(c.wifi.password)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      expected = `WIFI:T:${c.wifi.encryption};S:${escapeWifi(c.wifi.ssid)};P:${escapeWifi(c.wifi.password)};;`
      const inBox = await page.locator('#data').inputValue()
      if (inBox !== expected) {
        console.log(
          `  data box holds ${JSON.stringify(inBox)}, expected ${JSON.stringify(expected)}`
        )
        ok = false
      }
    } else {
      await page.locator('#data').fill(c.input)
      expected = c.input
    }
    await page.waitForTimeout(1200) // preview debounce

    const files = {}
    for (const kind of ['png', 'svg']) {
      const pending = page.waitForEvent('download')
      await page.locator(`#download-qr-image-button-${kind}`).click()
      files[kind] = path.join(out, `${c.name}.${kind}`)
      await (await pending).saveAs(files[kind])
    }

    const want = Buffer.from(expected, 'utf8')
    const png = decodePng(fs.readFileSync(files.png))
    const svg = await decodeSvg(files.svg)
    const pngOk = !!png && png.bytes.equals(want)
    const svgOk = !!svg && svg.bytes.equals(want)
    ok &&= pngOk && svgOk
    const show = (d) => (d ? JSON.stringify(d.bytes.toString('utf8')) : 'no QR code found')
    console.log(c.name)
    console.log(`  input  ${JSON.stringify(expected)} (${want.length} bytes)`)
    console.log(`  PNG    ${pngOk ? 'MATCH' : 'MISMATCH ' + show(png)}`)
    console.log(`  SVG    ${svgOk ? 'MATCH' : 'MISMATCH ' + show(svg)}`)
    await page.close()
  }
  await browser.close()

  const foreign = requests.filter((u) => !u.startsWith(origin) && !/^(data|blob):/.test(u))
  console.log(`\nrequests: ${requests.length}, to other origins: ${foreign.length}`)
  for (const u of foreign) console.log(`  FOREIGN ${u}`)
  ok &&= foreign.length === 0
  console.log(ok ? '\nALL OK' : '\nPROBLEMS FOUND')
  console.log(`exports kept in ${path.relative(process.cwd(), out)}/`)
  return ok
}

withSite(run)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
