import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import JSZip from 'jszip'

async function loadBatch(page: Page, file: string) {
  await page.getByRole('button', { name: 'Batch export' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /choose a csv file/i }).click()
  await (await chooser).setFiles(file)
}

async function downloadZip(page: Page) {
  const pending = page.waitForEvent('download')
  await page.locator('#barcode-download-png').click()
  const zip = await JSZip.loadAsync(fs.readFileSync(await (await pending).path()))
  return Object.keys(zip.files).sort()
}

test.describe('Barcode batch export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#code-type').selectOption('ean13')
  })

  test('reads a plain list, lists the rows it leaves out and says what it made', async ({
    page
  }, testInfo) => {
    const file = testInfo.outputPath('list.csv')
    fs.writeFileSync(file, '950600013435\n12345\n4006381333931\n')
    await loadBatch(page, file)
    await expect(page.getByText('1 / 3')).toBeVisible()
    const problems = page.locator('#barcode-batch-problems')
    await expect(problems).toContainText("1 of 3 rows can't be made as EAN-13")
    await expect(problems).toContainText('Row 2 (12345)')

    expect(await downloadZip(page)).toEqual(['4006381333931.png', '950600013435.png'])
    await expect(page.locator('#barcode-batch-result')).toContainText('Made 2 of 3 codes')
  })

  test('names files from a fileName column in any position', async ({ page }, testInfo) => {
    const file = testInfo.outputPath('named.csv')
    fs.writeFileSync(file, 'fileName,code\nshelf-a,950600013435\nshelf-b,4006381333931\n')
    await loadBatch(page, file)
    await expect(page.locator('#barcode-batch-problems')).toHaveCount(0)
    expect(await downloadZip(page)).toEqual(['shelf-a.png', 'shelf-b.png'])
    await expect(page.locator('#barcode-batch-result')).toContainText('Made all 2 codes')
  })

  test('gives the typed code back when leaving the batch', async ({ page }, testInfo) => {
    await page.locator('#barcode-data').fill('4006381333931')
    const file = testInfo.outputPath('one.csv')
    fs.writeFileSync(file, 'data\n950600013435\n')
    await loadBatch(page, file)
    await page.getByRole('button', { name: 'Single export' }).click()
    await expect(page.locator('#barcode-data')).toHaveValue('4006381333931')
  })
})
