import { expect, test, type Page } from '@playwright/test'
import { openPage, typeData } from './helpers'

interface Kept {
  codes: Record<string, unknown>[]
  details: { key: number; value: Record<string, unknown> }[]
  meta: Record<string, unknown>
}

/** What the browser keeps for Recent codes: the "b0r3d-qr" database's three stores. */
async function kept(page: Page): Promise<Kept> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('b0r3d-qr')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    const all = <T>(store: string, keys = false) =>
      new Promise<T[]>((resolve) => {
        const s = db.transaction(store, 'readonly').objectStore(store)
        const r = keys ? s.getAllKeys() : s.getAll()
        r.onsuccess = () => resolve(r.result as T[])
      })
    const result = {
      codes: await all<Record<string, unknown>>('codes'),
      details: [] as { key: number; value: Record<string, unknown> }[],
      meta: {} as Record<string, unknown>
    }
    const detailKeys = await all<number>('details', true)
    const detailValues = await all<Record<string, unknown>>('details')
    result.details = detailKeys.map((key, i) => ({ key, value: detailValues[i] }))
    const metaKeys = await all<string>('meta', true)
    const metaValues = await all<unknown>('meta')
    metaKeys.forEach((k, i) => (result.meta[k] = metaValues[i]))
    db.close()
    return result
  })
}

async function savePng(page: Page): Promise<void> {
  await Promise.all([page.waitForEvent('download'), page.getByTestId('save-png').click()])
}

const window_ = (page: Page) => page.getByTestId('recent-dialog')

async function openWindow(page: Page): Promise<void> {
  await page.getByTestId('recent-codes').click()
  await expect(window_(page)).toBeVisible()
}

/** Waits until the browser keeps `n` codes. */
async function codesKept(page: Page, n: number): Promise<Kept> {
  let k: Kept = { codes: [], details: [], meta: {} }
  await expect.poll(async () => (k = await kept(page)).codes.length, { timeout: 10_000 }).toBe(n)
  return k
}

const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

interface OldConfig {
  props: Record<string, unknown>
  [key: string]: unknown
}

/** A design as today's site keeps one with a code (its text in it, no "image" when there's no logo). */
const oldConfig = (data: string, change: (c: OldConfig) => void = () => {}): OldConfig => {
  const c: OldConfig = {
    schemaVersion: 1,
    props: {
      data,
      width: 200,
      height: 200,
      margin: 4,
      dotsOptions: { color: '#000000', type: 'square' },
      cornersSquareOptions: { color: '#000000', type: 'square' },
      cornersDotOptions: { color: '#000000', type: 'square' },
      imageOptions: { padding: 1 },
      qrOptions: { errorCorrectionLevel: 'Q', typeNumber: 0 }
    },
    style: { borderRadius: '0px', background: '#ffffff' },
    frame: null
  }
  change(c)
  return c
}

