import { expect, test, type Page } from '@playwright/test'
import { blank, cards, codePicture, openScan, scanStatus as status, sheet } from './scanning'
import { openPage } from './helpers'

// The Scan tab, as b0r3d QR for PC has it (without its screen and folder scans): codes read from
// pictures (opened, several at once, pasted, dropped), each with its card. The camera is in
// camera.spec.ts.

/** A file dropped on the page at a point (a picture with no file name when `copied`). */
async function drop(page: Page, bytes: Buffer, name: string, at: { x: number; y: number } | null = null): Promise<void> {
  await page.evaluate(
    ({ b64, name, at }) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([data], name, { type: 'image/png' }))
      const target = at ? (document.elementFromPoint(at.x, at.y) ?? document.body) : document.body
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: at?.x ?? 1, clientY: at?.y ?? 1 }))
    },
    { b64: bytes.toString('base64'), name, at }
  )
}

test.describe('the Scan tab', () => {
  test('a picture opened from a file: every code in it, each with its card', async ({ page }) => {
    const file = sheet([
      await codePicture('QRCode', 'http://b0r3d.org'),
      await codePicture('EAN13', '9506000134352'),
      await codePicture('DataMatrix', 'WIFI:T:WPA;S:home;P:naps-all-day;;', 'forceSquare'),
      await codePicture('Code128', '(01)09506000134352(10)ABC123', 'gs1')
    ])
    await openScan(page)
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'codes.png', mimeType: 'image/png', buffer: file })
    await expect(status(page)).toHaveText('4 codes in codes.png', { timeout: 30_000 })
    await expect(cards(page)).toHaveCount(4)
    await expect(cards(page).locator('.found-kind')).toHaveText(['Link', 'Product number', 'Wi-Fi network', 'Text'])
    await expect(cards(page).locator('.found-summary')).toHaveText([
      'QR code · b0r3d.org · codes.png',
      'EAN-13 · codes.png',
      'Data Matrix · network home, WPA · codes.png',
      'GS1-128 · codes.png'
    ])
    // what each holds (the Wi-Fi password too, as the PC app shows it, but never in the line above)
    await expect(cards(page).nth(3).locator('.found-text')).toHaveValue('(01)09506000134352(10)ABC123')
    await expect(cards(page).nth(2).locator('.found-text')).toHaveValue('WIFI:T:WPA;S:home;P:naps-all-day;;')
    await expect(cards(page).nth(0)).toHaveAttribute('aria-label', 'Link, b0r3d.org')
    await expect(cards(page).nth(0).getByRole('button')).toHaveText(['Copy text', 'Open link…', 'Make this code again'])
    await expect(cards(page).nth(1).getByRole('button')).toHaveText(['Copy text', 'Make this code again'])
    await expect(cards(page).locator('.found-picture img')).toHaveCount(4)
    await page.getByTestId('scan-clear').click()
    await expect(cards(page)).toHaveCount(0)
    await expect(status(page)).toHaveText('')
  })

  test('several pictures: a line for each one without a code, and one line that sums it up', async ({ page }) => {
    await openScan(page)
    await page.getByTestId('scan-open-file').setInputFiles([
      { name: 'codes.png', mimeType: 'image/png', buffer: sheet([await codePicture('Aztec', 'hello'), await codePicture('Code39', 'A+B')]) },
      { name: 'blank.png', mimeType: 'image/png', buffer: blank(300, 200) },
      { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') }
    ])
    await expect(status(page)).toHaveText("2 codes in 1 of 3 pictures; no code in 1; 1 couldn't be opened.", { timeout: 30_000 })
    await expect(cards(page).locator('.found-kind')).toHaveText(['Text', 'Text', 'No code found', "Couldn't open"])
    // Code 39 read as it's printed: "+B" stays +B
    await expect(cards(page).nth(1).locator('.found-text')).toHaveValue('A+B')
    await expect(cards(page).locator('.found-summary')).toHaveText(['Aztec · codes.png', 'Code 39 · codes.png', 'blank.png', "it isn't a picture, or it's damaged · notes.png"])
    await expect(cards(page).nth(2).getByRole('button')).toHaveCount(0)
    // one that isn't a picture, on its own
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
    await expect(status(page)).toHaveText("Couldn't open notes.pdf: it's a PDF, so open it and take a screenshot of the code instead.")
    await expect(cards(page)).toHaveCount(0)
  })

  test('Ctrl+V with a picture copied reads it, wherever the page is', async ({ page }) => {
    const picture = sheet([await codePicture('PDF417', 'b0r3d PDF417 example')])
    await openPage(page)
    await page.locator('#data').focus()
    await page.evaluate((b64) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([data], 'image.png', { type: 'image/png' }))
      document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, picture.toString('base64'))
    await expect(page.getByRole('tab', { name: 'Scan' })).toHaveAttribute('aria-selected', 'true')
    await expect(status(page)).toHaveText('1 code in the copied picture', { timeout: 30_000 })
    await expect(cards(page).locator('.found-summary')).toHaveText(['PDF417 · the copied picture'])
    // picture files copied: read as files
    const other = sheet([await codePicture('EAN8', '9638507')])
    await page.evaluate(
      ([a, b]) => {
        const dt = new DataTransfer()
        for (const [b64, name] of [
          [a, 'first.png'],
          [b, 'second.png']
        ])
          dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/png' }))
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      },
      [picture.toString('base64'), other.toString('base64')]
    )
    await expect(status(page)).toHaveText('2 codes in 2 of 2 pictures.', { timeout: 30_000 })
    await expect(cards(page).locator('.found-summary')).toHaveText(['PDF417 · first.png', 'EAN-8 · second.png'])
    // with text copied too, a text box pastes it as usual: nothing is read
    await page.getByTestId('scan-clear').click()
    await page.evaluate((b64) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.setData('text/plain', 'words')
      dt.items.add(new File([data], 'image.png', { type: 'image/png' }))
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, picture.toString('base64'))
    await expect(status(page)).toHaveText('')
  })

  test('a picture dropped on the page is read; dropped on the Logo section, it’s the logo', async ({ page }) => {
    const picture = sheet([await codePicture('UPCA', '03600029145')])
    await openPage(page)
    // on the Logo section: the logo
    const logo = page.locator('details.sec', { hasText: 'Logo' })
    await logo.locator('summary').click()
    const box = await logo.boundingBox()
    if (!box) throw new Error('no Logo section')
    await drop(page, picture, 'bars.png', { x: box.x + box.width / 2, y: box.y + 20 })
    await expect(page.getByTestId('logo-note')).toHaveText('Logo set. Drop or paste another to change it.')
    await expect(page.getByRole('tab', { name: 'Create' })).toHaveAttribute('aria-selected', 'true')
    // anywhere else: read on the Scan tab, as a UPC-A with its 12 digits
    await drop(page, picture, 'bars.png')
    await expect(status(page)).toHaveText('1 code in bars.png', { timeout: 30_000 })
    await expect(cards(page).locator('.found-summary')).toHaveText(['UPC-A · bars.png'])
    await expect(cards(page).locator('.found-text')).toHaveValue('036000291452')
  })

  test('a link opens only after a question that shows where it goes', async ({ page, context }) => {
    await context.route('http://b0r3d.org/**', (route) => route.fulfill({ contentType: 'text/plain', body: 'here' }))
    await openScan(page)
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'link.png', mimeType: 'image/png', buffer: sheet([await codePicture('QRCode', 'http://b0r3d.org')]) })
    await expect(status(page)).toHaveText('1 code in link.png', { timeout: 30_000 })
    await cards(page).getByRole('button', { name: 'Open link (Link, b0r3d.org)' }).click()
    const ask = page.getByTestId('link-dialog')
    await expect(ask).toBeVisible()
    await expect(page.getByTestId('link-url')).toHaveText('http://b0r3d.org/')
    await expect(page.getByTestId('link-warnings').locator('li')).toHaveText(["It isn't encrypted (http, not https)."])
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(ask).toBeHidden()
    await cards(page).getByRole('button', { name: 'Open link (Link, b0r3d.org)' }).click()
    const [opened] = await Promise.all([context.waitForEvent('page'), page.getByTestId('link-open').click()])
    await expect(opened).toHaveURL('http://b0r3d.org/')
    await opened.close()
  })

  test('Make this code again: a QR code with its text, a barcode as its own type', async ({ page }) => {
    await openScan(page)
    await page.getByTestId('scan-open-file').setInputFiles({
      name: 'two.png',
      mimeType: 'image/png',
      buffer: sheet([await codePicture('QRCode', 'line one\r\nline two'), await codePicture('UPCE', '01234565')])
    })
    await expect(status(page)).toHaveText('2 codes in two.png', { timeout: 30_000 })
    await cards(page).nth(1).getByRole('button', { name: /^Make this code again/ }).click()
    await expect(page.getByRole('tab', { name: 'Create' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('code-type')).toHaveValue('upce')
    await expect(page.locator('#barcode-data')).toHaveValue('01234565')
    await expect(page.getByTestId('status')).toHaveText('Made from the scanned code: the same type and text')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await page.getByRole('tab', { name: 'Scan' }).click()
    await cards(page).nth(0).getByRole('button', { name: /^Make this code again/ }).click()
    await expect(page.getByTestId('code-type')).toHaveValue('')
    await expect(page.locator('#data')).toHaveValue('line one\nline two')
    await expect(page.getByTestId('status')).toHaveText('Made from the scanned code: the same text and error correction')
    // the text exactly as it was read, its CR LF too: the code made again reads the same
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
  })

  test('a scanned barcode’s line breaks stay as they were read, after another type and back', async ({ page, isMobile }) => {
    await openScan(page)
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'dm.png', mimeType: 'image/png', buffer: sheet([await codePicture('DataMatrix', 'one\r\ntwo', 'forceSquare')]) })
    await expect(status(page)).toHaveText('1 code in dm.png', { timeout: 30_000 })
    await cards(page).getByRole('button', { name: /^Make this code again/ }).click()
    await expect(page.getByTestId('code-type')).toHaveValue('datamatrix')
    await page.getByTestId('code-type').selectOption('aztec')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await page.getByTestId('code-type').selectOption('datamatrix')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    // (on a phone the files are under Save)
    if (isMobile) await page.locator('.export-toggle').click()
    await Promise.all([page.waitForEvent('download'), page.getByTestId('save-png').click()])
    // kept in Recent codes as it was read: CR LF
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<string[]>((resolve) => {
              const r = indexedDB.open('b0r3d-qr')
              r.onsuccess = () => {
                const all = r.result.transaction('codes').objectStore('codes').getAll()
                all.onsuccess = () => resolve(all.result.map((c: { key: string }) => c.key))
              }
            })
        )
      )
      .toEqual(['barcode:datamatrix:one\r\ntwo'])
  })

  test.describe('on a first visit, before the offline copy has kept anything', () => {
    // (a service worker would also keep Playwright from stopping the file)
    test.use({ serviceWorkers: 'block' })

    test('a reader that didn’t load says so, and is tried again', async ({ page }) => {
      const picture = sheet([await codePicture('EAN13', '9506000134352')])
      await openScan(page)
      // the reader's WebAssembly file doesn't come (no connection), then does
      let blocked = true
      await page.route(/zxing_reader[^/]*\.wasm/, (route) => (blocked ? route.abort() : route.continue()))
      await page.getByTestId('scan-open-file').setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: picture })
      await expect(status(page)).toHaveText("The code reader didn't load, so nothing can be read. Check the connection, then try again.", { timeout: 30_000 })
      await expect(status(page)).toHaveAttribute('data-kind', 'warn')
      blocked = false
      await page.getByTestId('scan-open-file').setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: picture })
      await expect(status(page)).toHaveText('1 code in one.png', { timeout: 30_000 })
    })
  })

  test('Cancel and Esc stop a read', async ({ page }) => {
    const big = blank(4000, 3000)
    const files = Array.from({ length: 6 }, (_, i) => ({ name: `big-${i}.png`, mimeType: 'image/png', buffer: big }))
    await openScan(page)
    await page.getByTestId('scan-open-file').setInputFiles(files)
    await expect(page.getByTestId('scan-cancel')).toBeVisible()
    await expect(page.getByTestId('scan-open')).toBeDisabled()
    await page.getByTestId('scan-cancel').click()
    await expect(status(page)).toHaveText('Stopped.')
    await expect(page.getByTestId('scan-cancel')).toBeHidden()
    await expect(page.getByTestId('scan-open')).toBeEnabled()
    await page.getByTestId('scan-open-file').setInputFiles(files)
    await expect(page.getByTestId('scan-cancel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(status(page)).toHaveText('Stopped.')
    // and the next read works
    await page.getByTestId('scan-open-file').setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: sheet([await codePicture('EAN8', '9638507')]) })
    await expect(status(page)).toHaveText('1 code in one.png', { timeout: 30_000 })
  })
})
