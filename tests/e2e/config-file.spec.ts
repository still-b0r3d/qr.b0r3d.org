import { test, expect } from '@playwright/test'
import fs from 'fs'

// Load QR Code configuration with a file it can't open.
test.describe('Loading a config file', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  async function load(page: import('@playwright/test').Page, file: string) {
    const chooser = page.waitForEvent('filechooser')
    await page.locator('#load-qr-code-config-button').click()
    await (await chooser).setFiles(file)
  }

  test('says when a file is from a newer version, then clears on a good one', async ({
    page
  }, testInfo) => {
    const saved = testInfo.outputPath('config.json')
    const pending = page.waitForEvent('download')
    await page.locator('#save-qr-code-config-button').click()
    await (await pending).saveAs(saved)
    const config = JSON.parse(fs.readFileSync(saved, 'utf8'))
    expect(config.schemaVersion).toBe(1)

    const newer = testInfo.outputPath('newer.json')
    fs.writeFileSync(newer, JSON.stringify({ ...config, schemaVersion: 2 }))
    await load(page, newer)
    await expect(page.locator('#config-load-error')).toContainText('newer version of b0r3d QR')

    await load(page, saved)
    await expect(page.locator('#config-load-error')).toHaveCount(0)
  })

  test('says when a file is not a config at all', async ({ page }, testInfo) => {
    const other = testInfo.outputPath('other.json')
    fs.writeFileSync(other, '{"hello": "world"}')
    await load(page, other)
    await expect(page.locator('#config-load-error')).toContainText('isn’t a b0r3d QR configuration')
  })
})
