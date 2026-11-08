import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { readQr } from '../../src/test/zxing'
import { bytesOf, openPage, readPng, typeData } from './helpers'

const CUP = new URL('../../src/assets/presets/b0r3d-cup.png', import.meta.url)

/**
 * The scan check's answer once it has settled: a picture still loading (a logo, a font) asks for
 * another check, so an answer counts once it has stayed the same for a moment.
 */
async function checked(page: Page): Promise<string> {
  const check = page.getByTestId('check')
  let last = ''
  let same = 0
  for (let i = 0; i < 200 && same < 3; i++) {
    const now = (await check.getAttribute('data-result')) ?? ''
    same = now === last && now !== 'checking' ? same + 1 : 0
    last = now
    await page.waitForTimeout(100)
  }
  return last
}

async function saved(page: Page, format: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`save-${format}`).click()])
  return { name: download.suggestedFilename(), bytes: await bytesOf(download) }
}

async function openSection(page: Page, title: string) {
  const sec = page.locator('details.sec', { has: page.locator('summary', { hasText: new RegExp(`^${title}$`) }) })
  if ((await sec.getAttribute('open')) === null) await sec.locator('summary').click()
}

/** The picture in one of b0r3d QR's PDFs, read by a scanner. */
async function readPdf(bytes: Buffer): Promise<string | null> {
  const text = bytes.toString('latin1')
  const image = /\/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB [^>]*\/Length (\d+) >>\nstream\n/.exec(text)
  if (!image) return null
  const [w, h, length] = [Number(image[1]), Number(image[2]), Number(image[3])]
  const start = image.index + image[0].length
  const rgb = inflateSync(bytes.subarray(start, start + length))
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4)
  const [found] = await readQr({ width: w, height: h, data: rgba })
  return found?.text ?? null
}

