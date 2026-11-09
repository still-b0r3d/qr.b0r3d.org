import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
import { zipEntries, zipRead } from '../../src/qr/zip'
import { readCodes } from '../../src/test/zxing'
import { bytesOf, openPage, readPng } from './helpers'

// Batch export, as b0r3d QR for PC has it: a CSV's rows, each made into a file with the Create tab's
// design or barcode settings and named as the site has always named them, in one zip; the rows that
// can't be made listed first, each row shown in turn, every file read back out of the zip and
// scanned.

/** the PC app's answers (its example files among them) */
const pc = JSON.parse(readFileSync(new URL('../../src/test/pc-app-batch.json', import.meta.url), 'utf8')) as { examples: { qr: string } }

const dialog = (page: Page) => page.getByTestId('batch-dialog')
const status = (page: Page) => page.getByTestId('batch-status')

/** The Batch export window, from the Save box (behind its button on a phone). */
async function openBatch(page: Page): Promise<void> {
  const toggle = page.locator('.export-toggle')
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.getByTestId('batch-export').click()
  await expect(dialog(page)).toBeVisible()
}

async function chooseCsv(page: Page, text: string, name = 'batch.csv'): Promise<void> {
  await page.getByTestId('batch-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) })
}

/** Makes the files: the zip handed over, and each file in it. */
async function makeZip(page: Page): Promise<{ name: string; files: Map<string, Buffer> }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('batch-make').click()])
  const zip = new Blob([new Uint8Array(await bytesOf(download))])
  const files = new Map<string, Buffer>()
  for (const entry of await zipEntries(zip)) files.set(entry.name, Buffer.from(await zipRead(zip, entry)))
  await expect(status(page)).toHaveText(/^(Made|No files)/, { timeout: 60_000 })
  return { name: download.suggestedFilename(), files }
}

