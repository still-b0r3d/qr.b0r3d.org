import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { bytesOf, openPage, readPng, typeData } from './helpers'

const pcApp: { name: string; svg: string }[] = JSON.parse(
  readFileSync(new URL('../../src/test/pc-app-svgs.json', import.meta.url), 'utf8')
)
const version: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version

test.describe('making a plain code', () => {
  test.skip(({ isMobile }) => isMobile, 'the phone layout has its own checks')

  test('starts with a code for b0r3d.org that scans, and loads nothing from elsewhere', async ({ page }) => {
    const elsewhere: string[] = []
    const errors: string[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol !== 'data:' && url.protocol !== 'blob:') elsewhere.push(r.url())
    })
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await openPage(page)
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org')
    await expect(page.getByTestId('check')).toHaveText('✓ Scans. A test decode matches your data exactly.')
    await expect(page.getByTestId('info')).toHaveText('17 characters · 17 bytes · version 2 · 25 × 25 modules · level Q')
    await expect(page.getByTestId('warnings')).toBeHidden()
    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  })

  test('follows what is typed, accents and emoji included', async ({ page }) => {
    await openPage(page)
    for (const text of ['Héllo wörld ✓ 😀', 'WIFI:T:WPA;S:b0r3d;P:rukus;;', '日本語のテキスト', 'x'.repeat(1200)]) {
      await typeData(page, text)
      await expect(page.getByTestId('check'), text.slice(0, 20)).toHaveAttribute('data-result', 'ok')
    }
    // 1,200 bytes need version 34 at level Q (it holds 1,228; version 33 holds 1,168)
    await expect(page.getByTestId('info')).toHaveText('1,200 characters · 1,200 bytes · version 34 · 153 × 153 modules · level Q')
  })

  test('says why there is no code', async ({ page }) => {
    await openPage(page)
    await page.locator('#data').fill('')
    await expect(page.getByTestId('stage-note')).toHaveText('Type something to make a code.')
    await expect(page.getByTestId('stage-note')).toHaveAttribute('data-problem', 'false')
    await expect(page.getByTestId('save-png')).toBeDisabled()
    await expect(page.getByTestId('save-svg')).toBeDisabled()
    await page.locator('#data').fill('é'.repeat(900))
    await expect(page.getByTestId('stage-note')).toContainText('Too much for one QR code: 1,800 bytes.')
    await expect(page.getByTestId('stage-note')).toHaveAttribute('data-problem', 'true')
    await typeData(page, 'back again')
    await expect(page.getByTestId('preview')).toBeVisible()
    await expect(page.getByTestId('save-png')).toBeEnabled()
  })

  test('error correction, quiet zone and picture size change the code', async ({ page }) => {
    await openPage(page)
    await page.getByRole('button', { name: 'Level H, highest' }).click()
    await expect(page.getByRole('button', { name: 'Level H, highest' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('info')).toContainText('version 3 · 29 × 29 modules · level H')
    await expect(page.getByTestId('level-hint')).toHaveText(
      'Highest (30%): about 30% of the code can be dirty, scratched or covered and it still scans. Higher levels make the code denser. Suggested for this much text.'
    )
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok')

    await page.locator('#quiet-zone').fill('1.5')
    await expect(page.getByTestId('warnings')).toHaveText(
      '⚠ Only 1.5 modules of blank space around the code. Leave at least 4 (Quiet zone), or place it on a plain light area.'
    )
    await page.locator('#quiet-zone').fill('25')
    await page.locator('#quiet-zone').blur()
    await expect(page.locator('#quiet-zone')).toHaveValue('20')
    await expect(page.getByTestId('warnings')).toBeHidden()

    await page.locator('#picture-size').fill('512')
    await expect(page.getByTestId('size-hint')).toContainText('PNG and JPG: 512 × 512 pixels.')
    await page.locator('#picture-size').fill('9')
    await page.locator('#picture-size').blur()
    await expect(page.locator('#picture-size')).toHaveValue('50')
  })

  test('saves a PNG a scanner reads, at the picture size', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'https://b0r3d.org/stage-one-check')
    await page.locator('#picture-size').fill('400')
    await page.locator('#file-name').fill('my code')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-png').click()])
    expect(download.suggestedFilename()).toBe('my code.png')
    const read = await readPng(await bytesOf(download))
    expect(read).toEqual({ text: 'https://b0r3d.org/stage-one-check', width: 400, height: 400 })
  })

  test('saves the same SVG file as the PC app', async ({ page }) => {
    await openPage(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-svg').click()])
    expect(download.suggestedFilename()).toBe('qr-code.svg')
    const svg = (await bytesOf(download)).toString('utf8')
    expect(svg).toBe(pcApp.find((c) => c.name === 'default')?.svg)
  })

  test('the saved SVG scans too, drawn by the browser', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'Héllo wörld ✓')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-svg').click()])
    const svg = (await bytesOf(download)).toString('utf8')
    // drawn the way an image viewer would: the file as a picture, onto white
    const png = await page.evaluate(async (text) => {
      const img = new Image()
      img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
      await img.decode()
      const c = document.createElement('canvas')
      c.width = 600
      c.height = 600
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 600, 600)
      ctx.drawImage(img, 0, 0, 600, 600)
      return c.toDataURL('image/png').split(',')[1]
    }, svg)
    expect((await readPng(Buffer.from(png, 'base64'))).text).toBe('Héllo wörld ✓')
  })
})

