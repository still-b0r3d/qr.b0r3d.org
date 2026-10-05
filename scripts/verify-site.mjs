// Whole-site check. Serves (or visits) the app from its root in headless
// Chromium and logs every request, including the service worker's, while it
// checks the defaults, manifest, service worker, every preset, a self-hosted
// font, all export formats, English-only text, file and camera scanning
// (fake camera) and an offline reload. Fails if any request goes to another
// origin, except b0r3d.org's site-wide visitor stats beacon.
//
//   pnpm build && pnpm verify:site            # serves dist/ itself
//   pnpm verify:site https://qr.b0r3d.org     # check the live site
//
// The default-value checks expect a production build (.env.production).
// Needs Playwright's Chromium (`pnpm exec playwright install chromium`).
import fs from 'fs'
import path from 'path'
import process from 'process'
import { chromium } from 'playwright'
import { decodePng, outputDir, ROOT, withSite } from './lib/verify-helpers.mjs'

const DEFAULT_DATA = 'https://b0r3d.org'
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
const PRESETS = ['Rounded', 'Dots', 'b0r3d Cup', 'Rukus', 'Plain']

async function run(base) {
  const out = outputDir('verify-site')
  const origin = new URL(base).origin
  const results = []
  const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }
  const decodes = (file) => decodePng(fs.readFileSync(file))?.bytes.toString('utf8')

  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  })
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    permissions: ['camera']
  })
  const requests = []
  context.on('request', (r) => requests.push(r.url()))
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  const presetPicker = page.getByRole('combobox', { name: /select qr code preset/i })

  async function download(buttonId, name) {
    const pending = page.waitForEvent('download')
    await page.locator(buttonId).click()
    const d = await pending
    const file = path.join(out, name)
    await d.saveAs(file)
    return { file, suggested: d.suggestedFilename(), size: fs.statSync(file).size }
  }

  try {
    // Page and defaults
    const resp = await page.goto(base)
    const title = await page.title()
    check(
      'page loads',
      resp.status() === 200 && title === 'b0r3d QR',
      `status ${resp.status()}, title "${title}"`
    )
    await page.waitForTimeout(1000)
    check(
      'dark theme by default',
      await page.evaluate(() => document.documentElement.classList.contains('dark'))
    )
    check(
      `default data is ${DEFAULT_DATA}`,
      (await page.locator('#data').inputValue()) === DEFAULT_DATA
    )
    check('default preset is Plain', (await presetPicker.innerText()).includes('Plain'))
    check(
      'static line visible',
      await page.getByText('Static QR codes: what you enter is stored').isVisible()
    )
    const back = await page.locator('footer a', { hasText: '← b0r3d.org' }).getAttribute('href')
    check('footer links back to b0r3d.org', back === 'https://b0r3d.org')
    const versionLine = page.getByTestId('app-version')
    const buildHref = await versionLine.getByRole('link').getAttribute('href')
    check(
      'footer shows the version and build',
      (await versionLine.innerText()).includes(`b0r3d QR v${PKG_VERSION}`) &&
        /\/commit\/[0-9a-f]{40}$/.test(buildHref || ''),
      (await versionLine.innerText()).trim()
    )
    const scanCheck = page.locator('#scan-check')
    await scanCheck
      .getByText('Scans.')
      .waitFor({ timeout: 10000 })
      .catch(() => {})
    check(
      'scan check confirms the default code scans',
      (await scanCheck.innerText()).includes('Scans.')
    )

    // Manifest and service worker
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifest = await (await page.request.get(new URL(manifestHref, base).href)).json()
    check(
      'manifest served',
      manifest.name === 'b0r3d QR' && manifest.start_url === '/',
      `start_url ${manifest.start_url}`
    )
    for (const img of [...manifest.icons, ...(manifest.screenshots || [])]) {
      const r = await page.request.get(new URL(img.src, base).href)
      check(`manifest image ${img.src}`, r.ok() && r.headers()['content-type'] === 'image/png')
    }
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    check('service worker registered at the root', scope === `${origin}/`, scope)
    await page.reload()
    await page.waitForTimeout(1000)
    check(
      'service worker controls the page',
      await page.evaluate(() => !!navigator.serviceWorker.controller)
    )

    // Exports with every preset
    const first = await download('#download-qr-image-button-png', 'default.png')
    check(`default PNG decodes to ${DEFAULT_DATA}`, decodes(first.file) === DEFAULT_DATA)
    for (const preset of PRESETS) {
      await presetPicker.click()
      await page.getByRole('option', { name: preset, exact: true }).click()
      await page.waitForTimeout(900)
      const f = await download(
        '#download-qr-image-button-png',
        `preset-${preset.replace(/\s/g, '-')}.png`
      )
      check(`preset "${preset}" export decodes`, decodes(f.file) === DEFAULT_DATA)
    }

    // Frame with a self-hosted font, then JPG / SVG / PNG
    await page.getByRole('button', { name: /frame settings/i }).click()
    await page.locator('#show-frame').check()
    await page.locator('#frame-font-family').selectOption({ label: 'Roboto' })
    await page.waitForTimeout(1200)
    const fontReqs = requests.filter((u) => /roboto.*\.woff2?$/i.test(u))
    check(
      'Roboto loads from this site',
      fontReqs.length > 0 && fontReqs.every((u) => u.startsWith(origin)),
      fontReqs[0] || 'no font request'
    )
    for (const kind of ['jpg', 'svg', 'png']) {
      const f = await download(`#download-qr-image-button-${kind}`, `framed.${kind}`)
      check(
        `${kind.toUpperCase()} export downloads`,
        f.size > 500,
        `${f.suggested}, ${f.size} bytes`
      )
    }
    check('framed PNG still decodes', decodes(path.join(out, 'framed.png')) === DEFAULT_DATA)

    // English only: no language picker, and a language saved by the old
    // picker (Mini QR's 'preferred-language' key) is ignored.
    check(
      'no language picker',
      (await page.getByRole('combobox', { name: /select language/i }).count()) === 0
    )
    await page.evaluate(() => localStorage.setItem('preferred-language', 'de'))
    await page.reload()
    await page.waitForTimeout(1000)
    check(
      'stays English with an old saved language',
      await page
        .getByText('Frame settings')
        .first()
        .isVisible()
        .catch(() => false)
    )

    // Scan an exported PNG
    await page
      .getByRole('button', { name: /switch to scan mode/i })
      .first()
      .click()
    await page.waitForTimeout(500)
    await page.locator('input[type="file"]').setInputFiles(first.file)
    await page.waitForTimeout(2000)
    check(
      'scanning an exported PNG reads it back',
      await page
        .getByText(DEFAULT_DATA)
        .first()
        .isVisible()
        .catch(() => false)
    )

    // Camera scanner with Chromium's fake camera
    await page.reload()
    await page.waitForTimeout(800)
    await page
      .getByRole('button', { name: /switch to scan mode/i })
      .first()
      .click()
    await page.getByRole('button', { name: /scan with camera/i }).click()
    await page.waitForTimeout(3000)
    const playing = await page.evaluate(() => {
      const v = document.querySelector('video')
      return !!v && v.readyState >= 2 && v.videoWidth > 0
    })
    check('camera scanner shows the camera feed', playing)

    // Offline reload (served by the service worker)
    await context.setOffline(true)
    await page.reload().catch(() => {})
    await page.waitForTimeout(1500)
    check(
      'app reloads while offline',
      (await page.title()) === 'b0r3d QR' && (await page.locator('#app *').count()) > 10
    )
    await context.setOffline(false)
  } finally {
    await browser.close()
  }

  // b0r3d.org's visitor stats are switched on for the whole domain, so the live
  // site gets this beacon injected. It isn't part of the app and is kept on
  // purpose; it's listed but doesn't fail the check.
  const siteStats = (u) => u.startsWith('https://static.cloudflareinsights.com/')
  const outside = requests.filter((u) => !u.startsWith(origin) && !/^(data|blob):/.test(u))
  const foreign = outside.filter((u) => !siteStats(u))
  check(
    'no request left the site',
    foreign.length === 0,
    `${requests.length} requests, ${foreign.length} to other origins`
  )
  for (const u of foreign) console.log(`      FOREIGN ${u}`)
  for (const u of outside.filter(siteStats))
    console.log(`      site-wide visitor stats (not the app) ${u}`)
  if (pageErrors.length) console.log('page errors:', pageErrors)
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} checks passed`)
  return passed === results.length
}

withSite(run)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
