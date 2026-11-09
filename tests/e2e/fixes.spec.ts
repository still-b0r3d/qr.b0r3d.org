import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { bytesOf, openPage } from './helpers'
import { cards, codePicture, openScan, scanStatus } from './scanning'

// What stage 4 found, fixed: three things the site and the PC app did alike (the hidden quiet-zones
// box taking the margin off Data Matrix and PDF417; a barcode's error said at every pause; a Data
// Matrix's Wi-Fi password shown in Recent codes) and two of the site's own (a see-through code
// vanishing on the dark page; a huge phone photo failing as "isn't a picture"). The third of the
// site's own, "Make this code again" for a barcode zint can't make, is in src/qr/scanned.test.ts.

const check = (page: Page) => page.getByTestId('check')
const rows = (page: Page) => page.getByTestId('in-code-rows')

async function chooseType(page: Page, id: string): Promise<void> {
  await page.getByTestId('code-type').selectOption(id)
  await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
}

async function savePng(page: Page): Promise<PNG> {
  const toggle = page.locator('.export-toggle')
  if (await toggle.isVisible()) await toggle.click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-png').click()])
  if (await toggle.isVisible()) await toggle.click()
  return PNG.sync.read(await bytesOf(download))
}

const design = (background: string) =>
  JSON.stringify({ schemaVersion: 1, props: { data: 'https://b0r3d.org', width: 200, height: 200, margin: 4, qrOptions: { errorCorrectionLevel: 'Q', typeNumber: 0 } }, style: { borderRadius: '0px', background }, frame: null })

