import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'

// Recent codes: codes downloaded, copied or saved are kept in this browser
// (IndexedDB) and can be opened again. Each test gets a fresh browser
// context, so a fresh, empty list.

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function makeCode(page: Page, data: string) {
  await page.locator('#data').fill(data)
  await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 10000 })
}

async function exportPng(page: Page) {
  const download = page.waitForEvent('download')
  await page.locator('#download-qr-image-button-png').click()
  await download
}

async function dismissNotice(page: Page) {
  const notice = page.locator('#recent-codes-notice')
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'OK' }).click()
}

async function openList(page: Page, button = '#recent-codes-button') {
  await page.locator(button).click()
  await expect(page.locator('#recent-codes-dialog')).toBeVisible()
}

function entry(page: Page, text: string) {
  return page.locator('.recent-code', { hasText: text })
}

async function saveConfig(page: Page) {
  const download = page.waitForEvent('download')
  await page.locator('#save-qr-code-config-button').click()
  await download
}

async function uploadCsv(page: Page, file: string) {
  await page.getByRole('button', { name: /batch export/i }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.locator('button[aria-label*="Choose a CSV file"]').click()
  await (await chooser).setFiles(file)
  await expect(page.locator('text=/\\d+ \\/ \\d+/')).toBeVisible({ timeout: 10000 })
}

test.describe('Recent codes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('a downloaded code is listed and opens again', async ({ page }) => {
    const errors = collectErrors(page)
    await makeCode(page, 'https://example.com/menu')
    await exportPng(page)
    await dismissNotice(page)

    await makeCode(page, 'https://example.com/other')
    await openList(page)
    await expect(page.locator('.recent-code')).toHaveCount(1)
    await expect(entry(page, 'https://example.com/menu').locator('img')).toHaveAttribute(
      'src',
      /^data:image\/png/
    )
    await entry(page, 'https://example.com/menu').locator('.recent-code-open').click()
    await expect(page.locator('#recent-codes-dialog')).toBeHidden()
    await expect(page.locator('#data')).toHaveValue('https://example.com/menu')
    await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 10000 })
    expect(errors).toEqual([])
  })

  test('the same code made again keeps one entry; a Wi-Fi password is never shown', async ({
    page
  }) => {
    await makeCode(page, 'https://example.com/a')
    await exportPng(page)
    await dismissNotice(page)
    await makeCode(page, 'WIFI:T:WPA;S:Office;P:hunter2;;')
    await exportPng(page)
    await makeCode(page, 'https://example.com/a')
    await exportPng(page)

    await openList(page)
    const names = page.locator('.recent-code-name')
    await expect(names).toHaveText(['URL: https://example.com/a', 'WiFi: Office'])
    await expect(entry(page, 'Office').locator('img')).toHaveCount(0)
    await expect(page.locator('#recent-codes-dialog')).not.toContainText('hunter2')
  })

  test('framed codes opened one after another each keep their frame', async ({ page }) => {
    await page.getByRole('button', { name: /frame settings/i }).click()
    await page.locator('#show-frame').check()
    await page.locator('#frame-text').fill('First caption')
    await makeCode(page, 'https://example.com/first')
    await exportPng(page)
    await dismissNotice(page)
    await page.locator('#frame-text').fill('Second caption')
    await makeCode(page, 'https://example.com/second')
    await exportPng(page)
    await page.locator('#show-frame').uncheck()

    for (const [data, caption] of [
      ['https://example.com/first', 'First caption'],
      ['https://example.com/second', 'Second caption']
    ]) {
      await openList(page)
      await entry(page, data).locator('.recent-code-open').click()
      await expect(page.locator('#data')).toHaveValue(data)
      await expect(page.locator('#show-frame')).toBeChecked()
      await expect(page.locator('#frame-text')).toHaveValue(caption)
    }
  })

  test('a barcode opens again with its type, data and colour', async ({ page }) => {
    await page.locator('#code-type').selectOption('ean13')
    await page.locator('#barcode-data').fill('950600013435')
    await page.locator('#barcode-color').fill('#aa0000')
    await expect(page.locator('#barcode-scan-check')).toContainText('Scans.', { timeout: 15000 })
    const download = page.waitForEvent('download')
    await page.locator('#barcode-download-png').click()
    await download
    await dismissNotice(page)

    // Back to QR with the default colour, then open the barcode from there.
    await page.locator('#barcode-color').fill('#000000')
    await page.locator('#code-type').selectOption('qr')
    await openList(page)
    await entry(page, '950600013435').locator('.recent-code-open').click()
    await expect(page.locator('#code-type')).toHaveValue('ean13')
    await expect(page.locator('#barcode-data')).toHaveValue('950600013435')
    await expect(page.locator('#barcode-color')).toHaveValue('#aa0000')
  })

  test('turned off, new codes are not added and the list stays', async ({ page }) => {
    await makeCode(page, 'https://example.com/kept')
    await exportPng(page)
    await dismissNotice(page)
    await openList(page)
    await page.locator('#recent-codes-remember').uncheck()
    await expect(page.locator('#recent-codes-dialog')).toContainText('won’t be added')
    await page.keyboard.press('Escape')

    await makeCode(page, 'https://example.com/not-kept')
    await exportPng(page)
    await openList(page)
    await expect(page.locator('.recent-code-name')).toHaveText(['URL: https://example.com/kept'])
    await expect(page.locator('#recent-codes-remember')).not.toBeChecked()
  })

  test("the notice's Don't keep codes also deletes the code it announced", async ({ page }) => {
    await makeCode(page, 'WIFI:T:WPA;S:Office;P:hunter2;;')
    await exportPng(page)
    await page
      .locator('#recent-codes-notice')
      .getByRole('button', { name: "Don't keep codes" })
      .click()
    await expect(page.locator('#recent-codes-notice')).toHaveCount(0)

    await makeCode(page, 'https://example.com/after')
    await exportPng(page)
    await openList(page)
    await expect(page.locator('.recent-code')).toHaveCount(0)
    await expect(page.locator('#recent-codes-dialog')).toContainText('No codes are being added')
    await expect(page.locator('#recent-codes-remember')).not.toBeChecked()
  })

  test('Save configuration adds the code, but not the sample text or a batch row', async ({
    page
  }, testInfo) => {
    await makeCode(page, 'https://example.com/saved')
    await saveConfig(page)
    await dismissNotice(page)

    await page.locator('#data').fill('')
    await saveConfig(page)

    const csv = testInfo.outputPath('rows.csv')
    fs.writeFileSync(csv, 'url\nhttps://example.com/alice-private\nhttps://example.com/bob\n')
    await uploadCsv(page, csv)
    await saveConfig(page)

    await openList(page)
    await expect(page.locator('.recent-code-name')).toHaveText(['URL: https://example.com/saved'])
  })

  test('a code opened while in batch mode goes back to a single code', async ({ page }) => {
    await makeCode(page, 'https://example.com/single')
    await exportPng(page)
    await dismissNotice(page)
    await page.getByRole('button', { name: /batch export/i }).click()

    await openList(page)
    await entry(page, 'https://example.com/single').locator('.recent-code-open').click()
    await expect(page.locator('#data')).toHaveValue('https://example.com/single')
    await expect(page.locator('#download-qr-image-button-png')).toBeEnabled()
  })

  test('a double-click on Clear all deletes nothing', async ({ page }) => {
    await makeCode(page, 'https://example.com/kept')
    await exportPng(page)
    await dismissNotice(page)
    await openList(page)
    await page.locator('#recent-codes-clear').dblclick()
    await expect(page.locator('.recent-code')).toHaveCount(1)
    await expect(page.locator('#recent-codes-clear')).toHaveText('Delete all 1 codes')
  })

  test('deleting a code keeps keyboard focus in the list', async ({ page }) => {
    for (const data of ['https://example.com/1', 'https://example.com/2']) {
      await makeCode(page, data)
      await exportPng(page)
    }
    await dismissNotice(page)
    await openList(page)
    await entry(page, 'https://example.com/2').locator('.recent-code-delete').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.recent-code')).toHaveCount(1)
    await expect(entry(page, 'https://example.com/1').locator('.recent-code-delete')).toBeFocused()
  })

  test('Clear all asks once more, then empties the list', async ({ page }) => {
    await makeCode(page, 'https://example.com/gone')
    await exportPng(page)
    await dismissNotice(page)
    await openList(page)
    await page.locator('#recent-codes-clear').click()
    await expect(page.locator('.recent-code')).toHaveCount(1)
    await page.waitForTimeout(600) // a second click right away is ignored
    await page.locator('#recent-codes-clear').click()
    await expect(page.locator('.recent-code')).toHaveCount(0)
    await expect(page.locator('#recent-codes-dialog')).toContainText('will appear here')
  })
})