test.describe('Recent codes', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop layout')

  test('a code saved is kept, with a note the first time, and the same text again replaces it', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'https://b0r3d.org/recent-check')
    await savePng(page)
    const note = page.getByTestId('recent-note')
    await expect(note).toBeVisible()
    await expect(note).toContainText('Added to Recent codes, so you can open it again later. It is kept only in this browser and never sent anywhere.')
    let k = await codesKept(page, 1)
    const code = k.codes[0]
    expect(code).toMatchObject({ v: 1, kind: 'qr', key: 'qr:qr:https://b0r3d.org/recent-check', label: 'URL', title: 'https://b0r3d.org/recent-check', sensitive: false, omitted: [], id: 1 })
    expect(String(code.thumbnail)).toMatch(/^data:image\/png;base64,/)
    expect(code.size).toBe(String(code.thumbnail).length + JSON.stringify(k.details[0].value.config).length)
    expect(Math.abs(Number(code.savedAt) - Date.now())).toBeLessThan(60_000)
    expect(k.details).toEqual([{ key: 1, value: { kind: 'qr', config: expect.objectContaining({ schemaVersion: 1, props: expect.objectContaining({ data: 'https://b0r3d.org/recent-check' }) }) } }])
    expect(k.meta).toEqual({ noticeShown: true })
    // screen readers hear it from a live region that's always there; OK hands the keys to Recent codes…
    await expect(page.getByTestId('recent-note-said')).toHaveText(
      'Added to Recent codes, so you can open it again later. It is kept only in this browser and never sent anywhere.'
    )
    await note.getByRole('button', { name: 'OK' }).focus()
    await page.keyboard.press('Enter')
    await expect(note).toBeHidden()
    await expect(page.getByTestId('recent-codes')).toBeFocused()

    // the same text again replaces it (with a new id); a second code gets no note
    await savePng(page)
    await expect.poll(async () => (await kept(page)).codes.map((c) => c.id)).toEqual([2])
    await typeData(page, 'Rukus was here.')
    await page.getByTestId('save-design').click()
    k = await codesKept(page, 2)
    expect(k.codes.map((c) => [c.label, c.title])).toEqual([
      ['URL', 'https://b0r3d.org/recent-check'],
      ['Text', 'Rukus was here.']
    ])
    await expect(note).toBeHidden()
    // the text export isn't a code to keep
    await typeData(page, 'just text out')
    await page.getByTestId('save-txt').click()
    await page.getByTestId('text-dialog').getByRole('button', { name: 'Close' }).click()
    await page.waitForTimeout(300)
    expect((await kept(page)).codes).toHaveLength(2)
  })

  test('the window lists codes newest first, opens them, deletes one and clears them all', async ({ page }) => {
    await openPage(page)
    for (const text of ['first code', 'https://b0r3d.org/second', 'WIFI:T:WPA;S:b0r3d guest;P:naps-all-day;;']) {
      await typeData(page, text)
      await page.getByTestId('save-design').click()
      await page.waitForTimeout(50)
    }
    await codesKept(page, 3)
    await typeData(page, 'something else')
    await openWindow(page)
    const w = window_(page)
    const rows = w.locator('.recent-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.locator('strong')).toHaveText(['WiFi: b0r3d guest', 'URL: https://b0r3d.org/second', 'Text: first code'])
    // a Wi-Fi network with its password: a padlock, no picture
    await expect(rows.nth(0)).toContainText('picture and password hidden')
    await expect(rows.nth(0).locator('.icon-lock')).toHaveCount(1)
    await expect(rows.nth(0).locator('img')).toHaveCount(0)
    await expect(rows.nth(1).locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
    // the short date and time, as the PC app writes them
    await expect(rows.nth(1).locator('.hint').first()).toHaveText(/^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}\s[AP]M$/)
    await expect(w.locator('.recent-count')).toHaveText(/^3 of 20 codes, about \d+ KB$/)

    await w.getByRole('button', { name: 'Open URL: https://b0r3d.org/second' }).click()
    await expect(w).toBeHidden()
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org/second')
    await expect(page.getByTestId('status')).toHaveText('Opened from Recent codes')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })

    await openWindow(page)
    await w.getByRole('button', { name: 'Delete Text: first code' }).click()
    await expect(rows).toHaveCount(2)
    await expect(w.locator('.recent-status')).toHaveText('Deleted Text: first code.')
    // Clear all asks first, and a double-click can't delete them
    const clear = page.getByTestId('recent-clear')
    await clear.dblclick()
    await expect(clear).toHaveText('Delete all 2 codes')
    await expect(rows).toHaveCount(2)
    await w.getByRole('button', { name: 'Cancel' }).click()
    await expect(clear).toHaveText('Clear all')
    await clear.click()
    await page.waitForTimeout(600)
    await clear.click()
    await expect(rows).toHaveCount(0)
    await expect(w.locator('.recent-empty')).toHaveText('Codes you save or copy will appear here.')
    await expect(w.locator('.recent-status')).toHaveText('All recent codes deleted.')
    await expect(clear).toBeHidden()
    expect((await kept(page)).details).toEqual([])
    // ids go on after a clear
    await w.getByRole('button', { name: 'Close' }).click()
    await page.getByTestId('save-design').click()
    await expect.poll(async () => (await kept(page)).codes.map((c) => c.id)).toEqual([4])
  })

  test('“Don’t keep codes” stops them, takes back the one it was about, and the switch turns them on again', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'keep me not')
    await savePng(page)
    await page.getByTestId('recent-note').getByRole('button', { name: "Don't keep codes" }).click()
    await expect(page.getByTestId('recent-note')).toBeHidden()
    await expect.poll(async () => (await kept(page)).meta).toEqual({ noticeShown: true, remember: false })
    expect((await kept(page)).codes).toHaveLength(0)
    await savePng(page)
    await page.waitForTimeout(300)
    expect((await kept(page)).codes).toHaveLength(0)

    await openWindow(page)
    const w = window_(page)
    await expect(w.locator('.recent-empty')).toHaveText('No codes are being added. Turn it on below to keep the codes you make.')
    await expect(w.getByLabel('Add codes I save or copy')).not.toBeChecked()
    await w.getByLabel('Add codes I save or copy').check()
    await expect(w.locator('.recent-status')).toHaveText('New codes will be added here.')
    await expect.poll(async () => (await kept(page)).meta.remember).toBe(true)
    await w.getByRole('button', { name: 'Close' }).click()
    await savePng(page)
    await codesKept(page, 1)
  })

  test('“Don’t keep codes” takes back its code after the same code is saved again', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'https://b0r3d.org/again')
    await savePng(page)
    await expect(page.getByTestId('recent-note')).toBeVisible()
    await Promise.all([page.waitForEvent('download'), page.getByTestId('save-svg').click()])
    await expect.poll(async () => (await kept(page)).codes.map((c) => c.id)).toEqual([2])
    await page.getByTestId('recent-note').getByRole('button', { name: "Don't keep codes" }).click()
    await expect.poll(async () => (await kept(page)).codes).toHaveLength(0)
    await expect(page.getByTestId('recent-note')).toBeHidden()
  })

  test('a held Enter key can’t clear them all', async ({ page }) => {
    await openPage(page)
    for (const text of ['one', 'two']) {
      await typeData(page, text)
      await page.getByTestId('save-design').click()
    }
    await codesKept(page, 2)
    await openWindow(page)
    const clear = page.getByTestId('recent-clear')
    await clear.focus()
    await page.keyboard.down('Enter')
    await expect(clear).toHaveText('Delete all 2 codes')
    await page.waitForTimeout(700)
    await page.keyboard.down('Enter') // still held: the key repeats
    await page.keyboard.up('Enter')
    await page.waitForTimeout(200)
    await expect(window_(page).locator('.recent-row')).toHaveCount(2)
    await page.keyboard.press('Enter') // a fresh press
    await expect(window_(page).locator('.recent-row')).toHaveCount(0)
  })

  test('codes that can’t be opened aren’t listed, and a newer site’s codes are left alone', async ({ page }) => {
    await openPage(page)
    await page.evaluate(
      async ({ dot, config }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open('b0r3d-qr', 1)
          r.onupgradeneeded = () => {
            r.result.createObjectStore('codes', { keyPath: 'id', autoIncrement: true })
            r.result.createObjectStore('details')
            r.result.createObjectStore('meta')
          }
          r.onsuccess = () => resolve(r.result)
          r.onerror = () => reject(r.error)
        })
        const tx = db.transaction(['codes', 'details', 'meta'], 'readwrite')
        const codes = tx.objectStore('codes')
        const details = tx.objectStore('details')
        const base = { kind: 'qr', label: 'Text', sensitive: false, omitted: [] as string[], thumbnail: dot, size: 500 }
        codes.add({ ...base, v: 1, key: 'qr:qr:whole', title: 'whole', savedAt: 1794117000000 })
        details.put({ kind: 'qr', config }, 1)
        codes.add({ ...base, v: 1, key: 'qr:qr:no details', title: 'no details', savedAt: 1794117100000 })
        codes.add({ ...base, v: 2, key: 'qr:qr:later', title: 'later', savedAt: 1794117200000 })
        details.put({ kind: 'qr', config }, 3)
        tx.objectStore('meta').put(true, 'noticeShown')
        await new Promise((resolve) => (tx.oncomplete = resolve))
        db.close()
      },
      { dot: DOT, config: oldConfig('whole') }
    )
    await openWindow(page)
    const w = window_(page)
    await expect(w.locator('.recent-row strong')).toHaveText(['Text: whole'])
    await w.getByRole('button', { name: 'Close' }).click()
    await typeData(page, 'new one')
    await page.getByTestId('save-design').click()
    await expect.poll(async () => (await kept(page)).codes.map((c) => c.title)).toEqual(['whole', 'later', 'new one'])
    await openWindow(page)
    const clear = page.getByTestId('recent-clear')
    await clear.click()
    await page.waitForTimeout(600)
    await clear.click()
    await expect(w.locator('.recent-row')).toHaveCount(0)
    const k = await kept(page)
    expect(k.codes.map((c) => c.title)).toEqual(['later'])
    expect(k.details.map((d) => d.key)).toEqual([3])
  })

  test('codes kept by a newer site: a save says so, and the window says why', async ({ page }) => {
    await page.addInitScript(() => {
      const r = indexedDB.open('b0r3d-qr', 2)
      r.onupgradeneeded = () => {
        r.result.createObjectStore('codes', { keyPath: 'id', autoIncrement: true })
        r.result.createObjectStore('details')
        r.result.createObjectStore('meta')
      }
      r.onsuccess = () => r.result.close()
    })
    await openPage(page)
    await savePng(page)
    await expect(page.getByTestId('status')).toHaveText('Saved qr-code.png. Not added to Recent codes: the ones in this browser were kept by a newer b0r3d QR.')
    await openWindow(page)
    await expect(window_(page).getByRole('alert')).toHaveText('Recent codes here were kept by a newer b0r3d QR, so this page leaves them as they are.')
  })

  test('the newest 20 are kept', async ({ page }) => {
    await openPage(page)
    for (let i = 1; i <= 21; i++) {
      await typeData(page, `code ${i}`)
      await page.getByTestId('save-design').click()
      await expect.poll(async () => (await kept(page)).codes.some((c) => c.title === `code ${i}`)).toBe(true)
    }
    const k = await codesKept(page, 20)
    expect(k.codes.map((c) => c.title)).not.toContain('code 1')
    expect(k.details.map((d) => d.key).sort((a, b) => a - b)).toEqual(k.codes.map((c) => c.id).sort((a, b) => Number(a) - Number(b)))
  })

  test('codes kept by today’s site are listed and open', async ({ page }) => {
    await openPage(page)
    // the shapes today's site writes (seen by running it), a barcode, and one that isn't whole
    await page.evaluate(
      async ({ dot, svg, url, wifi }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open('b0r3d-qr', 1)
          r.onupgradeneeded = () => {
            r.result.createObjectStore('codes', { keyPath: 'id', autoIncrement: true })
            r.result.createObjectStore('details')
            r.result.createObjectStore('meta')
          }
          r.onsuccess = () => resolve(r.result)
          r.onerror = () => reject(r.error)
        })
        const tx = db.transaction(['codes', 'details', 'meta'], 'readwrite')
        const codes = tx.objectStore('codes')
        const details = tx.objectStore('details')
        const base = { v: 1, kind: 'qr', sensitive: false, omitted: [] as string[] }
        codes.add({ ...base, key: 'qr:qr:https://b0r3d.org/old', label: 'URL', title: 'https://b0r3d.org/old', thumbnail: dot, savedAt: 1794116816196, size: 9279 })
        details.put({ kind: 'qr', config: url }, 1)
        codes.add({ ...base, key: 'qr:qr:' + wifi.props.data, label: 'WiFi', title: 'b0r3d guest', sensitive: true, savedAt: 1794117036040, size: 456 })
        details.put({ kind: 'qr', config: wifi }, 2)
        codes.add({ ...base, kind: 'barcode', key: 'barcode:ean13:9506000134352', label: 'EAN-13', title: '9506000134352', thumbnail: svg, savedAt: 1794117000000, size: 900 })
        const settings = { color: '#000000', background: '#ffffff', transparent: false, scale: 4, showText: true, allowRectangular: false, barHeight: 50, quietZones: true }
        details.put({ kind: 'barcode', type: 'ean13', data: '9506000134352', settings }, 3)
        codes.add({ v: 1, kind: 'qr', label: 'broken, no key', savedAt: 1794117100000 })
        tx.objectStore('meta').put(true, 'noticeShown')
        await new Promise((resolve) => (tx.oncomplete = resolve))
        db.close()
      },
      {
        dot: DOT,
        // a barcode's picture is an SVG, written into its data: URL
        svg: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 1"><rect width="1" height="1"/></svg>'),
        url: oldConfig('https://b0r3d.org/old', (c) => (c.props.dotsOptions = { color: '#cc0000', type: 'rounded' })),
        wifi: oldConfig('WIFI:T:WPA;S:b0r3d guest;P:naps-all-day;;')
      }
    )
    await openWindow(page)
    const w = window_(page)
    const rows = w.locator('.recent-row')
    await expect(rows.locator('strong')).toHaveText(['WiFi: b0r3d guest', 'EAN-13: 9506000134352', 'URL: https://b0r3d.org/old'])
    await expect(w.locator('.recent-count')).toHaveText('3 of 20 codes, about 10 KB')
    await expect(rows.nth(1).locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml;charset=utf-8,/)
    // a barcode opens as its own type, with its text and settings
    await w.getByRole('button', { name: 'Open EAN-13: 9506000134352' }).click()
    await expect(w).toBeHidden()
    await expect(page.getByTestId('code-type')).toHaveValue('ean13')
    await expect(page.locator('#barcode-data')).toHaveValue('9506000134352')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    // and a QR code goes back to QR codes
    await openWindow(page)
    await w.getByRole('button', { name: 'Open URL: https://b0r3d.org/old' }).click()
    await expect(w).toBeHidden()
    await expect(page.getByTestId('code-type')).toHaveValue('')
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org/old')
    await expect(page.getByLabel('Dot shape', { exact: true })).toHaveValue('rounded')
    await expect(page.getByLabel('Dot colour', { exact: true })).toHaveValue('#cc0000')
    // a new code goes in beside them, and the one that isn't whole goes
    await page.getByTestId('save-design').click()
    await expect.poll(async () => (await kept(page)).codes.map((c) => c.key)).toEqual([
      'qr:qr:WIFI:T:WPA;S:b0r3d guest;P:naps-all-day;;',
      'barcode:ean13:9506000134352',
      'qr:qr:https://b0r3d.org/old'
    ])
    expect((await kept(page)).codes.map((c) => c.id)).toEqual([2, 3, 5])
  })

  test('a browser that keeps nothing: saving says nothing, and the window says why', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.IDBFactory.prototype, 'open', {
        value() {
          throw new DOMException('The user denied permission to access the database.', 'SecurityError')
        }
      })
    })
    await openPage(page)
    await savePng(page)
    await expect(page.getByTestId('status')).toHaveText(/^Saved qr-code\.png$/)
    await expect(page.getByTestId('recent-note')).toBeHidden()
    await openWindow(page)
    await expect(window_(page).getByRole('alert')).toHaveText(
      "Recent codes can't be kept here: this browser doesn't let the page store anything (a private window, or site data turned off)."
    )
    await expect(window_(page).getByLabel('Add codes I save or copy')).toBeDisabled()
  })
})

test.describe('Recent codes on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the phone layout')

  test('saving keeps the code, and the window opens from the Save panel', async ({ page }) => {
    await openPage(page)
    await page.locator('.export-toggle').click()
    await savePng(page)
    await expect(page.getByTestId('recent-note')).toBeVisible()
    await page.getByTestId('recent-note').getByRole('button', { name: 'View' }).click()
    await expect(window_(page)).toBeVisible()
    await expect(window_(page).locator('.recent-row')).toHaveCount(1)
    const box = await window_(page).boundingBox()
    const viewport = page.viewportSize()
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true)
  })
})
