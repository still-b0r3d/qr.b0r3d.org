import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { readCodes, readQr } from '../../src/test/zxing'

// The same files as the PC app: for every design, print size and barcode the PC app was asked to
// save (b0r3d QR 0.8, its code loaded by reflection, no window; src/test/pc-app-print.json), the
// site's PNG, JPG and PDF, made in the browser by the page's own code. Their sizes, resolutions and
// PDF pages are the PC app's. Where both draw whole pixels (square modules a whole number of pixels
// each, no caption or text), their pixels are the PC app's, dark and light, every one. And every
// picture scans as its code. (The SVGs are the same character for character: print-pc.test.ts.)

interface PcCase {
  design?: string
  type?: string
  text?: string
  look?: { color: string; background: string; transparent: boolean; scale: number; showText: boolean }
  print: { on: boolean; width: number; unit: string; dpi: number }
  wholePixels?: boolean
  size?: { dpi: number }
  png: { width: number; height: number; pHYs: number | null; thresholdSha256: string }
  jpg: { units: number; x: number; y: number }
  pdf: { mediaBox: string; width: number; height: number; title: string; mask: boolean }
}
const pc = JSON.parse(readFileSync(new URL('../../src/test/pc-app-print.json', import.meta.url), 'utf8')) as {
  designs: { name: string; file: string }[]
  qr: PcCase[]
  barcodes: PcCase[]
}

/** the designs whose modules are square and start on a whole pixel (no half-module margin, rounded corners or caption) */
const SQUARE = ['plain', 'plain 333', 'margin 0, level L', 'long text', 'see-through']
/** the barcode types that write their text under the bars */
const WITH_TEXT = ['Ean13', 'Code128', 'Itf14']
const READ_AS: Record<string, string> = { Ean13: 'EAN13', Code128: 'Code128', DataMatrix: 'DataMatrix', Itf14: 'ITF', Pdf417: 'PDF417' }

/** which pixels are dark or light: each channel 255 from half up, else 0; a pixel less than half there all 0 */
function threshold(rgba: Uint8Array): Uint8Array {
  const t = new Uint8Array(rgba.length)
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    for (let c = 0; c < 4; c++) t[i + c] = rgba[i + c] >= 128 ? 255 : 0
  }
  return t
}

/** the picture over white, as it would be printed or shown */
function onWhite(png: PNG): Uint8ClampedArray {
  const out = new Uint8ClampedArray(png.data.length)
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(png.data[i + c] * a + 255 * (1 - a))
    out[i + 3] = 255
  }
  return out
}

function pdfFacts(bytes: Buffer): PcCase['pdf'] {
  const text = bytes.toString('latin1')
  const image = /\/Subtype \/Image \/Width (\d+) \/Height (\d+)/.exec(text)!
  return {
    mediaBox: /\/MediaBox \[([^\]]*)\]/.exec(text)![1],
    width: Number(image[1]),
    height: Number(image[2]),
    title: /\/Title (\([^)]*\)|<[0-9A-F]*>)/.exec(text)![1],
    mask: text.includes('/SMask')
  }
}

/** The files the page makes for a case, as base64. */
async function made(page: Page, c: PcCase, designFile: string | null): Promise<{ png: string; jpg: string; pdf: string }> {
  return page.evaluate(
    async ({ c, designFile }) => {
      const base64 = async (blob: Blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let s = ''
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return btoa(s)
      }
      const print = { ...c.print, unit: c.print.unit as 'mm' | 'in' }
      if (designFile !== null) {
        const ex = (await import(String('/src/qr/export.ts'))) as typeof import('../../src/qr/export')
        const { QrArt, captionFont } = (await import(String('/src/qr/art.ts'))) as typeof import('../../src/qr/art')
        const { readDesign } = (await import(String('/src/qr/design-file.ts'))) as typeof import('../../src/qr/design-file')
        const { plainDesign } = (await import(String('/src/qr/design.ts'))) as typeof import('../../src/qr/design')
        const d = readDesign(designFile, plainDesign(''))
        const art = new QrArt(d)
        const measurer = document.createElement('canvas').getContext('2d')!
        const measure = (line: string) => {
          measurer.font = d.frame?.fontFamily ? captionFont(d.frame.fontFamily) : '18px Inter, system-ui, sans-serif'
          return measurer.measureText(line).width
        }
        const output = { print, wholePixels: c.wholePixels === true }
        return {
          png: await base64(await ex.pngFile(art, measure, output)),
          jpg: await base64(await ex.jpgFile(art, measure, output)),
          pdf: await base64(await ex.pdfFile(art, measure, 'qr-code', 'b0r3d QR', output))
        }
      }
      const svg = (await import(String('/src/qr/barcode-svg.ts'))) as typeof import('../../src/qr/barcode-svg')
      const { askFor, madeFrom } = (await import(String('/src/qr/barcode-make.ts'))) as typeof import('../../src/qr/barcode-make')
      const { BarcodeWriter } = (await import(String('/src/ui/barcode-writer.ts'))) as typeof import('../../src/ui/barcode-writer')
      const TYPE: Record<string, string> = { Ean13: 'ean13', Code128: 'code128', DataMatrix: 'datamatrix', Itf14: 'itf14', Pdf417: 'pdf417' }
      const type = TYPE[c.type!] as Parameters<typeof askFor>[0]
      const look = { ...svg.defaultLook(), ...c.look! }
      const asked = askFor(type, c.text!, look)
      if ('error' in asked) throw new Error(asked.error)
      const writer = new BarcodeWriter()
      const written = await writer.write(asked.ask)
      writer.release()
      const barcode = madeFrom(type, written.svg, written.error, look.barHeight)
      if ('error' in barcode) throw new Error(barcode.error)
      const art = new svg.BarcodeArt(barcode.barcode)
      return {
        png: await base64(await svg.barcodePng(art, look, print)),
        jpg: await base64(await svg.barcodeJpg(art, look, print)),
        pdf: await base64(await svg.barcodePdf(art, look, 'barcode', 'b0r3d QR', print))
      }
    },
    { c, designFile }
  )
}

