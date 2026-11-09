import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { readCodes } from '../../src/test/zxing'
import { bytesOf, openPage } from './helpers'

// The other barcodes, as b0r3d QR for PC makes them: the Code type list, what's typed for each type,
// the barcode's settings, its scan check, "What's in this code" and its files.

const check = (page: Page) => page.getByTestId('check')
const rows = (page: Page) => page.getByTestId('in-code-rows')
const barcodeSettings = (page: Page) => page.locator('details.sec', { hasText: 'Barcode settings' })

/** Picks a code type and waits for its barcode's scan check to pass. */
async function chooseType(page: Page, id: string): Promise<void> {
  await page.getByTestId('code-type').selectOption(id)
  await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
}

async function save(page: Page, kind: 'png' | 'jpg' | 'svg' | 'pdf'): Promise<{ name: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`save-${kind}`).click()])
  return { name: download.suggestedFilename(), bytes: await bytesOf(download) }
}

const TYPES = [
  ['', 'QR code', ''],
  ['datamatrix', 'Data Matrix', '2D codes'],
  ['gs1-datamatrix', 'GS1 DataMatrix', '2D codes'],
  ['aztec', 'Aztec', '2D codes'],
  ['pdf417', 'PDF417', '2D codes'],
  ['ean13', 'EAN-13', 'Product barcodes'],
  ['ean8', 'EAN-8', 'Product barcodes'],
  ['upca', 'UPC-A', 'Product barcodes'],
  ['upce', 'UPC-E', 'Product barcodes'],
  ['isbn', 'ISBN', 'Product barcodes'],
  ['code128', 'Code 128', 'Shipping and inventory'],
  ['gs1-128', 'GS1-128', 'Shipping and inventory'],
  ['itf14', 'ITF-14', 'Shipping and inventory'],
  ['code39', 'Code 39', 'Shipping and inventory']
]

