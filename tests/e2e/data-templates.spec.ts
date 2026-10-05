import { test, expect, type Page } from '@playwright/test'

// Opening "Data templates" on existing data fills the form from it; saving
// again must give back exactly the same data.
async function openEditor(page: Page, data?: string) {
  if (data !== undefined) await page.locator('#data').fill(data)
  await page.getByRole('button', { name: 'Open data type generator' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
}

test.describe('Data templates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  const roundTrips = {
    'Wi-Fi with escaped characters': 'WIFI:T:WPA;S:Cafe\\;Net;P:a\\;b\\:c;;',
    'WPA3-only Wi-Fi': 'WIFI:T:SAE;S:Lab;P:secret;;',
    'SMS with colons': 'SMSTO:+15550100:Meet at 10:30',
    'vCard with commas':
      'BEGIN:VCARD\nVERSION:3.0\nN:Lee;Ann;;;\nFN:Ann Lee\nORG:Smith\\, Jones & Co\nEND:VCARD',
    'GS1 Digital Link': 'https://id.example.com/01/09506000134352/10/ABC123?17=271231'
  }
  for (const [name, data] of Object.entries(roundTrips)) {
    test(`${name}: opening and saving changes nothing`, async ({ page }) => {
      await openEditor(page, data)
      await save(page)
      await expect(page.locator('#data')).toHaveValue(data)
    })
  }

  test('Wi-Fi: the form shows the security type and full values', async ({ page }) => {
    await openEditor(page, 'WIFI:T:WPA;S:Cafe\\;Net;P:a\\;b\\:c;;')
    await expect(page.locator('#wifiEncryption')).toHaveValue('WPA')
    await expect(page.locator('#wifiSSID')).toHaveValue('Cafe;Net')
    await expect(page.locator('#wifiPassword')).toHaveValue('a;b:c')
  })

  test('events: times come back in the date fields', async ({ page }) => {
    await openEditor(page)
    await page.locator('#dataType').selectOption('event')
    await page.locator('#eventTitle').fill('Party')
    await page.locator('#eventStartTime').fill('2026-10-31T19:00')
    await page.locator('#eventEndTime').fill('2026-10-31T23:30')
    await save(page)
    await openEditor(page)
    await expect(page.locator('#eventStartTime')).toHaveValue('2026-10-31T19:00')
    await expect(page.locator('#eventEndTime')).toHaveValue('2026-10-31T23:30')
  })

  test('SEPA payments: an IBAN with a typo is caught before saving', async ({ page }) => {
    await openEditor(page)
    await page.locator('#dataType').selectOption('epc')
    await page.locator('#epcName').fill('Jane Smith')
    await page.locator('#epcIban').fill('DE89 3704 0044 0532 0130 01')
    await expect(page.locator('#epcIbanProblem')).toContainText("check digits don't match")
    await save(page)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('#epcIban').fill('DE89 3704 0044 0532 0130 00')
    await expect(page.locator('#epcIbanProblem')).toHaveCount(0)
    await save(page)
    await expect(page.locator('#data')).toHaveValue(
      /^BCD\n002\n1\nSCT\n\nJane Smith\nDE89370400440532013000/
    )
  })

  test('GS1 Digital Link: builds a product link that scans', async ({ page }) => {
    await openEditor(page)
    await page.locator('#dataType').selectOption('gs1dl')
    await page.locator('#gs1Gtin').fill('9506000134351')
    await expect(page.getByRole('alert')).toContainText('should be 2')
    await page.locator('#gs1Gtin').fill('9506000134352')
    await page.locator('#gs1Lot').fill('ABC123')
    await save(page)
    await expect(page.locator('#data')).toHaveValue(
      'https://id.gs1.org/01/09506000134352/10/ABC123'
    )
    await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 10000 })
  })
})