test.describe('batch export', () => {
  test('the example makes a zip of PNGs, named from its rows, each read back and scanned', async ({ page }) => {
    await openPage(page)
    await openBatch(page)
    // the example to start from
    const [example] = await Promise.all([page.waitForEvent('download'), page.getByTestId('batch-example').click()])
    expect(example.suggestedFilename()).toBe('batch-example.csv')
    const exampleText = (await bytesOf(example)).toString('utf8')
    expect(exampleText).toBe(pc.examples.qr)
    await chooseCsv(page, exampleText, 'batch-example.csv')
    await expect(page.getByTestId('batch-file-line')).toHaveText('batch-example.csv · 4 rows')
    await expect(page.getByTestId('batch-heading')).toHaveText('All 4 rows can be made.')
    // its captions put the frame on, as the site always did
    await expect(page.getByTestId('batch-frame')).toBeChecked()
    // each row in turn
    await expect(page.getByTestId('batch-row-number')).toHaveText('Row 1 of 4 · line 2 of the file')
    await expect(page.getByTestId('batch-row')).toContainText('Datahttps://b0r3d.orgFrame textVisit b0r3d.orgFont familyPoppinsFileb0r3d_home.png')
    await expect(page.getByTestId('batch-picture')).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Next row' }).click()
    await expect(page.getByTestId('batch-row')).toContainText('Frame textMake your own codes')
    await expect(page.getByTestId('batch-make')).toHaveText('Make 4 files')

    const zip = await makeZip(page)
    expect(zip.name).toBe('qr-codes.zip')
    expect([...zip.files.keys()]).toEqual(['b0r3d_home.png', 'qr_maker.png', 'b0r3d_95.png', 'plain_text.png'])
    const texts = ['https://b0r3d.org', 'https://qr.b0r3d.org', 'https://b0r3d.org/95', 'Plain text works too']
    let i = 0
    for (const bytes of zip.files.values()) expect((await readPng(bytes)).text).toBe(texts[i++])
    await expect(status(page)).toHaveText('Made 4 files in qr-codes.zip, each read back and scanned.')
    await expect(page.getByTestId('batch-said')).toHaveText('Made 4 files in qr-codes.zip, each read back and scanned.')
  })

  test('rows that can’t be made are listed and left out; text files are named by their place', async ({ page }) => {
    await openPage(page)
    await openBatch(page)
    await dialog(page).getByRole('button', { name: 'Text' }).click()
    await chooseCsv(page, 'url,frameText,fileName\nfirst,,\n' + 'x'.repeat(3000) + ',,\nthird,,\nfourth,,mine\n')
    await expect(page.getByTestId('batch-heading')).toHaveText("1 row of 4 can't be made, and will be left out:")
    await expect(page.getByTestId('batch-problems')).toContainText(/^Row 3: x{57}… · /)
    await expect(page.getByTestId('batch-settings')).toHaveText("Text uses the Create tab's error correction and size, with no logo or frame.")
    const zip = await makeZip(page)
    expect(zip.name).toBe('qr-codes-ascii-unicode-half.zip')
    expect([...zip.files.keys()]).toEqual(['qr-0.txt', 'qr-2.txt', 'mine.txt'])
    expect(zip.files.get('qr-0.txt')!.toString('utf8')).toMatch(/^[ █▀▄\n]+$/)
    await expect(status(page)).toHaveText("Made 3 files in qr-codes-ascii-unicode-half.zip, each read back and scanned. 1 row couldn't be made (listed above).")
  })

  test('barcodes: the type’s own checks, names from the file, and files that scan', async ({ page }) => {
    test.slow()
    await openPage(page)
    await page.getByTestId('code-type').selectOption('ean13')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await openBatch(page)
    await expect(dialog(page).locator('.batch-what')).toHaveText("EAN-13 barcodes with the Create tab's barcode settings: a file for every row of a CSV, all in one zip file.")
    await expect(dialog(page).getByRole('button', { name: 'Text' })).toBeHidden()
    await expect(page.getByTestId('batch-contacts-example')).toBeHidden()
    await chooseCsv(page, 'code,name\r\n590123412345,first\r\n4006381333931,second\r\n12345,bad\r\n,blank\r\n9780306406157,first\r\n')
    await expect(page.getByTestId('batch-heading')).toHaveText("1 row of 4 can't be made, and will be left out:", { timeout: 20_000 })
    await expect(page.getByTestId('batch-problems')).toHaveText('Row 4: 12345 · EAN-13 needs 12 digits (or 13 with the check digit); this has 5.')
    const zip = await makeZip(page)
    expect(zip.name).toBe('ean13-batch.zip')
    expect([...zip.files.keys()]).toEqual(['first.png', 'second.png', 'first_2.png'])
    const read = []
    for (const bytes of zip.files.values()) {
      const png = PNG.sync.read(bytes)
      read.push((await readCodes({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }, ['EAN13']))[0]?.text)
    }
    expect(read).toEqual(['5901234123457', '4006381333931', '9780306406157'])
    await expect(status(page)).toHaveText("Made 3 files in ean13-batch.zip, each read back and scanned. 1 row couldn't be made (listed above).")
  })

  test('a file that doesn’t scan when read back is said so', async ({ page }) => {
    await openPage(page)
    // dots too pale to read
    const design = { schemaVersion: 1, props: { data: 'x', width: 200, height: 200, margin: 4, dotsOptions: { color: '#f2f2f2', type: 'square' }, cornersSquareOptions: { color: '#f2f2f2', type: 'square' }, cornersDotOptions: { color: '#f2f2f2', type: 'square' }, qrOptions: { errorCorrectionLevel: 'M', typeNumber: 0 } }, style: { borderRadius: '0px', background: '#ffffff' }, frame: null }
    await page.getByTestId('open-design-file').setInputFiles({ name: 'pale.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(design)) })
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'unreadable', { timeout: 20_000 })
    await openBatch(page)
    await chooseCsv(page, 'url,frameText,fileName\nhttps://b0r3d.org,,pale\n')
    await expect(page.getByTestId('batch-heading')).toHaveText('The row can be made.')
    await expect(page.getByTestId('batch-make')).toHaveText('Make the file')
    await makeZip(page)
    await expect(status(page)).toHaveText("Made 1 file in qr-codes.zip. 1 file didn't scan when read back: try more contrast or a larger size.")
    await expect(page.getByTestId('batch-outcome')).toHaveText("pale.png: didn't scan when read back")
  })

  test('a CSV dropped on the Create tab opens the window with it; CSVs that can’t be used say why', async ({ page }) => {
    await openPage(page)
    await page.evaluate((text) => {
      const dt = new DataTransfer()
      dt.items.add(new File([text], 'dropped.csv', { type: 'text/csv' }))
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 1, clientY: 1 }))
    }, 'url\nhttps://b0r3d.org\nhttps://qr.b0r3d.org\n')
    await expect(dialog(page)).toBeVisible()
    await expect(page.getByTestId('batch-file-line')).toHaveText('dropped.csv · 2 rows')
    // no caption in the file: no frame
    await expect(page.getByTestId('batch-frame')).not.toBeChecked()
    await chooseCsv(page, 'url,frameText\nhttps://b0r3d.org,x\n,no text\n', 'gaps.csv')
    await expect(page.getByTestId('batch-problem')).toHaveText(
      "That CSV can't be used: the first row names the columns, and every row after it needs its text in the first column (in a file of contacts, a firstName and a lastName)."
    )
    // (the file read before stays)
    await expect(page.getByTestId('batch-file-line')).toHaveText('dropped.csv · 2 rows')
    await page.getByTestId('batch-file').setInputFiles({ name: 'huge.csv', mimeType: 'text/csv', buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 0x61) })
    await expect(page.getByTestId('batch-problem')).toHaveText('That file is too big for a batch: over 20 MB.')
  })

  test('a contact file makes contact cards, shown by their fields', async ({ page }) => {
    await openPage(page)
    await openBatch(page)
    const [example] = await Promise.all([page.waitForEvent('download'), page.getByTestId('batch-contacts-example').click()])
    expect(example.suggestedFilename()).toBe('batch-example-contacts.csv')
    await chooseCsv(page, (await bytesOf(example)).toString('utf8'), 'contacts.csv')
    await expect(page.getByTestId('batch-row')).toContainText('NameRukus CatCompanyb0r3d.org · Chief napperEmailrukus@example.comPhone+1 555 0100 · +1 555 0199')
    await dialog(page).getByRole('button', { name: 'SVG' }).click()
    const zip = await makeZip(page)
    expect([...zip.files.keys()]).toEqual(['rukus_card.svg', 'ann_lee.svg'])
    expect(zip.files.get('rukus_card.svg')!.toString('utf8')).toContain('Call Rukus')
    await expect(status(page)).toHaveText('Made 2 files in qr-codes.zip, each read back and scanned.')
  })

  test('Stop: no zip is made', async ({ page }) => {
    await openPage(page)
    await openBatch(page)
    await chooseCsv(page, 'url\n' + Array.from({ length: 400 }, (_, i) => `https://b0r3d.org/${i}`).join('\n'))
    await expect(page.getByTestId('batch-make')).toHaveText('Make 400 files', { timeout: 20_000 })
    let downloads = 0
    page.on('download', () => downloads++)
    await page.getByTestId('batch-make').click()
    await expect(status(page)).toContainText('Making')
    // the keys go to Stop as Make is turned off, and back to Make once it's stopped
    await expect(page.getByTestId('batch-stop')).toBeFocused()
    await page.getByTestId('batch-stop').click()
    await expect(status(page)).toHaveText('Stopped: no zip file was made.', { timeout: 20_000 })
    expect(downloads).toBe(0)
    await expect(page.getByTestId('batch-make')).toBeEnabled()
    await expect(page.getByTestId('batch-make')).toBeFocused()
  })

  test('a narrow phone: the window fits across, its kinds of file on two lines', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await openPage(page)
    await openBatch(page)
    await chooseCsv(page, 'url\nhttps://b0r3d.org\n')
    await expect(page.getByTestId('batch-heading')).toHaveText('The row can be made.')
    expect(await dialog(page).evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true)
  })

  test('names alike but for capitals are numbered; JPG and PDF are read back and scanned too', async ({ page }) => {
    await openPage(page)
    await openBatch(page)
    await chooseCsv(page, 'url,frameText,fileName\nhttps://b0r3d.org/a,,Home\nhttps://b0r3d.org/b,,home\n')
    // what the file makes is said, as the heading over the rows says it
    await expect(page.getByTestId('batch-said')).toHaveText('All 2 rows can be made.')
    for (const kind of ['JPG', 'PDF']) {
      await dialog(page).getByRole('button', { name: kind }).click()
      const zip = await makeZip(page)
      const extension = kind.toLowerCase()
      expect([...zip.files.keys()]).toEqual([`Home.${extension}`, `home (2).${extension}`])
      await expect(status(page)).toHaveText('Made 2 files in qr-codes.zip, each read back and scanned.')
    }
  })

  test('closing the window stops a batch being made; a CSV dropped while one is read back waits', async ({ page }) => {
    test.slow()
    await openPage(page)
    await openBatch(page)
    const many = 'url\n' + Array.from({ length: 300 }, (_, i) => `https://b0r3d.org/${i}`).join('\n')
    await chooseCsv(page, many)
    await expect(page.getByTestId('batch-make')).toHaveText('Make 300 files', { timeout: 20_000 })
    let downloads = 0
    page.on('download', () => downloads++)
    // closed while the files are made: stopped, and no zip
    await page.getByTestId('batch-make').click()
    await expect(status(page)).toContainText('Making')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(status(page)).toHaveText('Stopped: no zip file was made.', { timeout: 20_000 })
    expect(downloads).toBe(0)
    // made, and closed while the files are read back: a CSV dropped then is said no to, and the
    // batch goes on to the end
    await openBatch(page)
    await chooseCsv(page, many)
    await expect(page.getByTestId('batch-make')).toHaveText('Make 300 files', { timeout: 20_000 })
    await page.getByTestId('batch-make').click()
    await expect(status(page)).toHaveText('Reading the files back…', { timeout: 60_000 })
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['url\nhttps://b0r3d.org\n'], 'later.csv', { type: 'text/csv' }))
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 1, clientY: 1 }))
    })
    await expect(dialog(page)).toBeVisible()
    await expect(status(page)).toHaveText("The last batch isn't done yet: drop later.csv again once it is.")
    await expect(status(page)).toHaveText(/^Made 300 files in qr-codes\.zip/, { timeout: 60_000 })
    expect(downloads).toBe(1)
  })
})
