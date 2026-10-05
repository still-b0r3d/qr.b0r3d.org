import { chromium, expect, test, type Page } from '@playwright/test'
import fs from 'fs'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/full'

test('scans a QR code from file', async ({ page }) => {
  await page.goto('/')

  const desktopScanButton = page.locator(
    'div.md\\:flex >> button[aria-label*="Switch to Scan Mode"]'
  )
  const genericScanButton = page.getByLabel(/Switch to Scan Mode/i).first()

  if ((await desktopScanButton.count()) > 0 && (await desktopScanButton.isVisible())) {
    await desktopScanButton.click()
  } else if ((await genericScanButton.count()) > 0 && (await genericScanButton.isVisible())) {
    await genericScanButton.click()
  } else {
    console.error("Could not find a visible 'Switch to Scan Mode' button.")
    await page.screenshot({
      path: 'test-results/scan-test-scan-button-not-found.png',
      fullPage: true
    })
    throw new Error('Scan mode button not found or not visible.')
  }

  const fileInput = page.locator('input[type="file"]')

  try {
    await expect(fileInput).toHaveCount(1, { timeout: 10000 }) // Check it exists
  } catch (error) {
    console.error(
      'QR code file input (\'input[type="file"]\') not found or more than one instance exists after switching to Scan mode.'
    )
    await page.screenshot({
      path: 'test-results/scan-test-qr-file-input-not-found.png',
      fullPage: true
    })
    throw error
  }

  await fileInput.setInputFiles('tests/e2e/fixtures/test-qrcode.png')

  await expect(page.getByText('Test QR Data')).toBeVisible({ timeout: 10000 })
})

// ---------------------------------------------------------------------------
// Barcodes and the camera, read by ZXing-C++ (zxing-wasm)

const wasm = fs.readFileSync('node_modules/zxing-wasm/dist/full/zxing_full.wasm')
prepareZXingModule({
  overrides: {
    wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)
  }
})

async function barcodePng(text: string, format: string, scale = 4): Promise<Buffer> {
  const out = await writeBarcode(text, { format: format as never, scale })
  if (out.error) throw new Error(out.error)
  return Buffer.from(await out.image!.arrayBuffer())
}

async function openScan(page: Page) {
  await page.goto('/')
  await page
    .getByLabel(/Switch to Scan Mode/i)
    .first()
    .click()
}

test('reads a product barcode, labels it, and recreates it as the same type', async ({
  page
}, testInfo) => {
  const file = testInfo.outputPath('ean13.png')
  fs.writeFileSync(file, await barcodePng('9506000134352', 'EAN13'))
  await openScan(page)
  await page.locator('input[type="file"]').setInputFiles(file)
  await expect(page.getByText('9506000134352')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Product number')).toBeVisible()
  // A product number is not a phone number: nothing to tap.
  await expect(page.locator('a', { hasText: '9506000134352' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Create a code with this data' }).click()
  await expect(page.locator('#code-type')).toHaveValue('ean13')
  await expect(page.locator('#barcode-data')).toHaveValue('9506000134352')
})

test("reads this app's SMS codes as SMS, with a link that keeps the message", async ({
  page
}, testInfo) => {
  const file = testInfo.outputPath('sms.png')
  fs.writeFileSync(file, await barcodePng('SMSTO:+15550100:Meet at 10:30', 'QRCode', 6))
  await openScan(page)
  await page.locator('input[type="file"]').setInputFiles(file)
  await expect(page.getByText('SMS', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('a[href^="sms:"]')).toHaveAttribute(
    'href',
    'sms:+15550100?body=Meet%20at%2010%3A30'
  )
})

// Chromium's fake camera plays a .y4m file; this one shows a Data Matrix.
async function writeY4m(path: string, png: Buffer) {
  const W = 640
  const H = 480
  const { data } = await sharp({
    create: { width: W, height: H, channels: 3, background: '#ffffff' }
  })
    .composite([{ input: await sharp(png).resize({ height: 300 }).toBuffer(), gravity: 'center' }])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const y = Buffer.alloc(W * H)
  const u = Buffer.alloc((W / 2) * (H / 2))
  const v = Buffer.alloc((W / 2) * (H / 2))
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]
    y[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  for (let row = 0; row < H / 2; row++) {
    for (let col = 0; col < W / 2; col++) {
      const i = (row * 2 * W + col * 2) * 3
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      u[row * (W / 2) + col] = Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128)
      v[row * (W / 2) + col] = Math.round(0.5 * r - 0.419 * g - 0.081 * b + 128)
    }
  }
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`)
  fs.writeFileSync(path, Buffer.concat([header, y, u, v]))
}

test('reads a barcode through the camera', async ({ baseURL }, testInfo) => {
  const video = testInfo.outputPath('camera.y4m')
  await writeY4m(video, await barcodePng('b0r3d camera test', 'DataMatrix', 8))
  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${video}`
    ]
  })
  try {
    const page = await browser.newPage({ baseURL })
    await openScan(page)
    await page.getByRole('button', { name: /scan with camera/i }).click()
    await expect(page.getByText('b0r3d camera test')).toBeVisible({ timeout: 20000 })
    // The camera is released once a code is found.
    expect(await page.evaluate(() => document.querySelector('video')?.srcObject ?? null)).toBeNull()
  } finally {
    await browser.close()
  }
})