test.describe('the same files as the PC app', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile || !!process.env.E2E_BASE_URL, 'Chromium on the dev server (it imports the page’s modules)')

  test('QR codes and barcodes: sizes, resolutions, PDF pages, pixels, and every picture scans', async ({ page }) => {
    test.setTimeout(600_000)
    await page.goto('/')
    const designs = new Map(pc.designs.map((d) => [d.name, d.file]))
    const report: string[] = []
    let samePixels = 0
    for (const c of [...pc.qr, ...pc.barcodes]) {
      const print = c.print.on ? `${c.print.width} ${c.print.unit} at ${c.print.dpi}` : 'off'
      const label = c.design ? `${c.design}, print ${print}, whole ${c.wholePixels}` : `${c.type} ${c.look!.scale} ${c.look!.transparent ? 'clear' : c.look!.background}${c.look!.showText ? '' : ' no text'}, print ${print}`
      const files = await made(page, c, c.design ? designs.get(c.design)! : null)
      const pngBytes = Buffer.from(files.png, 'base64')
      const png = PNG.sync.read(pngBytes)
      const pHYs = pngBytes.indexOf('pHYs', 8, 'latin1')
      const jpg = Buffer.from(files.jpg, 'base64')
      const jfif = jpg.indexOf('JFIF\0', 0, 'latin1')
      const facts = {
        png: { width: png.width, height: png.height, pHYs: pHYs < 0 ? null : pngBytes.readUInt32BE(pHYs + 4) },
        jpg: { units: jpg[jfif + 7], x: jpg.readUInt16BE(jfif + 8), y: jpg.readUInt16BE(jfif + 10) },
        pdf: pdfFacts(Buffer.from(files.pdf, 'base64'))
      }
      // The PC app's text under the bars can come out a shade see-through (WPF draws some of it at 254
      // of 255, depending on the size), so its PDF of such a barcode can carry a mask it doesn't need;
      // the site's is solid, as the background is. (Noted for QR PC 0.9.)
      const pcTextShade = !!c.type && c.look!.showText && !c.look!.transparent && WITH_TEXT.includes(c.type)
      const theirs = { png: { width: c.png.width, height: c.png.height, pHYs: c.png.pHYs }, jpg: c.jpg, pdf: { ...c.pdf, mask: pcTextShade ? false : c.pdf.mask } }
      if (JSON.stringify(facts) !== JSON.stringify(theirs)) report.push(`${label}: ${JSON.stringify(facts)} vs ${JSON.stringify(theirs)}`)
      // the pixels, where both draw whole pixels
      const sharp = c.design ? c.wholePixels === true && c.size!.dpi === 96 && SQUARE.includes(c.design) : !(c.look!.showText && WITH_TEXT.includes(c.type!))
      if (sharp) {
        if (createHash('sha256').update(threshold(png.data)).digest('hex') === c.png.thresholdSha256) samePixels++
        else report.push(`${label}: its pixels aren't the PC app's`)
      }
      // and it scans as its code
      const pixels = { width: png.width, height: png.height, data: onWhite(png) }
      const read = c.design ? (await readQr(pixels))[0]?.text : (await readCodes(pixels, [READ_AS[c.type!]]))[0]?.text
      const expected = c.design ? (JSON.parse(designs.get(c.design)!) as { props: { data: string } }).props.data : c.text!
      if (read === undefined || (c.design ? read !== expected : !read.startsWith(expected))) report.push(`${label}: reads as ${JSON.stringify(read)}`)
    }
    expect(report).toEqual([])
    // (the sharp ones: 5 designs at whole pixels, 3 ways each; Data Matrix and PDF417 in 3 looks at 5
    // print sizes; the 3 barcodes with text, without it, at 5)
    expect(samePixels).toBe(5 * 3 + 2 * 3 * 5 + 3 * 5)
  })
})