test.describe('around the code', () => {
  test('dark by default, light on request, kept where the site always kept it', async ({ page }) => {
    await openPage(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'Switch to the light look' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => localStorage.getItem('dark-mode-preference'))).toBe('light')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Switch to the dark look' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('follows the device when the visitor chose that before', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' })
    await context.addInitScript(() => localStorage.setItem('dark-mode-preference', 'system'))
    const page = await context.newPage()
    await openPage(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await context.close()
  })

  test('the footer has the version, the build and the links', async ({ page, request }) => {
    await openPage(page)
    const line = page.getByTestId('app-version')
    const shown = /^\d+\.\d+\.0$/.test(version) ? version.replace(/\.0$/, '') : version
    await expect(line).toContainText(`b0r3d QR v${shown} · Build: `)
    await expect(line).toHaveText(/ · Build: (dev|[0-9a-f]{7}) · Source · Licence · Notices$/)
    await expect(line.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/still-b0r3d/qr.b0r3d.org')
    const licence = await request.get(await line.getByRole('link', { name: 'Licence' }).getAttribute('href') ?? '')
    expect(await licence.text()).toContain('Licensor: b0r3d.org')
    const notices = await request.get(await line.getByRole('link', { name: 'Notices' }).getAttribute('href') ?? '')
    expect(await notices.text()).toContain('zxing-wasm')
    await expect(page.locator('footer a', { hasText: '← b0r3d.org' })).toHaveAttribute('href', 'https://b0r3d.org')
    await expect(page.getByTestId('pc-link-footer').getByRole('link')).toHaveAttribute('href', 'https://github.com/still-b0r3d/b0r3d-QR-PC')
  })

  test('the Scan tab says what comes next', async ({ page }) => {
    await openPage(page)
    await page.getByRole('tab', { name: 'Scan' }).click()
    await expect(page.getByRole('tab', { name: 'Scan' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#panel-scan')).toBeVisible()
    await expect(page.locator('#panel-create')).toBeHidden()
    await page.getByRole('tab', { name: 'Create' }).click()
    await expect(page.locator('#panel-create')).toBeVisible()
  })
})

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only')

  test('the code stays in a bar at the bottom, with Save behind a button', async ({ page }) => {
    await openPage(page)
    const bar = page.locator('.code-col')
    await expect(bar).toHaveCSS('position', 'fixed')
    const box = await bar.boundingBox()
    const viewport = page.viewportSize()!
    expect(Math.round(box!.y + box!.height)).toBe(viewport.height)
    await expect(page.locator('.export-box')).toBeHidden()
    await page.locator('.export-toggle').click()
    await expect(page.locator('.export-box')).toBeVisible()
    // the settings scroll underneath and can be reached
    await page.locator('#picture-size').scrollIntoViewIfNeeded()
    await page.locator('#picture-size').fill('300')
    await expect(page.getByTestId('size-hint')).toContainText('300 × 300')
  })
})