test.describe('the other barcodes', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop layout')

  test('every type is made from its example, scans, and says what is in it', async ({ page }) => {
    await openPage(page)
    const listed = await page
      .getByTestId('code-type')
      .locator('option')
      .evaluateAll((options) => options.map((o) => [(o as HTMLOptionElement).value, o.textContent, o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : '']))
    expect(listed).toEqual(TYPES)
    for (const [id, label] of TYPES.slice(1)) {
      await chooseType(page, id)
      await expect(rows(page)).toContainText('Type' + label)
      await expect(page.getByTestId('preview')).toHaveAttribute('aria-label', `${label} barcode`)
      await expect(page.locator('#file-name')).toHaveValue(id)
    }
    // and back to QR codes, as they were
    await page.getByTestId('code-type').selectOption('')
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await expect(page.locator('#data')).toBeVisible()
    await expect(page.locator('#barcode-data')).toBeHidden()
    await expect(page.locator('#file-name')).toHaveValue('qr-code')
    await expect(page.getByTestId('save-txt')).toBeEnabled()
    await expect(page.getByTestId('save-design')).toBeEnabled()
  })

  test('its files: PNG and JPG at whole pixels a module, the SVG, the PDF, named after the type', async ({ page }) => {
    await openPage(page)
    await chooseType(page, 'ean13')
    await expect(rows(page)).toHaveText('TypeEAN-13Stored9506000134352Check digit2, added for youSize113 × 59 modules, blank margin included')
    await expect(page.getByTestId('barcode-scale-hint')).toHaveText('Downloads are 452 × 236 px. Use Size for print for a physical size.')
    // text and design files are QR codes' only, as in the PC app
    await expect(page.getByTestId('save-txt')).toBeDisabled()
    await expect(page.getByTestId('save-design')).toBeDisabled()

    const png = await save(page, 'png')
    expect(png.name).toBe('ean13.png')
    const picture = PNG.sync.read(png.bytes)
    expect([picture.width, picture.height]).toEqual([452, 236])
    const [found] = await readCodes({ width: picture.width, height: picture.height, data: new Uint8ClampedArray(picture.data) }, ['EAN13'])
    expect(found?.text).toBe('9506000134352')
    const jpg = await save(page, 'jpg')
    expect([jpg.name, jpg.bytes.subarray(0, 3).toString('hex')]).toEqual(['ean13.jpg', 'ffd8ff'])
    const svg = await save(page, 'svg')
    expect(svg.name).toBe('ean13.svg')
    expect(svg.bytes.toString('utf8')).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 113 59" width="452" height="236" shape-rendering="crispEdges">\n <g id="barcode" fill="#000000">/)
    const pdf = await save(page, 'pdf')
    expect([pdf.name, pdf.bytes.subarray(0, 5).toString('latin1')]).toEqual(['ean13.pdf', '%PDF-'])

    // two pixels a module
    await page.locator('#barcode-scale').fill('2')
    await expect(page.getByTestId('barcode-scale-hint')).toHaveText('Downloads are 226 × 118 px. Use Size for print for a physical size.')
    const small = PNG.sync.read((await save(page, 'png')).bytes)
    expect([small.width, small.height]).toEqual([226, 118])
    // a name typed is kept, whatever the type
    await page.locator('#file-name').fill('my bars')
    await page.getByTestId('code-type').selectOption('code39')
    await expect(page.locator('#file-name')).toHaveValue('my bars')
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    expect((await save(page, 'svg')).name).toBe('my bars.svg')
  })

  test('what’s wrong is said, and the barcode comes back once it’s fixed', async ({ page }) => {
    await openPage(page)
    await chooseType(page, 'ean13')
    const box = page.locator('#barcode-data')
    await box.fill('95060001343A')
    await expect(page.getByTestId('barcode-error')).toHaveText('EAN-13 can only hold digits.')
    await expect(page.getByTestId('stage-note')).toHaveText('Fix the data to see the barcode.')
    await expect(page.getByTestId('preview')).toBeHidden()
    await expect(check(page)).toHaveText('')
    for (const f of ['png', 'jpg', 'svg', 'pdf', 'txt']) await expect(page.getByTestId(`save-${f}`)).toBeDisabled()
    await expect(page.getByTestId('copy-picture')).toBeDisabled()
    await box.fill('9506000134353')
    await expect(page.getByTestId('barcode-error')).toHaveText("The check digit (the last digit) should be 2. Leave it off and it's added for you.")
    await box.fill('9506000134352')
    await expect(page.getByTestId('barcode-error')).toBeHidden()
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await expect(page.getByTestId('save-png')).toBeEnabled()
    // what only zint checks is said in its words
    await chooseType(page, 'gs1-128')
    await box.fill('(99)ÄÖ')
    await expect(page.getByTestId('barcode-error')).toHaveText('Extended ASCII characters are not supported by GS1')
  })

  test('what’s typed is kept for each type while the page is open', async ({ page }) => {
    await openPage(page)
    await chooseType(page, 'code128')
    await expect(page.locator('#barcode-data')).toHaveValue('B0R3D-128')
    await expect(page.locator('#barcode-data')).toHaveClass(/mono/)
    await page.locator('#barcode-data').fill('ASSET 42')
    await expect(rows(page)).toContainText('StoredASSET 42')
    await chooseType(page, 'datamatrix')
    await expect(page.locator('#barcode-data')).toHaveValue('https://b0r3d.org')
    await expect(page.locator('#barcode-data')).not.toHaveClass(/mono/)
    await chooseType(page, 'code128')
    await expect(page.locator('#barcode-data')).toHaveValue('ASSET 42')
    // and the QR code's text is its own
    await page.getByTestId('code-type').selectOption('')
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org')
  })

  test('its settings, as the PC app has them', async ({ page }) => {
    await openPage(page)
    await chooseType(page, 'ean13')
    const s = barcodeSettings(page)
    const size = (w: number, h: number) => expect(rows(page)).toContainText(`Size${w} × ${h} modules`)
    await size(113, 59)
    await s.getByLabel('Show the text under the bars').uncheck()
    await size(113, 55)
    await s.getByLabel('Show the text under the bars').check()
    // without quiet zones, a note says to leave room where it's placed
    await expect(page.getByTestId('quiet-zones-note')).toBeHidden()
    await s.getByLabel('Include quiet zones (margins)').uncheck()
    await size(106, 59)
    await expect(page.getByTestId('quiet-zones-note')).toHaveText(
      'Leave blank space on both sides where you place it, about 10 times the thinnest bar: scanners need it to find the code.'
    )
    await s.getByLabel('Include quiet zones (margins)').check()
    // the bars' height, kept between 20 and 150
    await s.getByLabel('Bar height in modules').fill('100')
    await size(113, 109)
    await s.getByLabel('Bar height in modules').fill('7')
    await s.getByLabel('Bar height in modules').blur()
    await expect(s.getByLabel('Bar height in modules')).toHaveValue('20')
    await size(113, 29)
    // low contrast is warned about; a see-through background too
    await s.getByLabel('Bars colour').fill('#bbbbbb')
    await expect(page.getByTestId('warnings')).toHaveText('⚠ Low contrast (1.9:1) between the code and its background. Dark on light with at least 4:1 scans best.')
    await s.getByLabel('Bars colour').fill('#000000')
    await expect(page.getByTestId('warnings')).toBeHidden()
    await s.getByLabel('Transparent background').check()
    await expect(s.getByLabel('Background colour')).toBeDisabled()
    await expect(page.getByTestId('warnings')).toHaveText('⚠ Transparent background: put the code on a plain, light surface.')
    // the settings for bars aren't shown for 2D codes; a rectangle only for Data Matrix
    await expect(s.getByLabel('Allow a rectangular code (narrower; fewer scanners read it)')).toBeHidden()
    await chooseType(page, 'datamatrix')
    await expect(s.getByLabel('Show the text under the bars')).toBeHidden()
    await size(20, 20)
    await s.getByLabel('Allow a rectangular code (narrower; fewer scanners read it)').check()
    await size(28, 14)
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    // ITF-14's quiet zones are part of it; the settings are one set for every type (its bars 20 high, as set above)
    await chooseType(page, 'itf14')
    await expect(s.getByLabel('Include quiet zones (margins)')).toBeHidden()
    await size(165, 39)
  })

  test('a barcode goes to Recent codes with its settings, and opens again', async ({ page }) => {
    await openPage(page)
    await chooseType(page, 'upca')
    await barcodeSettings(page).getByLabel('Show the text under the bars').uncheck()
    await page.locator('#barcode-scale').fill('3')
    await expect(page.getByTestId('barcode-scale-hint')).toHaveText('Downloads are 339 × 165 px. Use Size for print for a physical size.')
    await save(page, 'png')
    await expect(page.getByTestId('recent-note')).toBeVisible()
    // other settings, back to QR codes, then the barcode from Recent codes: its type, text and settings
    await barcodeSettings(page).getByLabel('Show the text under the bars').check()
    await page.locator('#barcode-scale').fill('5')
    await page.getByTestId('code-type').selectOption('')
    await page.getByTestId('recent-codes').click()
    const w = page.getByTestId('recent-dialog')
    await expect(w.locator('.recent-row strong')).toHaveText(['UPC-A: 03600029145'])
    await expect(w.locator('.recent-row img')).toHaveAttribute('src', /^data:image\/svg\+xml;charset=utf-8,%3Csvg/)
    await w.getByRole('button', { name: 'Open UPC-A: 03600029145' }).click()
    await expect(w).toBeHidden()
    await expect(page.getByTestId('code-type')).toHaveValue('upca')
    await expect(page.locator('#barcode-data')).toHaveValue('03600029145')
    await expect(barcodeSettings(page).getByLabel('Show the text under the bars')).not.toBeChecked()
    await expect(page.locator('#barcode-scale')).toHaveValue('3')
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
  })

  test('the settings are kept from one visit to the next, where today’s site keeps them', async ({ page }) => {
    // what today's site keeps (seen by running it), read back
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem(
        'b0r3d-qr.barcode-settings',
        JSON.stringify({ color: '#000000', background: '#ffffff', transparent: false, scale: 4, showText: false, allowRectangular: false, barHeight: 80, quietZones: true })
      )
    })
    await openPage(page)
    await chooseType(page, 'ean13')
    const s = barcodeSettings(page)
    await expect(s.getByLabel('Show the text under the bars')).not.toBeChecked()
    await expect(s.getByLabel('Bar height in modules')).toHaveValue('80')
    await expect(rows(page)).toContainText('Size113 × 85 modules')
    // a change is kept in the same shape, and comes back after a reload (the type and text don't)
    await page.locator('#barcode-scale').fill('6')
    await s.getByLabel('Bars colour').fill('#223344')
    expect(await page.evaluate(() => localStorage.getItem('b0r3d-qr.barcode-settings'))).toBe(
      '{"color":"#223344","background":"#ffffff","transparent":false,"scale":6,"showText":false,"allowRectangular":false,"barHeight":80,"quietZones":true}'
    )
    await page.reload()
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await expect(page.getByTestId('code-type')).toHaveValue('')
    await chooseType(page, 'code39')
    await expect(page.locator('#barcode-scale')).toHaveValue('6')
    await expect(s.getByLabel('Bars colour')).toHaveValue('#223344')
    await expect(page.locator('#barcode-data')).toHaveValue('B0R3D-39')
  })

  test.describe('on a first visit, before the offline copy has kept anything', () => {
    // (a service worker would also keep Playwright from stopping the file)
    test.use({ serviceWorkers: 'block' })

    test('when the barcode maker itself fails, the data isn’t blamed, and it’s tried again', async ({ page }) => {
      // its WebAssembly file doesn't come (no connection), then does
      let blocked = true
      await page.route(/zxing_writer[^/]*\.wasm/, (route) => (blocked ? route.abort() : route.continue()))
      await openPage(page)
      await page.getByTestId('code-type').selectOption('ean13')
      await expect(page.getByTestId('stage-note')).toHaveText("Couldn't make the barcode.", { timeout: 20_000 })
      await expect(page.getByTestId('stage-note')).toHaveAttribute('data-problem', 'true')
      await expect(page.getByTestId('barcode-error')).toHaveText("Couldn't make the barcode: the barcode maker didn't load. Check the connection, then try again.")
      blocked = false
      await page.locator('#barcode-data').fill('9506000134352')
      await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
      await expect(page.getByTestId('barcode-error')).toBeHidden()
    })
  })

  test('opening a design file goes back to QR codes', async ({ page }) => {
    await openPage(page)
    await page.locator('#data').fill('from a file')
    const [saved] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-design').click()])
    const design = await bytesOf(saved)
    await page.locator('#data').fill('something else')
    await chooseType(page, 'aztec')
    await page.getByTestId('open-design-file').setInputFiles({ name: 'qr-code-config.json', mimeType: 'application/json', buffer: design })
    await expect(page.getByTestId('code-type')).toHaveValue('')
    await expect(page.locator('#data')).toHaveValue('from a file')
    await expect(check(page)).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
  })
})

test.describe('the other barcodes on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the phone layout')

  test('the barcode fits the bar at the bottom, and its files are under Save', async ({ page }) => {
    await openPage(page)
    await chooseType(page, 'gs1-128')
    const width = page.viewportSize()?.width ?? 0
    const box = await page.getByTestId('preview').boundingBox()
    if (!box) throw new Error('no barcode on show')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.height).toBeLessThanOrEqual(121)
    await page.locator('.export-toggle').click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-png').click()])
    expect(download.suggestedFilename()).toBe('gs1-128.png')
  })
})
