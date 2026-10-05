import { test, expect } from '@playwright/test'

test.describe('Data checks and "What\'s in this code"', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('offers to add https:// to a bare web address', async ({ page }) => {
    await page.locator('#data').fill('b0r3d.org/page')
    await expect(page.locator('#data-checks')).toContainText('without https://')
    await page.locator('#data-checks button[data-check="bareDomain"]').click()
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org/page')
    await expect(page.locator('#data-checks')).toHaveCount(0)
  })

  test('removes tracking parameters and nothing else', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org/p?utm_source=flyer&id=7&fbclid=x#top')
    await expect(page.locator('#data-checks')).toContainText('utm_source, fbclid')
    await page.locator('#data-checks button[data-check="trackingParams"]').click()
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org/p?id=7#top')
  })

  test('trims stray whitespace', async ({ page }) => {
    await page.locator('#data').fill('  https://b0r3d.org\n')
    await page.locator('#data-checks button[data-check="outerWhitespace"]').click()
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org')
  })

  test('says nothing about a clean link', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    await expect(page.locator('#data-checks')).toHaveCount(0)
  })

  test('shows exactly what the code stores', async ({ page }) => {
    await page.locator('#data').fill('id=12345678901234567890')
    await page.locator('#code-info summary').click()
    const info = page.locator('#code-info')
    await expect(info.locator('pre')).toHaveText('id=12345678901234567890')
    await expect(info).toContainText('23 bytes, 23 characters')
    await expect(info).toContainText('Version 2, 25 × 25 modules')
    await expect(info).toContainText('text (3) + numbers (20)')
  })
})
