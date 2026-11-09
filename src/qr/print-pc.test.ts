import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import pc from '../test/pc-app-print.json'
import { writeBarcode } from '../test/zint'
import { QrArt } from './art'
import { askFor, madeFrom } from './barcode-make'
import { barcodeModulePx, barcodeSvgText, defaultLook, type BarcodeSvg } from './barcode-svg'
import type { BarcodeType } from './barcodes'
import { plainDesign } from './design'
import { readDesign } from './design-file'
import { pictureSize, svgText } from './export'
import { barcodeGuidance, barcodePrintLine, qrPrintLine, readPrint, writtenPrint, type PrintSize } from './print'

// What the PC app (b0r3d QR 0.8, its code loaded by reflection, no window) makes at print sizes: for
// 8 designs and 8 print sizes (with and without whole pixels per module), the picture size and its
// resolution, the line under the print size and its warning, and the SVG; for 5 barcodes in 3 looks
// (one without its text) at 5 print sizes, the same. The website's pictures and PDFs are checked
// against the rest of it in the browser (tests/e2e/files.spec.ts).

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const TYPE: Record<string, BarcodeType> = { Ean13: 'ean13', Code128: 'code128', DataMatrix: 'datamatrix', Itf14: 'itf14', Pdf417: 'pdf417' }

const designs = new Map(pc.designs.map((d) => [d.name, readDesign(d.file, plainDesign(''))]))
const asPrint = (p: { on: boolean; width: number; unit: string; dpi: number }): PrintSize => ({ on: p.on, width: p.width, unit: p.unit as PrintSize['unit'], dpi: p.dpi })

describe('QR codes at print sizes, as the PC app makes them', () => {
  it.each(pc.qr.map((c, i) => [`${i} ${c.design}`, c] as const))('%s', (_, c) => {
    const art = new QrArt(designs.get(c.design)!)
    const print = asPrint(c.print)
    const size = pictureSize(art, () => 0, { print, wholePixels: c.wholePixels })
    expect([size.width, size.height, size.dpi]).toEqual([c.size!.width, c.size!.height, c.size!.dpi])
    expect(size.scale).toBeCloseTo(c.size!.scale, 12)
    const said = qrPrintLine(art, print)
    expect([said?.line ?? null, said?.warning ?? null]).toEqual([c.line, c.warning])
    const svg = svgText(art, print)
    expect(svg.slice(0, c.svgHead!.length)).toBe(c.svgHead)
    expect(sha(svg)).toBe(c.svgSha256)
  })
})

async function made(type: BarcodeType, text: string, showText: boolean): Promise<BarcodeSvg> {
  const look = { ...defaultLook(), showText }
  const asked = askFor(type, text, look)
  if ('error' in asked) throw new Error(asked.error)
  const w = await writeBarcode(asked.ask.text, { format: asked.ask.format as never, options: asked.ask.options, scale: 1, addHRT: asked.ask.addHRT, addQuietZones: asked.ask.addQuietZones })
  const m = madeFrom(type, w.error ? null : w.svg, w.error || null, look.barHeight)
  if ('error' in m) throw new Error(m.error)
  return m.barcode
}

describe('barcodes at print sizes, as the PC app makes them', () => {
  it.each(pc.barcodes.map((c, i) => [`${i} ${c.type}`, c] as const))('%s', async (_, c) => {
    const look = { ...defaultLook(), ...c.look }
    const b = await made(TYPE[c.type], c.text, look.showText)
    const print = asPrint(c.print)
    const g = barcodeGuidance(print, b.width, b.height)
    expect([g.widthPx, g.heightPx, g.modulePx, g.tooSmall]).toEqual([c.guidance!.widthPx, c.guidance!.heightPx, c.guidance!.modulePx, c.guidance!.tooSmall])
    expect(g.moduleMm).toBeCloseTo(c.guidance!.moduleMm, 12)
    expect(g.actualWidthMm).toBeCloseTo(c.guidance!.actualWidthMm, 10)
    const said = barcodePrintLine(print, b.width, b.height)
    expect([said.line, said.warning]).toEqual([c.line, c.warning])
    const svg = barcodeSvgText(b, look, print)
    expect(svg.slice(0, c.svgHead!.length)).toBe(c.svgHead)
    expect(sha(svg)).toBe(c.svgSha256)
    // the pictures: every module whole pixels
    expect([b.width * barcodeModulePx(b, look, print), b.height * barcodeModulePx(b, look, print)]).toEqual([c.png!.width, c.png!.height])
  })
})

describe('the print size kept in the browser, where the site has always kept it', () => {
  it('reads what today’s site keeps, and writes it in the same shape', () => {
    const kept = '{"enabled":true,"width":40,"unit":"mm","dpi":300}'
    expect(readPrint(JSON.parse(kept))).toEqual({ on: true, width: 40, unit: 'mm', dpi: 300 })
    expect(writtenPrint(readPrint(JSON.parse(kept)))).toBe(kept)
    // only the parts of the right kind, the rest the defaults
    expect(readPrint({ enabled: 'yes', width: Number.NaN, unit: 'cm', dpi: 1200 })).toEqual({ on: false, width: 40, unit: 'mm', dpi: 300 })
    expect(readPrint(null)).toEqual({ on: false, width: 40, unit: 'mm', dpi: 300 })
    expect(readPrint({ enabled: true, width: 1.5, unit: 'in', dpi: 600 })).toEqual({ on: true, width: 1.5, unit: 'in', dpi: 600 })
  })
})