test.describe('the stage 4 findings, fixed', () => {
  test('a hidden "Include quiet zones" box leaves Data Matrix its margin', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the desktop layout')
    await openPage(page)
    await chooseType(page, 'code128')
    await page.locator('#barcode-quiet-zones').uncheck()
    await expect(rows(page)).toContainText('no blank margin')
    await chooseType(page, 'datamatrix')
    await expect(page.locator('#barcode-quiet-zones')).toBeHidden()
    await expect(rows(page)).toContainText('blank margin included')
    // and the margin is in the file: its edges are its background
    const png = await savePng(page)
    const white = (x: number, y: number) => png.data[(y * png.width + x) * 4] === 255
    for (let i = 0; i < png.width; i++) expect(white(i, 0) && white(i, png.height - 1)).toBe(true)
    for (let i = 0; i < png.height; i++) expect(white(0, i) && white(png.width - 1, i)).toBe(true)
  })

  test('a barcode’s error is said once for each kind of mistake, not at every pause', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the desktop layout')
    await openPage(page)
    await chooseType(page, 'ean13')
    const box = page.locator('#barcode-data')
    const error = page.getByTestId('barcode-error')
    const said = page.getByTestId('barcode-error-said')
    await box.fill('12')
    await expect(error).toHaveText('EAN-13 needs 12 digits (or 13 with the check digit); this has 2.')
    await expect(error).not.toHaveAttribute('role')
    await expect(said).toHaveText('EAN-13 needs 12 digits (or 13 with the check digit); this has 2.')
    await expect(said).toHaveAttribute('aria-live', 'assertive')
    // the same mistake, one digit on: shown, not said again
    await box.fill('123')
    await expect(error).toHaveText('EAN-13 needs 12 digits (or 13 with the check digit); this has 3.')
    await page.waitForTimeout(800)
    await expect(said).toHaveText('EAN-13 needs 12 digits (or 13 with the check digit); this has 2.')
    // another mistake is said
    await box.fill('12a')
    await expect(said).toHaveText('EAN-13 can only hold digits.')
    // a wrong check digit, then another digit changed so it should be another: each one said
    await box.fill('9506000134350')
    await expect(said).toHaveText("The check digit (the last digit) should be 2. Leave it off and it's added for you.")
    await box.fill('9506000134360')
    await expect(error).not.toHaveText(/should be 2\./)
    await expect(said).toHaveText((await error.textContent())!)
    // and the line read out goes a moment later, leaving the one on show
    await expect(said).toHaveText('', { timeout: 8000 })
    await expect(error).toBeVisible()
  })

  test('Recent codes hide a Data Matrix’s Wi-Fi password, as they do a QR code’s', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the desktop layout')
    await openPage(page)
    await chooseType(page, 'datamatrix')
    await page.locator('#barcode-data').fill('WIFI:T:WPA;S:home;P:naps-all-day;;')
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await savePng(page)
    await expect
      .poll(() => page.evaluate(() => new Promise<number>((resolve) => {
        const r = indexedDB.open('b0r3d-qr')
        r.onsuccess = () => {
          const all = r.result.transaction('codes', 'readonly').objectStore('codes').count()
          all.onsuccess = () => resolve(all.result)
        }
        r.onerror = () => resolve(-1)
      })))
      .toBe(1)
    await page.getByTestId('recent-codes').click()
    const w = page.getByTestId('recent-dialog')
    const row = w.locator('.recent-row').first()
    await expect(row.locator('strong')).toHaveText('Data Matrix: home')
    await expect(row).toContainText('picture and password hidden')
    await expect(row.locator('.icon-lock')).toHaveCount(1)
    await expect(row.locator('img')).toHaveCount(0)
    await expect(w).not.toContainText('naps-all-day')
  })

  test('a see-through code shows on a checkerboard', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the desktop layout')
    await openPage(page)
    const preview = page.getByTestId('preview')
    await expect(preview).not.toHaveClass(/see-through/)
    await page.getByTestId('open-design-file').setInputFiles({ name: 'clear.json', mimeType: 'application/json', buffer: Buffer.from(design('transparent')) })
    await expect(preview).toHaveClass(/see-through/)
    await expect(preview).toHaveCSS('background-image', /linear-gradient/)
    // and in Recent codes' list
    await page.getByTestId('save-design').click()
    await page.getByTestId('recent-codes').click()
    await expect(page.getByTestId('recent-dialog').locator('.recent-row img').first()).toHaveCSS('background-image', /linear-gradient/)
    await page.getByTestId('recent-dialog').getByRole('button', { name: 'Close' }).click()
    await page.getByTestId('open-design-file').setInputFiles({ name: 'white.json', mimeType: 'application/json', buffer: Buffer.from(design('#ffffff')) })
    await expect(preview).not.toHaveClass(/see-through/)
    // a barcode with a see-through background too
    await chooseType(page, 'ean13')
    await page.locator('#barcode-transparent').check()
    await expect(preview).toHaveClass(/see-through/)
  })

  test('a huge photo is opened at the size it’s read at; one too big to open says so', async ({ page }) => {
    test.slow()
    await openScan(page)
    // a 20-megapixel photo with a code in it
    const photo = new PNG({ width: 5000, height: 4000 })
    photo.data.fill(255)
    const code = await codePicture('QRCode', 'https://b0r3d.org/big-photo')
    const big = new PNG({ width: code.width * 4, height: code.height * 4 })
    for (let y = 0; y < big.height; y++)
      for (let x = 0; x < big.width; x++) code.data.copy(big.data, (y * big.width + x) * 4, (Math.floor(y / 4) * code.width + Math.floor(x / 4)) * 4, (Math.floor(y / 4) * code.width + Math.floor(x / 4)) * 4 + 4)
    PNG.bitblt(big, photo, 0, 0, big.width, big.height, 2000, 1500)
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG.sync.write(photo, { deflateLevel: 1 }) })
    await expect(cards(page).locator('.found-text')).toHaveValue('https://b0r3d.org/big-photo', { timeout: 60_000 })
    // a picture whose header says it's 100,000 × 75,000 pixels
    const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
    const huge = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), ...Buffer.from('IHDR'), ...be32(100000), ...be32(75000), 8, 6, 0, 0, 0, 0, 0, 0, 0])
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: huge })
    await expect(scanStatus(page)).toHaveText("Couldn't open huge.png: it's too big to open.", { timeout: 30_000 })
  })

  test('a huge photo its camera turned keeps its shape, turned', async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL, 'the dev server (it opens the page’s own picture reader)')
    await page.goto('/')
    // a 6000 × 4500 JPEG with a black square in it, whose Exif says "turn it a quarter right" (6)
    const found = await page.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 6000
      c.height = 4500
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 6000, 4500)
      ctx.fillStyle = '#000'
      ctx.fillRect(1000, 1000, 1000, 1000)
      const jpg = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.8))).arrayBuffer())
      c.width = c.height = 0
      const exif = [0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]
      const turned = new Uint8Array(jpg.length + exif.length)
      turned.set(jpg.subarray(0, 2))
      turned.set(exif, 2)
      turned.set(jpg.subarray(2), 2 + exif.length)
      const { pictureFrom } = (await import(String('/src/ui/picture-reader.ts'))) as typeof import('../../src/ui/picture-reader')
      const canvas = await pictureFrom(new Blob([turned], { type: 'image/jpeg' }), 'turned.jpg')
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let left = canvas.width
      let right = -1
      let top = canvas.height
      let bottom = -1
      for (let y = 0; y < canvas.height; y += 2)
        for (let x = 0; x < canvas.width; x += 2)
          if (pixels[(y * canvas.width + x) * 4] < 128) {
            left = Math.min(left, x)
            right = Math.max(right, x)
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
      return { width: canvas.width, height: canvas.height, left, right, top, bottom }
    })
    // the photo as it was taken, upright: 4500 × 6000 made smaller to 16 million pixels at most
    expect([found.width, found.height]).toEqual([3464, 4618])
    // the square, still square, where a quarter turn right puts it (x 2500-3500, y 1000-2000 of 4500 × 6000)
    const k = 3464 / 4500
    expect(Math.abs(found.right - found.left - (found.bottom - found.top))).toBeLessThan(8)
    expect(Math.abs(found.left - 2500 * k)).toBeLessThan(8)
    expect(Math.abs(found.top - 1000 * k)).toBeLessThan(8)
  })

  test('"Make this code again" is left off a scanned barcode zint won’t make', async ({ page }) => {
    // zint, asked to make this EAN-13 again, says no (as it does for some GS1 data the reader takes)
    await page.addInitScript(() => {
      const Real = window.Worker
      window.Worker = class extends Real {
        private readonly writes: boolean
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options)
          this.writes = String(url).includes('write.worker')
        }
        override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
          const m = message as { id?: number; ask?: { text?: string } }
          if (this.writes && m.ask?.text === '9506000134352') {
            setTimeout(() => this.onmessage?.call(this, new MessageEvent('message', { data: { id: m.id, ok: true, svg: null, error: 'Invalid data' } })))
            return
          }
          super.postMessage(message, transfer as Transferable[])
        }
      } as typeof Worker
    })
    await openScan(page)
    const ean = await codePicture('EAN13', '9506000134352')
    const qr = await codePicture('QRCode', 'https://b0r3d.org/again')
    const both = new PNG({ width: Math.max(ean.width, qr.width) + 80, height: ean.height + qr.height + 120 })
    both.data.fill(255)
    PNG.bitblt(ean, both, 0, 0, ean.width, ean.height, 40, 40)
    PNG.bitblt(qr, both, 0, 0, qr.width, qr.height, 40, ean.height + 80)
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'two.png', mimeType: 'image/png', buffer: PNG.sync.write(both) })
    await expect(cards(page)).toHaveCount(2, { timeout: 30_000 })
    const eanCard = cards(page).filter({ hasText: 'EAN-13' })
    const qrCard = cards(page).filter({ hasText: 'QR code' })
    await expect(eanCard.locator('.found-text')).toHaveValue('9506000134352')
    await expect(eanCard.getByRole('button', { name: /^Make this code again/ })).toHaveCount(0)
    // a code it does make keeps the button
    await expect(qrCard.getByRole('button', { name: /^Make this code again/ })).toHaveCount(1)
  })
})