test.describe('the designer', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop layout')

  test('every preset scans, and the cup and Rukus carry their logos', async ({ page }) => {
    await openPage(page)
    for (const name of ['Rounded', 'Dots', 'b0r3d Cup', 'Rukus', 'Plain']) {
      await page.locator('#preset').selectOption(name)
      expect(await checked(page), name).toBe('ok')
      if (name === 'b0r3d Cup' || name === 'Rukus') {
        await expect(page.getByTestId('info')).toContainText('level H')
        const svg = (await saved(page, 'svg')).bytes.toString('utf8')
        expect(svg).toContain('class="qr-logo"')
        expect(svg).toContain('href="data:image/png;base64,')
        const png = await readPng((await saved(page, 'png')).bytes)
        expect(png.text, name).toBe('https://b0r3d.org')
      }
    }
  })

  test('every dot, corner square and corner dot shape scans', async ({ page }) => {
    await openPage(page)
    for (const dots of ['dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded', 'square']) {
      await page.getByLabel('Dot shape', { exact: true }).selectOption(dots)
      expect(await checked(page), dots).toBe('ok')
    }
    for (const squares of ['dot', 'rounded', 'extra-rounded', 'square']) {
      await page.getByLabel('Corner square shape', { exact: true }).selectOption(squares)
      expect(await checked(page), squares).toBe('ok')
    }
    for (const centres of ['dot', 'rounded', 'square']) {
      await page.getByLabel('Corner dot shape', { exact: true }).selectOption(centres)
      expect(await checked(page), centres).toBe('ok')
    }
    await expect(page.locator('#preset')).toHaveValue('Plain')
    await page.getByLabel('Dot shape', { exact: true }).selectOption('dots')
    await expect(page.locator('#preset')).toHaveValue('')
  })

  test('colours warn by the same rule as the PC app', async ({ page }) => {
    await openPage(page)
    await page.getByLabel('Dot colour', { exact: true }).fill('#ff0000')
    await expect(page.getByTestId('warnings')).toHaveText('⚠ Low contrast (3.9:1) between the code and its background. Dark on light with at least 4:1 scans best.')
    await page.getByLabel('Dot colour', { exact: true }).fill('#000000')
    await expect(page.getByTestId('warnings')).toBeHidden()
    await page.locator('#with-background').uncheck()
    await expect(page.getByTestId('warnings')).toHaveText('⚠ Transparent background: put the code on a plain, light surface.')
    await page.locator('#with-background').check()
    // (the Style section's: the barcode settings have one of their own)
    await page.locator('details.sec').filter({ has: page.locator('.sec-title', { hasText: /^Style$/ }) }).getByLabel('Background colour', { exact: true }).fill('#000000')
    await page.getByLabel('Dot colour', { exact: true }).fill('#ffffff')
    await page.getByLabel('Corner square colour', { exact: true }).fill('#ffffff')
    await page.getByLabel('Corner dot colour', { exact: true }).fill('#ffffff')
    await expect(page.getByTestId('warnings')).toContainText("Light code on a dark background: many phone cameras can't read inverted codes.")
    expect(await checked(page)).toBe('unreadable')
  })

  test('a logo from a file: room cleared, drawn, and still scans', async ({ page }) => {
    await openPage(page)
    await openSection(page, 'Logo')
    await page.locator('details.sec', { hasText: 'Logo' }).locator('input[type=file]').setInputFiles(fileURLToPath(CUP))
    await expect(page.getByTestId('logo-note')).toHaveText('Logo set. Drop or paste another to change it.')
    await expect(page.getByTestId('logo-hint')).toContainText('cleared modules')
    expect(await checked(page)).toBe('ok')
    await page.getByRole('button', { name: 'Level L, low' }).click()
    await expect(page.getByTestId('level-hint')).toContainText('A logo covers part of the code, so High (25%) is used.')
    await expect(page.getByTestId('info')).toContainText('(raised for the logo)')
    const png = await readPng((await saved(page, 'png')).bytes)
    expect(png.text).toBe('https://b0r3d.org')
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByTestId('logo-hint')).toHaveText('')
  })

  test('an SVG logo is drawn, checked and saved like any picture', async ({ page }) => {
    await openPage(page)
    await openSection(page, 'Logo')
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#c000c0"/></svg>'
    await page.locator('details.sec', { hasText: 'Logo' }).locator('input[type=file]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
    await expect(page.getByTestId('logo-note')).toHaveText('Logo set. Drop or paste another to change it.')
    expect(await checked(page)).toBe('ok')
    const png = await readPng((await saved(page, 'png')).bytes)
    expect(png.text).toBe('https://b0r3d.org')
    const file = (await saved(page, 'svg')).bytes.toString('utf8')
    expect(file).toContain('href="data:image/svg+xml;base64,')
  })

  test('a logo from a web address is fetched once and kept in the files', async ({ page, baseURL }) => {
    test.skip(!!process.env.E2E_BASE_URL, 'the dev server lets another origin fetch its pictures')
    await openPage(page)
    await openSection(page, 'Logo')
    // the same server under another name is another site
    const other = (baseURL ?? '').replace('127.0.0.1', 'localhost') + 'apple-touch-icon.png'
    await page.locator('#logo-url').fill(other)
    await page.locator('#logo-url').blur()
    await expect(page.getByTestId('logo-note')).toHaveText('Logo set. Drop or paste another to change it.')
    expect(await checked(page)).toBe('ok')
    const svg = (await saved(page, 'svg')).bytes.toString('utf8')
    expect(svg).toMatch(/class="qr-logo"[^>]*href="data:image\/png;base64,/)
    await page.locator('#logo-url').fill('http://127.0.0.1:1/nothing.png')
    await page.locator('#logo-url').blur()
    await expect(page.getByTestId('warnings')).toContainText("⚠ The logo isn't drawn. Couldn't get it from 127.0.0.1:1")
  })

  test('a frame with a caption, in a web font, on every side', async ({ page }) => {
    await openPage(page)
    await openSection(page, 'Frame')
    await page.locator('#frame-on').check()
    await page.locator('#caption').fill('Scan me for the menu')
    for (const side of ['Top', 'Left', 'Right', 'Bottom']) {
      await page.getByRole('button', { name: `Caption ${side === 'Top' || side === 'Bottom' ? 'at the' : 'on the'} ${side.toLowerCase()}` }).click()
      expect(await checked(page), side).toBe('ok')
      const hint = (await page.getByTestId('size-hint').textContent()) ?? ''
      const [, w, h] = /(\d+) × (\d+) pixels/.exec(hint) ?? []
      const png = await readPng((await saved(page, 'png')).bytes)
      expect(png, side).toEqual({ text: 'https://b0r3d.org', width: Number(w), height: Number(h) })
    }
    const plain = (await saved(page, 'png')).bytes
    await page.locator('#caption-font').selectOption({ label: 'Pacifico' })
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Pacifico') && f.status === 'loaded'))).toBe(true)
    expect(await checked(page)).toBe('ok')
    const pacifico = (await saved(page, 'png')).bytes
    expect(pacifico.equals(plain)).toBe(false)
    const svg = (await saved(page, 'svg')).bytes.toString('utf8')
    expect(svg).toContain(`font-family="'Pacifico', cursive"`)
    await page.locator('#frame-preset').selectOption('Dark Frame')
    await expect(page.locator('#caption-font')).toHaveValue('')
    expect(await checked(page)).toBe('ok')
  })

  test('size of the code and the UTF-8 marker', async ({ page }) => {
    await openPage(page)
    await page.locator('#qr-version').selectOption('10')
    await expect(page.getByTestId('info')).toContainText('version 10 · 57 × 57 modules')
    await page.locator('#qr-version').selectOption('1')
    await typeData(page, 'x'.repeat(40))
    await expect(page.getByTestId('version-hint')).toHaveText('Too much data for version 1, so version 4 is used.')
    await page.locator('#qr-version').selectOption('0')
    await typeData(page, 'Héllo wörld ✓')
    await page.locator('#utf8-marker').check()
    expect(await checked(page)).toBe('ok')
    await page.getByText("What's in this code").click()
    await expect(page.getByTestId('in-code')).toContainText('text, marked as UTF-8 (ECI 26)')
  })

  test('JPG, PDF and text files read back', async ({ page }) => {
    await openPage(page)
    await typeData(page, 'https://b0r3d.org/files')
    const jpg = await saved(page, 'jpg')
    expect(jpg.name).toBe('qr-code.jpg')
    expect(jpg.bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
    const shown = await page.evaluate(async (b64) => {
      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      c.getContext('2d')!.drawImage(img, 0, 0)
      return c.toDataURL('image/png').split(',')[1]
    }, jpg.bytes.toString('base64'))
    expect((await readPng(Buffer.from(shown, 'base64'))).text).toBe('https://b0r3d.org/files')
    const pdf = await saved(page, 'pdf')
    expect(pdf.name).toBe('qr-code.pdf')
    expect(pdf.bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
    expect(pdf.bytes.toString('latin1')).toContain('/Title (qr-code) /Producer (b0r3d QR ')
    expect(await readPdf(pdf.bytes)).toBe('https://b0r3d.org/files')

    await page.getByTestId('save-txt').click()
    const dialog = page.getByTestId('text-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByText('Full blocks').click()
    await dialog.getByText('In a Markdown code block').click()
    const [txt] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Save' }).click()])
    expect(txt.suggestedFilename()).toBe('qr-code.md')
    const text = (await bytesOf(txt)).toString('utf8')
    expect(text.startsWith('```\n')).toBe(true)
    expect(text).toContain('██')
    await expect(dialog).toBeHidden()
  })

  test('design files both ways, and the design kept where the site always kept it', async ({ page }) => {
    await openPage(page)
    await page.locator('#preset').selectOption('Dots')
    await openSection(page, 'Frame')
    await page.locator('#frame-on').check()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-design').click()])
    expect(download.suggestedFilename()).toBe('qr-code-config.json')
    const file = JSON.parse((await bytesOf(download)).toString('utf8'))
    expect(file).toMatchObject({ schemaVersion: 1, props: { data: 'https://b0r3d.org', dotsOptions: { type: 'dots' } }, frame: { position: 'bottom' } })

    // kept between visits, without the text
    await page.reload()
    await expect(page.locator('#preset')).toHaveValue('Dots')
    await expect(page.locator('#frame-on')).toBeChecked()
    const kept = await page.evaluate(() => localStorage.getItem('qrCodeConfig'))
    expect(JSON.parse(kept ?? '{}').props.data).toBeUndefined()

    // a design file opens on top, its text and all
    file.props.data = 'Opened from a file'
    file.props.dotsOptions.type = 'classy'
    file.frame = null
    await page.getByTestId('open-design-file').setInputFiles({ name: 'design.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
    await expect(page.locator('#data')).toHaveValue('Opened from a file')
    await expect(page.getByLabel('Dot shape', { exact: true })).toHaveValue('classy')
    await expect(page.locator('#frame-on')).not.toBeChecked()
    expect(await checked(page)).toBe('ok')
    await page.getByTestId('open-design-file').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":2,"props":{},"style":{"borderRadius":"0px"}}') })
    await expect(page.getByTestId('status')).toHaveText('This file was saved by a newer version of b0r3d QR, so it can’t be opened here.')
  })

  test("opens the design today's site kept", async ({ browser }) => {
    const context = await browser.newContext()
    await context.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem(
        'qrCodeConfig',
        '{"schemaVersion":1,"props":{"image":"","width":300,"height":300,"margin":2,"dotsOptions":{"color":"#c000c0","type":"dots"},"cornersSquareOptions":{"color":"#000000","type":"dot"},"cornersDotOptions":{"color":"#000000","type":"dot"},"imageOptions":{"padding":1},"qrOptions":{"errorCorrectionLevel":"H","typeNumber":0}},"style":{"borderRadius":"16px","background":"#ffffff"},"frame":null}'
      )
    })
    const page = await context.newPage()
    await openPage(page)
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org')
    await expect(page.getByLabel('Dot shape', { exact: true })).toHaveValue('dots')
    await expect(page.locator('#picture-size')).toHaveValue('300')
    await expect(page.locator('#quiet-zone')).toHaveValue('2')
    await expect(page.getByTestId('info')).toContainText('level H')
    await context.close()
  })

  test('copies the code as a picture', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', "Chromium's clipboard can be read in a test")
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openPage(page)
    await page.getByTestId('copy-picture').click()
    await expect(page.getByTestId('status')).toHaveText('Copied the code as a picture.')
    const png = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read()
      const blob = await item.getType('image/png')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return btoa(s)
    })
    expect((await readPng(Buffer.from(png, 'base64'))).text).toBe('https://b0r3d.org')
  })
})

