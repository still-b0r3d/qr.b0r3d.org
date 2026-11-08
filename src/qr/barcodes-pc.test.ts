import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import pc from '../test/pc-app-barcodes.json'
import { writeBarcode } from '../test/zint'
import { askFor, madeFrom } from './barcode-make'
import { barcodeWarnings, defaultLook, styledSvg, type BarcodeSvg } from './barcode-svg'
import { BARCODE_FORMATS, barcodeFormat, forScanned, type BarcodeType } from './barcodes'
import { describeCode, formatName, linkWarnings, webLink } from './kinds'

// What the PC app (b0r3d QR 0.8, its code loaded by reflection, no window) makes for each barcode
// type and settings, what it says about what's typed, how it colours a barcode, what it calls a
// scanned code and what it warns about a link. The website makes its barcodes with zint through
// zxing-wasm; they must come out the same, character for character.

const TYPE: Record<string, BarcodeType> = {
  DataMatrix: 'datamatrix',
  Gs1DataMatrix: 'gs1-datamatrix',
  Aztec: 'aztec',
  Pdf417: 'pdf417',
  Ean13: 'ean13',
  Ean8: 'ean8',
  UpcA: 'upca',
  UpcE: 'upce',
  Isbn: 'isbn',
  Code128: 'code128',
  Gs1_128: 'gs1-128',
  Itf14: 'itf14',
  Code39: 'code39'
}
/** ZXing.Net's names for formats, as zxing-wasm calls them */
const FORMAT: Record<string, string> = {
  QR_CODE: 'QRCode',
  DATA_MATRIX: 'DataMatrix',
  AZTEC: 'Aztec',
  PDF_417: 'PDF417',
  EAN_13: 'EAN13',
  EAN_8: 'EAN8',
  UPC_A: 'UPCA',
  UPC_E: 'UPCE',
  CODE_128: 'Code128',
  CODE_39: 'Code39',
  CODE_93: 'Code93',
  ITF: 'ITF',
  CODABAR: 'Codabar',
  RSS_14: 'DataBar',
  RSS_EXPANDED: 'DataBarExp',
  MAXICODE: 'MaxiCode',
  UPC_EAN_EXTENSION: 'EAN5'
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** A list as PowerShell's JSON writes it: one item on its own, none as {} or nothing. */
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === 'string' ? [v] : [])

async function make(type: BarcodeType, text: string, options: { showText: boolean; allowRectangular: boolean; barHeight: number; quietZones: boolean }) {
  const asked = askFor(type, text, options)
  if ('error' in asked) return asked
  const written = await writeBarcode(asked.ask.text, { format: asked.ask.format as never, options: asked.ask.options, scale: 1, addHRT: asked.ask.addHRT, addQuietZones: asked.ask.addQuietZones })
  return madeFrom(type, written.error ? null : written.svg, written.error || null, options.barHeight)
}

describe('the barcode types are the PC app’s', () => {
  it('in its order, with its names, groups, hints and examples', () => {
    expect(BARCODE_FORMATS.map((f) => f.id)).toEqual(pc.types.map((t) => TYPE[t.type]))
    for (const t of pc.types) {
      const f = barcodeFormat(TYPE[t.type])
      expect([f.label, f.group, f.hint, f.example, f.linear, f.gs1, f.keepsQuietZones, f.readFormat]).toEqual([
        t.label,
        t.group,
        t.hint,
        t.example,
        t.linear,
        t.gs1,
        t.keepsQuietZones,
        FORMAT[t.readFormat]
      ])
      for (const [read, normal] of t.normalized as [string, string][]) expect([t.type, read, f.normalizeRead(read)]).toEqual([t.type, read, normal])
    }
  })
})

describe('barcodes come out as the PC app makes them', () => {
  it.each(pc.made.map((c, i) => [i, c] as const))('%i', async (_, c) => {
    const type = TYPE[c.type]
    const f = barcodeFormat(type)
    const prepared = f.prepare(c.text)
    expect(prepared).toBe(c.prepared)
    expect(f.check(prepared)).toBe(c.check)
    if (c.check === null) expect(f.expectedText(prepared)).toBe(c.expected)
    const made = await make(type, c.text, c.options)
    if (c.check !== null) {
      expect(made).toEqual({ error: c.check })
      return
    }
    if (c.error !== null) {
      expect(made).toEqual({ error: c.error })
      return
    }
    expect('barcode' in made).toBe(true)
    const b = (made as { barcode: BarcodeSvg }).barcode
    if (c.svg) expect(b.svg).toBe(c.svg)
    expect([b.svg.length, sha(b.svg), b.width, b.height]).toEqual([c.svgLength, c.svgSha256, c.width, c.height])
  })

  it.each(pc.styled.map((c, i) => [i, c] as const))('coloured %i', async (_, c) => {
    const made = await make(TYPE[c.type], c.text, { showText: true, allowRectangular: false, barHeight: 50, quietZones: true })
    expect(styledSvg((made as { barcode: BarcodeSvg }).barcode, c.color, c.background, c.scale)).toBe(c.svg)
  })
})

describe('a scanned barcode is made again as the PC app makes it', () => {
  it.each(pc.scanned.map((c, i) => [i, c] as const))('%i', (_, c) => {
    expect(forScanned(FORMAT[c.format], c.text, c.gs1)).toEqual(list(c.types).map((t) => TYPE[t]))
  })
})

describe('the barcode warnings are the PC app’s', () => {
  it.each(pc.looks.map((c, i) => [i, c] as const))('%i', (_, c) => {
    const warnings = barcodeWarnings({ ...defaultLook(), color: c.color, background: c.background, transparent: c.transparent })
    // (the contrast ratio rounded down: the PC app's number, or 0.1 less, until its next version)
    expect(warnings.map((w) => w.replace(/^Low contrast \([\d.]+:1\)/, 'Low contrast'))).toEqual(list(c.warnings).map((w) => w.replace(/^Low contrast \([\d.]+:1\)/, 'Low contrast')))
  })
})

// Where the website says it differently on purpose: .NET Framework writes an IPv6 address out in
// full, a browser as it's usually written.
const DIFFERENT: Record<string, { detail: string }> = { 'https://[::1]/a': { detail: '[::1]' } }

describe('a scanned code is described as the PC app describes it', () => {
  it.each(pc.kinds.map((c, i) => [i, c] as const))('%i', (_, c) => {
    const said = describeCode(c.text, FORMAT[c.format])
    expect([c.text, c.format, said.kind, said.detail]).toEqual([c.text, c.format, c.kind, DIFFERENT[c.text]?.detail ?? c.detail])
    const link = webLink(c.text)
    expect([c.text, link !== null]).toEqual([c.text, c.link])
    if (link) expect([c.text, linkWarnings(link)]).toEqual([c.text, list(c.warnings)])
  })

  it.each(pc.names.map((c, i) => [i, c] as const))('named %i', (_, c) => {
    expect([c.format, c.text, c.symbology, formatName(FORMAT[c.format], c.text, c.symbology)]).toEqual([c.format, c.text, c.symbology, c.name])
  })
})
