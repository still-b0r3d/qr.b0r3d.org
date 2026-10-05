import { test, expect } from '@playwright/test'

// Browsers can refuse site storage (privacy settings, some embedded views),
// and storage can fill up. The app must work either way, just without
// remembering settings.
test.describe('Browser storage', () => {
  test('the app works when the browser blocks storage', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Access is denied for this document.', 'SecurityError')
        }
      })
    })
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await page.locator('#data').fill('https://b0r3d.org/no-storage')
    await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 10000 })
    expect(errors).toEqual([])
  })

  test('the app keeps working when storage is full', async ({ page }) => {
    await page.addInitScript(() => {
      window.Storage.prototype.setItem = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await page.locator('#data').fill('https://b0r3d.org/full-storage')
    await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 10000 })
    expect(errors).toEqual([])
  })
})