test.describe('found in review', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop layout')

  // a design file as plain JSON, changed by the test
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Loose = Record<string, any>
  const designWith = (change: (d: Loose) => void) => {
    const d: Loose = {
      schemaVersion: 1,
      props: {
        data: 'https://b0r3d.org',
        image: '',
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
    change(d)
    return { name: 'design.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) }
  }

  test("a design file's text keeps its CR LF line breaks until it's edited", async ({ page }) => {
    await openPage(page)
    await page.getByTestId('open-design-file').setInputFiles(designWith((d) => (d.props.data = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ann Lee\r\nEND:VCARD')))
    await expect(page.getByTestId('info')).toContainText('47 bytes')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-design').click()])
    expect(JSON.parse((await bytesOf(download)).toString('utf8')).props.data).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ann Lee\r\nEND:VCARD')
    await page.locator('#data').press('End')
    await page.locator('#data').pressSequentially('!')
    await expect(page.getByTestId('info')).toContainText('45 bytes')
  })

  test('number boxes round and step as the PC app does', async ({ page }) => {
    await openPage(page)
    await page.locator('#quiet-zone').fill('2.25')
    await expect(page.getByTestId('warnings')).toContainText('Only 2.2 modules of blank space')
    await page.locator('#quiet-zone').press('ArrowUp')
    await expect(page.locator('#quiet-zone')).toHaveValue('3.2')
    await page.locator('#picture-size').fill('250.5')
    await page.locator('#picture-size').blur()
    await expect(page.locator('#picture-size')).toHaveValue('250')
  })

  test('the background picker and No picture follow their switches', async ({ page }) => {
    await openPage(page)
    const picker = page.locator('details.sec').filter({ has: page.locator('.sec-title', { hasText: /^Style$/ }) }).getByLabel('Background colour', { exact: true })
    await page.locator('#with-background').uncheck()
    await expect(picker).toBeDisabled()
    await page.locator('#with-background').check()
    await expect(picker).toBeEnabled()
    await openSection(page, 'Frame')
    await page.locator('#frame-on').check()
    const noPicture = page.getByRole('button', { name: 'No picture' })
    await expect(noPicture).toBeDisabled()
    await page.locator('.frame-panel input[type=file]').setInputFiles(fileURLToPath(CUP))
    await expect(noPicture).toBeEnabled()
    await noPicture.click()
    await expect(noPicture).toBeDisabled()
  })

  test('the PNG is its own SVG drawn, even with huge frame corners', async ({ page }) => {
    await openPage(page)
    await page.getByTestId('open-design-file').setInputFiles(
      designWith((d) => {
        d.frame = {
          text: 'Scan me',
          position: 'bottom',
          style: { textColor: '#000000', backgroundColor: '#ffcc00', borderColor: '#000000', borderWidth: '1px', borderRadius: '999px', padding: '16px' },
          captionWidth: 200
        }
      })
    )
    expect(await checked(page)).toBe('ok')
    const png = (await saved(page, 'png')).bytes
    const svg = (await saved(page, 'svg')).bytes.toString('utf8')
    const differ = await page.evaluate(
      async ({ png, svg }) => {
        const load = async (src: string) => {
          const img = new Image()
          img.src = src
          await img.decode()
          return img
        }
        const a = await load('data:image/png;base64,' + png)
        const b = await load(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })))
        const pixels = (img: HTMLImageElement) => {
          const c = document.createElement('canvas')
          c.width = a.width
          c.height = a.height
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0, a.width, a.height)
          return ctx.getImageData(0, 0, a.width, a.height).data
        }
        const pa = pixels(a)
        const pb = pixels(b)
        // the corners: how much of the picture's see-through edge differs
        let differ = 0
        for (let i = 3; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) > 128) differ++
        return differ / (a.width * a.height)
      },
      { png: png.toString('base64'), svg }
    )
    // (edges are smoothed a little differently; corners drawn the wrong way would differ in about a sixth of it)
    expect(differ).toBeLessThan(0.01)
  })

  test('a JPG puts white paper under a see-through background', async ({ page }) => {
    await openPage(page)
    await page.locator('#with-background').uncheck()
    const jpg = (await saved(page, 'jpg')).bytes
    const corner = await page.evaluate(async (b64) => {
      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return [...ctx.getImageData(2, 2, 1, 1).data]
    }, jpg.toString('base64'))
    expect(corner[0]).toBeGreaterThan(245)
  })

  test("a kept design this copy can't read is never written over", async ({ browser }) => {
    const context = await browser.newContext()
    const newer = '{"schemaVersion":2,"props":{"image":""},"style":{"borderRadius":"0px"},"futureKey":true}'
    await context.addInitScript((value) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1')
        localStorage.setItem('qrCodeConfig', value)
      }
    }, newer)
    const page = await context.newPage()
    await openPage(page)
    await page.locator('#preset').selectOption('Dots')
    await page.waitForTimeout(600)
    await page.reload()
    await openPage(page)
    expect(await page.evaluate(() => localStorage.getItem('qrCodeConfig'))).toBe(newer)
    await context.close()
  })

  test('a kept design is left as it is until something changes', async ({ browser }) => {
    const context = await browser.newContext()
    const kept = '{ "schemaVersion": 1, "props": {"image":"","width":300,"height":300,"margin":4,"dotsOptions":{"color":"#000000","type":"dots"}}, "style": {"borderRadius":"0px","background":"#ffffff"}, "frame": null }'
    await context.addInitScript((value) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1')
        localStorage.setItem('qrCodeConfig', value)
      }
    }, kept)
    const page = await context.newPage()
    await openPage(page)
    await page.waitForTimeout(800)
    expect(await page.evaluate(() => localStorage.getItem('qrCodeConfig'))).toBe(kept)
    await page.getByLabel('Dot shape', { exact: true }).selectOption('rounded')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('qrCodeConfig'))).toContain('"type":"rounded"')
    await context.close()
  })

  test("the logo size slider is the PC app's, and a file's own share stays until it's moved", async ({ page }) => {
    await openPage(page)
    await page.getByTestId('open-design-file').setInputFiles(
      designWith((d) => {
        d.props.image = 'data:image/png;base64,' + readFileSync(fileURLToPath(CUP)).toString('base64')
        d.props.imageOptions.imageSize = 0.8
      })
    )
    await openSection(page, 'Logo')
    await expect(page.locator('#logo-size')).toHaveAttribute('max', '0.5')
    await expect(page.locator('output.slider-value')).toHaveText('0.80')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-design').click()])
    expect(JSON.parse((await bytesOf(download)).toString('utf8')).props.imageOptions.imageSize).toBe(0.8)
  })
})

test.describe('on a phone, the footer', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only')

  test('can be scrolled clear of the bar at the bottom', async ({ page }) => {
    await openPage(page)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    const version = await page.getByTestId('app-version').boundingBox()
    const bar = await page.locator('.code-col').boundingBox()
    expect(version!.y + version!.height).toBeLessThanOrEqual(bar!.y)
  })
})

test.describe('the PC app makes the same picture sizes', () => {
  test.skip(({ isMobile, browserName }) => isMobile || browserName !== 'chromium', 'Chromium measures captions as the PC app does')
  // a caption of several lines: the page's own line breaking sizes the pictures, as in the PC app
  const pc = JSON.parse(readFileSync(new URL('../../src/test/pc-app-art.json', import.meta.url), 'utf8')) as { name: string; file: string; width: number; height: number }[]
  for (const c of pc.filter((c) => /long caption|crlf caption|emoji caption|frame font/.test(c.name))) {
    test(c.name, async ({ page }) => {
      await openPage(page)
      await page.getByTestId('open-design-file').setInputFiles({ name: 'd.json', mimeType: 'application/json', buffer: Buffer.from(c.file) })
      await expect(page.getByTestId('size-hint')).toContainText(`${c.width} × ${c.height} pixels`)
    })
  }
})
