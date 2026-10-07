import { test, expect, type Page } from '@playwright/test'

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

  test('Clear all asks once more, then empties the list', async ({ page }) => {
    await makeCode(page, 'https://example.com/gone')
    await exportPng(page)
    await dismissNotice(page)
    await openList(page)
    await page.locator('#recent-codes-clear').click()
    await expect(page.locator('.recent-code')).toHaveCount(1)
    await page.locator('#recent-codes-clear').click()
    await expect(page.locator('.recent-code')).toHaveCount(0)
    await expect(page.locator('#recent-codes-dialog')).toContainText('will appear here')
  })
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
