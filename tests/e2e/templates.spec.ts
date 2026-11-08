import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { MENU, templateExample, templateLabel } from '../../src/qr/template-forms'
import { makeText, type TemplateKind } from '../../src/qr/templates'
import { openPage, typeData } from './helpers'

const dialog = (page: Page) => page.getByTestId('template-dialog')

/** Chooses a template in the Data section's list, with the mouse. */
async function choose(page: Page, kind: TemplateKind): Promise<void> {
  await page.getByTestId('template-picker').click()
  await page.getByRole('option', { name: templateLabel(kind), exact: true }).click()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByTestId('template-type')).toHaveValue(kind)
}

const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save', exact: true }).click()

test.describe('data templates', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop layout')

  test('the list shows the text’s template, and the keys move through it without opening a form', async ({ page }) => {
    await openPage(page)
    const picker = page.getByTestId('template-picker')
    await expect(picker).toHaveText('URL')
    await typeData(page, '')
    await expect(picker).toHaveText('Select template...')
    await typeData(page, 'WIFI:T:WPA;S:home;P:x;;')
    await expect(picker).toHaveText('WiFi')

    await picker.focus()
    await page.keyboard.press('ArrowDown')
    await expect(picker).toHaveAttribute('aria-expanded', 'true')
    const list = page.getByRole('listbox', { name: 'Data templates' })
    await expect(list).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(dialog(page)).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(picker).toHaveAttribute('aria-expanded', 'false')
    await expect(picker).toBeFocused()
    await expect(dialog(page)).toBeHidden()

    // Enter chooses: WiFi, then one down is vCard
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()
    await expect(page.getByTestId('template-type')).toHaveValue('vcard')
  })

  test('every template’s example writes its code, and the code scans', async ({ page }) => {
    await openPage(page)
    for (const kind of MENU) {
      await choose(page, kind)
      await dialog(page).getByRole('button', { name: 'Use example' }).click()
      await save(page)
      await expect(dialog(page)).toBeHidden()
      const text = await page.locator('#data').inputValue()
      if (kind === 'event') {
        expect(text).toMatch(
          /^BEGIN:VCALENDAR\nVERSION:2\.0\nBEGIN:VEVENT\nSUMMARY:Nap time\nLOCATION:The sunny windowsill\nDTSTART:\d{8}T\d{6}Z\nDTEND:\d{8}T\d{6}Z\nDTSTAMP:\d{8}T\d{6}Z\nUID:[0-9a-z]{18}@qr\.b0r3d\.org\nEND:VEVENT\nEND:VCALENDAR$/
        )
      } else expect(text, kind).toBe(makeText(kind, templateExample(kind)))
      await expect(page.getByTestId('template-picker')).toHaveText(templateLabel(kind))
      await expect(page.getByTestId('check'), kind).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    }
  })

  test('Save asks for what’s missing, and the messages go as the fields are filled', async ({ page }) => {
    await openPage(page)
    await choose(page, 'wifi')
    const d = dialog(page)
    const passwordStar = d.locator('label.label', { hasText: /^Password/ }).locator('.star')
    await expect(passwordStar).toHaveCount(0)
    await expect(d.getByLabel('Password')).toBeDisabled()
    await d.getByLabel('Encryption').selectOption('WPA')
    await expect(d.getByLabel('Password')).toBeEnabled()
    await expect(passwordStar).toHaveCount(1)
    await save(page)
    await expect(d.locator('[data-problem=ssid]')).toHaveText("Type the network's name.")
    await expect(d.locator('[data-problem=password]')).toHaveText('Type the password, or choose No encryption.')
    await expect(d.getByLabel('Wireless SSID')).toBeFocused()
    await d.getByLabel('Wireless SSID').fill('b0r3d guest')
    await expect(d.locator('[data-problem=ssid]')).toBeHidden()
    // the password's message stays until the next Save
    await d.getByLabel('Password').fill('x')
    await expect(d.locator('[data-problem=password]')).toBeVisible()
    await d.getByLabel('Encryption').selectOption('SAE')
    await expect(d.getByText('Only for networks that accept nothing but WPA3.', { exact: false })).toBeVisible()
    await save(page)
    await expect(d).toBeHidden()
    await expect(page.locator('#data')).toHaveValue('WIFI:T:SAE;S:b0r3d guest;P:x;;')

    // a payment: the IBAN's check digits, an amount it can't carry, the BIC for version 1
    await choose(page, 'epc')
    await d.getByLabel('Beneficiary Name').fill('Rukus Cat')
    await d.getByLabel('IBAN').fill('DE89 3704 0044 0532 0130 01')
    await expect(d.locator('[data-problem=iban]')).toHaveText("This IBAN's check digits don't match. Check it for a typo.")
    await d.getByLabel('Amount (EUR)').fill('1.234,56')
    await d.getByLabel('EPC QR Version').selectOption('001')
    await save(page)
    await expect(d.locator('[data-problem=amount]')).toHaveText('Enter the amount like 25.00 or 25,00, from 0.01 to 999999999.99, or leave it empty.')
    await expect(d.locator('[data-problem=bic]')).toHaveText('Version 1 needs the BIC: type it, or choose version 2.')
    await d.getByLabel('EPC QR Version').selectOption('002')
    await expect(d.locator('[data-problem=bic]')).toBeHidden()
    await d.getByLabel('IBAN').fill('DE89 3704 0044 0532 0130 00')
    await d.getByLabel('Amount (EUR)').fill('12,5')
    await expect(d.locator('[data-problem=amount]')).toBeHidden()
    // the structured reference turns the payment reference off
    await d.getByLabel('Structured Creditor Reference').fill('RF76B0R3D')
    await expect(d.getByLabel('Payment Reference')).toBeDisabled()
    await save(page)
    await expect(page.locator('#data')).toHaveValue('BCD\n002\n1\nSCT\n\nRukus Cat\nDE89370400440532013000\nEUR12.50\n\nRF76B0R3D')
  })

  test('the form fills from the text when it’s that template, and keeps each form while the page is open', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'WIFI:T:WEP;S:Loaf\\;Lane;P:crumbs;H:true;;')
    await page.getByTestId('edit-template').click()
    const d = dialog(page)
    await expect(page.getByTestId('template-type')).toHaveValue('wifi')
    await expect(d.getByLabel('Encryption')).toHaveValue('WEP')
    await expect(d.getByLabel('Wireless SSID')).toHaveValue('Loaf;Lane')
    await expect(d.getByLabel('Password')).toHaveValue('crumbs')
    await expect(d.getByLabel('Hidden SSID')).toBeChecked()
    // another type keeps what was typed in it before
    await page.getByTestId('template-type').selectOption('sms')
    await d.getByLabel('Phone Number').fill('+1-202-555-0100')
    await page.getByTestId('template-type').selectOption('wifi')
    await page.getByTestId('template-type').selectOption('sms')
    await expect(d.getByLabel('Phone Number')).toHaveValue('+1-202-555-0100')
    // Cancel leaves the text as it was
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expect(d).toBeHidden()
    await expect(page.locator('#data')).toHaveValue('WIFI:T:WEP;S:Loaf\\;Lane;P:crumbs;H:true;;')
    // Escape too
    await page.getByTestId('edit-template').click()
    await page.keyboard.press('Escape')
    await expect(d).toBeHidden()
    await expect(page.locator('#data')).toHaveValue('WIFI:T:WEP;S:Loaf\\;Lane;P:crumbs;H:true;;')
    // with no text, Edit… opens the plain text form
    await typeData(page, '')
    await page.getByTestId('edit-template').click()
    await expect(page.getByTestId('template-type')).toHaveValue('text')
  })

  test('a contact card’s fields go two to a row, and its text reads back into them', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'BEGIN:VCARD\nVERSION:4.0\nN:Cat;Rukus;;;\nFN:Rukus Cat\nTEL;TYPE=cell,voice;VALUE=uri:tel:+1 202 555 0199\nEND:VCARD')
    await expect(page.getByTestId('template-picker')).toHaveText('vCard')
    await page.getByTestId('edit-template').click()
    const d = dialog(page)
    await expect(d.getByLabel('vCard Version')).toHaveValue('4')
    await expect(d.getByLabel('First Name')).toHaveValue('Rukus')
    await expect(d.getByLabel('Phone (Mobile)')).toHaveValue('+1 202 555 0199')
    const first = await d.getByLabel('First Name').boundingBox()
    const last = await d.getByLabel('Last Name').boundingBox()
    expect(first && last && Math.abs(first.y - last.y) < 2 && last.x > first.x).toBe(true)
  })

  test('a date the browser’s picker can’t show is typed instead, and kept', async ({ page }) => {
    await openPage(page)
    const d = dialog(page)
    // GS1 dates can have day 00
    await typeData(page, 'https://id.gs1.org/01/09506000134352?17=271200')
    await expect(page.getByTestId('template-picker')).toHaveText('Product (GS1 Digital Link)')
    await page.getByTestId('edit-template').click()
    // (a browser whose date box takes any text shows it there)
    await expect(d.getByLabel('Expiry date')).toHaveValue('2027-12-00')
    await save(page)
    await expect(page.locator('#data')).toHaveValue('https://id.gs1.org/01/09506000134352?17=271200')
    // an event that starts on 30 February
    await typeData(page, 'BEGIN:VEVENT\nSUMMARY:x\nDTSTART:20260230T100000\nDTEND:20260301T100000\nEND:VEVENT')
    await page.getByTestId('edit-template').click()
    const start = d.getByLabel('Start Time')
    await expect(start).toHaveValue(/^2026-02-30[ T]10:00$/)
    await expect(d.getByLabel('End Time')).toHaveValue(/^2026-03-01[ T]10:00$/)
    await start.fill((await start.getAttribute('type')) === 'text' ? '2026-02-28 9:30' : '2026-02-28T09:30')
    await save(page)
    await expect(page.locator('#data')).toHaveValue(/\nDTSTART:2026022[78]T\d{6}Z\n/)
  })

  test('a place’s numbers take any key (a phone’s number pad can lack the minus)', async ({ page }) => {
    await openPage(page)
    await choose(page, 'location')
    const latitude = dialog(page).getByLabel('Latitude')
    await expect(latitude).not.toHaveAttribute('inputmode')
    await latitude.fill('-33.8568')
    await dialog(page).getByLabel('Longitude').fill('151.2153')
    await save(page)
    await expect(page.locator('#data')).toHaveValue('geo:-33.8568,151.2153')
  })

  test('the checks stay as they are while their messages do, and a fix keeps an opened text’s CR LF', async ({ page }) => {
    await openPage(page)
    const checks = page.getByTestId('data-checks')
    await typeData(page, '  hi')
    const row = await checks.locator('.data-check').first().elementHandle()
    await page.locator('#data').pressSequentially('i')
    await expect(page.locator('#data')).toHaveValue('  hii')
    expect(await row!.evaluate((el) => el.isConnected)).toBe(true)
    await checks.getByRole('button', { name: 'Trim' }).click()
    await expect(page.locator('#data')).toHaveValue('hii')

    // a design whose text has CR LF line breaks and spaces at its end
    const file = { schemaVersion: 1, props: { data: 'line one\r\nline two  ' }, style: { borderRadius: '0px', background: '#ffffff' }, frame: null }
    await page.getByTestId('open-design-file').setInputFiles({ name: 'crlf.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
    await expect(page.locator('#data')).toHaveValue('line one\nline two  ')
    await checks.getByRole('button', { name: 'Trim' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-design').click()])
    const saved = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(saved.props.data).toBe('line one\r\nline two')
  })

  test('the checks on the typed text offer their fixes', async ({ page }) => {
    await openPage(page)
    const checks = page.getByTestId('data-checks')
    await typeData(page, '  b0r3d.org/page \n')
    await expect(checks).toContainText('Starts or ends with spaces or line breaks, which are stored in the code too.')
    await expect(checks).toContainText('This looks like a web address without https://.')
    await checks.getByRole('button', { name: 'Trim' }).click()
    await expect(page.locator('#data')).toHaveValue('b0r3d.org/page')
    await checks.getByRole('button', { name: 'Add https://' }).click()
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org/page')
    await expect(checks).toBeEmpty()
    await typeData(page, 'https://www.youtube.com/watch?v=x&si=abc&utm_source=qr')
    await expect(checks).toContainText('This link has tracking parameters: si, utm_source.')
    await checks.getByRole('button', { name: 'Remove them' }).click()
    await expect(page.locator('#data')).toHaveValue('https://www.youtube.com/watch?v=x')
    await expect(page.locator('#data')).toBeFocused()
  })
})

test.describe('data templates on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the phone layout')

  test('the form fits the screen and writes the code', async ({ page }) => {
    await openPage(page)
    await choose(page, 'vcard')
    const box = await dialog(page).boundingBox()
    const viewport = page.viewportSize()
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true)
    const first = await dialog(page).getByLabel('First Name').boundingBox()
    const last = await dialog(page).getByLabel('Last Name').boundingBox()
    expect(first && last && last.y > first.y).toBe(true)
    await dialog(page).getByRole('button', { name: 'Use example' }).click()
    await save(page)
    await expect(page.locator('#data')).toHaveValue(makeText('vcard', { ...templateExample('vcard'), version: '3' }))
  })
})
