// Whole-site check. Serves (or visits) the built site in headless Chromium and logs every request,
// including the scanner's worker and WebAssembly, while it makes a code, saves a PNG and an SVG and
// reads them back. Fails if any request goes to another site (except b0r3d.org's site-wide visitor
// stats beacon), if a missing file is answered with anything but a 404 (what blanked this site on
// 2026-10-05), if the Content-Security-Policy blocks anything (except Cloudflare's injected bot
// detection script), or if the offline files aren't there.
//
//   pnpm build && pnpm verify:site            # serves dist/ itself
//   pnpm verify:site https://qr.b0r3d.org     # checks the live site
//
// Needs Playwright's Chromium (`pnpm exec playwright install chromium`).
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
prepareZXingModule({
  overrides: { wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm')).buffer }
})

// b0r3d.org has Bot Fight Mode on, so Cloudflare adds its JavaScript Detections snippet (an inline
// script) to every page it serves. Its contents change per request, so the policy can't allow it by
// hash, and Cloudflare only adds a nonce when the policy comes in a response header. Blocking it was
// accepted (owner's call, 2026-10-05): nothing on this plan acts on its result. Those violations are
// listed but don't fail the check; anything else does.
const CF_BOT_DETECTION = /__CF\$cv\$params|\/cdn-cgi\/challenge-platform\//
const BEACON = /^https:\/\/static\.cloudflareinsights\.com\/|^https:\/\/cloudflareinsights\.com\//

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function waitFor(url, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`${url} did not come up within ${timeoutMs / 1000}s`)
}

/** Runs fn(baseUrl) on the URL given, or on dist/ served by `vite preview`. */
async function withSite(fn) {
  const given = process.argv[2]
  if (given) return fn(given.endsWith('/') ? given : `${given}/`, true)
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ not found. Run `pnpm build` first, or pass a URL.')
  const port = await freePort()
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore'
  })
  const base = `http://127.0.0.1:${port}/`
  try {
    await waitFor(base)
    return await fn(base, false)
  } finally {
    server.kill()
  }
}

async function readPng(bytes) {
  const png = PNG.sync.read(bytes)
  const [found] = await readBarcodes({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }, { formats: ['QRCode'], tryHarder: true })
  return { text: found?.text ?? null, width: png.width, height: png.height }
}

async function run(base, remote) {
  const origin = new URL(base).origin
  const results = []
  const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }

  const browser = await chromium.launch()
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
  const requests = []
  context.on('request', (r) => requests.push(r.url()))
  const violations = []
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const code = e.target instanceof HTMLScriptElement ? e.target.textContent || '' : ''
      const cloudflare = /__CF\$cv\$params|\/cdn-cgi\/challenge-platform\//.test(code)
      console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}` + (cloudflare ? ' [Cloudflare bot detection]' : ''))
    })
  })
  context.on('console', (m) => {
    if (/CSP violation|Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text())
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  let cloudflareInjected = false
  const ownHashes = new Set()

  try {
    const resp = await page.goto(base)
    const html = await resp.text()
    for (const [, code] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      if (CF_BOT_DETECTION.test(code)) cloudflareInjected = true
      else ownHashes.add(createHash('sha256').update(code.replace(/\r\n?/g, '\n')).digest('base64'))
    }
    const title = await page.title()
    check('page loads', resp.status() === 200 && title === 'b0r3d QR', `status ${resp.status()}, title "${title}"`)
    check('page has its Content-Security-Policy', /<meta http-equiv="Content-Security-Policy"/.test(html))
    if (remote) {
      const h = resp.headers()
      check('security headers sent', /camera=\(self\)/.test(h['permissions-policy'] || '') && h['x-content-type-options'] === 'nosniff')
      check('page is checked on every load', /no-cache/.test(h['cache-control'] || ''), h['cache-control'])
    }

    await page.waitForFunction(() => document.querySelector('[data-testid=check]')?.dataset.result === 'ok', null, { timeout: 30_000 }).catch(() => {})
    check('the first code scans', (await page.getByTestId('check').textContent()) === '✓ Scans. A test decode matches your data exactly.')
    // (the service worker asks for them again to keep a copy for offline use)
    const scanner = [...new Set(requests.filter((u) => /zxing_reader-[^/]*\.wasm$|scan\.worker-[^/]*\.js$/.test(u)))]
    check('the scanner loads from this site', scanner.length === 2 && scanner.every((u) => u.startsWith(origin)), scanner.join(', ') || 'none')

    await page.locator('#data').fill('https://b0r3d.org/verify')
    await page.waitForFunction(() => document.querySelector('[data-testid=check]')?.dataset.result === 'ok', null, { timeout: 30_000 }).catch(() => {})
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-png').click()])
    const read = await readPng(fs.readFileSync(await png.path()))
    check('the saved PNG scans', read.text === 'https://b0r3d.org/verify' && read.width === 200, JSON.stringify(read))
    const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-svg').click()])
    const svgText = fs.readFileSync(await svg.path(), 'utf8')
    check('the saved SVG is one', svgText.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && svgText.includes('class="qr-dots"'))

    const versionLine = (await page.getByTestId('app-version').innerText()).trim()
    const shown = /^\d+\.\d+\.0$/.test(PKG_VERSION) ? PKG_VERSION.replace(/\.0$/, '') : PKG_VERSION
    const build = remote ? /Build: [0-9a-f]{7} ·/ : /Build: (dev|[0-9a-f]{7}) ·/
    check('footer shows the version and build', versionLine.startsWith(`b0r3d QR v${shown} · `) && build.test(versionLine), versionLine)
    const source = await page.getByTestId('app-version').locator('a', { hasText: 'Source' }).getAttribute('href')
    check('footer links to the source code', source === 'https://github.com/still-b0r3d/qr.b0r3d.org', source)

    for (const file of ['LICENSE.txt', 'THIRD-PARTY-NOTICES.txt', 'sw.js', 'manifest.webmanifest', 'favicon.ico']) {
      const r = await page.request.get(base + file)
      check(`${file} is served`, r.status() === 200, String(r.status()))
    }
    const licence = await (await page.request.get(base + 'LICENSE.txt')).text()
    check('the licence is MIT + Commons Clause by b0r3d.org', licence.includes('Commons Clause') && licence.includes('Licensor: b0r3d.org'))
    const sw = await (await page.request.get(base + 'sw.js')).text()
    const files = JSON.parse(/const FILES = (\[[^\]]*\]);/.exec(sw)?.[1] ?? '[]')
    let missing = []
    for (const f of files) if ((await page.request.get(new URL(f, base).href)).status() !== 200) missing.push(f)
    check(`all ${files.length} offline files are served`, files.length > 5 && missing.length === 0, missing.join(', '))

    const nothing = await page.request.get(base + 'assets/no-such-file-' + Date.now() + '.js')
    check('a missing file is a 404, not the page', nothing.status() === 404, String(nothing.status()))

    const elsewhere = [...new Set(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && !BEACON.test(u)))]
    check('nothing loads from another site', elsewhere.length === 0, elsewhere.join(', '))
    const blocking = violations.filter((v) => !v.includes('[Cloudflare bot detection]') && !(cloudflareInjected && /script-src/.test(v)))
    check('the security policy blocks nothing of the site', blocking.length === 0, blocking.join(' | '))
    if (violations.length > blocking.length) console.log(`      (${violations.length - blocking.length} blocked Cloudflare bot detection script, as accepted)`)
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
  } finally {
    await browser.close()
  }
  const failed = results.filter((ok) => !ok).length
  console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} checks failed.`)
  if (failed) process.exitCode = 1
}

await withSite(run)