// Loading a configuration replaces the design, frame included (fixed along
// with Recent codes, which opens codes the same way).
test('a loaded configuration does not keep the previous frame background', async ({
  page
}, testInfo) => {
  const frame = (backgroundImage?: string) => ({
    text: 'Scan me',
    position: 'bottom',
    style: {
      textColor: '#000000',
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      borderWidth: '1px',
      borderRadius: '8px',
      padding: '16px',
      ...(backgroundImage ? { backgroundImage } : {})
    }
  })
  const config = (backgroundImage?: string) => ({
    props: { data: 'https://example.com/framed', width: 200, height: 200, margin: 4 },
    style: { borderRadius: '0px', background: '#ffffff' },
    frame: frame(backgroundImage)
  })
  const pixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  await page.goto('/')
  for (const [name, backgroundImage] of [
    ['with-background.json', pixel],
    ['without-background.json', undefined]
  ] as const) {
    const file = testInfo.outputPath(name)
    fs.writeFileSync(file, JSON.stringify(config(backgroundImage)))
    const chooser = page.waitForEvent('filechooser')
    await page.locator('#load-qr-code-config-button').click()
    await (await chooser).setFiles(file)
    await expect(page.locator('#data')).toHaveValue('https://example.com/framed')
  }
  await page.getByRole('button', { name: /frame settings/i }).click()
  await expect(page.locator('#show-frame')).toBeChecked()
  await expect(page.locator('#frame-background-type-color')).toBeChecked()
})

test.describe('Recent codes when storage fails', () => {
  test('without IndexedDB the app still exports and hides Recent codes', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        get() {
          throw new DOMException('Access is denied for this document.', 'SecurityError')
        }
      })
    })
    const errors = collectErrors(page)
    await page.goto('/')
    await makeCode(page, 'https://example.com/no-idb')
    await exportPng(page)
    await expect(page.locator('#recent-codes-button')).toHaveCount(0)
    await expect(page.locator('#recent-codes-notice')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('a full disk is reported in the list, and exports keep working', async ({ page }) => {
    await page.addInitScript(() => {
      IDBObjectStore.prototype.add = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
    const errors = collectErrors(page)
    await page.goto('/')
    await makeCode(page, 'https://example.com/full')
    await exportPng(page)
    await openList(page)
    await expect(page.locator('#recent-codes-dialog')).toContainText(
      'Storage for this site is full'
    )
    expect(errors).toEqual([])
  })
})
