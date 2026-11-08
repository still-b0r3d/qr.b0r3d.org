import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cards, codePicture, openScan, scanStatus } from './scanning'

// Scan with the camera, with Chromium's pretend camera showing a QR code (WebKit has none, so the
// config runs this file in Chromium only).

/** A video file for the pretend camera: a QR code on grey, as YUV4MPEG2 (4:2:0). */
async function cameraVideo(): Promise<string> {
  const code = await codePicture('QRCode', 'https://b0r3d.org/from-the-camera')
  const width = 640
  const height = 480
  const y = Buffer.alloc(width * height, 200)
  const left = Math.floor((width - code.width) / 2)
  const top = Math.floor((height - code.height) / 2)
  for (let row = 0; row < code.height; row++)
    for (let col = 0; col < code.width; col++) y[(top + row) * width + left + col] = code.data[(row * code.width + col) * 4] < 128 ? 16 : 235
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128)
  const file = join(tmpdir(), `b0r3d-qr-camera-${process.pid}.y4m`)
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`), Buffer.from('FRAME\n'), y, chroma, chroma]))
  return file
}

const video = await cameraVideo()
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] } })

test('the first code the camera sees goes to the Scan tab, and the camera goes off', async ({ page }) => {
  await openScan(page)
  await page.getByTestId('scan-camera').click()
  const camera = page.getByTestId('camera-dialog')
  await expect(camera).toBeVisible()
  await expect(camera).toBeHidden({ timeout: 30_000 })
  // (with one camera it's "the camera", as the PC app says it; a camera's name only when there's a choice)
  await expect(scanStatus(page)).toHaveText('1 code from the camera')
  await expect(cards(page).locator('.found-text')).toHaveValue('https://b0r3d.org/from-the-camera')
  await expect(cards(page).locator('.found-summary')).toHaveText('QR code · b0r3d.org · the camera')
  await expect(cards(page).locator('.found-picture img')).toHaveCount(1)
  // the camera was let go of
  expect(await page.evaluate(() => (document.querySelector('.camera-video') as HTMLVideoElement).srcObject)).toBeNull()
})
