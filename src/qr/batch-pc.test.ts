import { describe, expect, it } from 'vitest'
import pc from '../test/pc-app-batch.json'
import { writeBarcode } from '../test/zint'
import { askFor, madeFrom } from './barcode-make'
import { defaultLook } from './barcode-svg'
import { type BarcodeType } from './barcodes'
import {
  BARCODE_GUIDE,
  barcodeExample,
  barcodeNames,
  CONTACTS_EXAMPLE,
  designFor,
  fontValue,
  glimpse,
  pdfTitle,
  planBatch,
  QR_EXAMPLE,
  QR_GUIDE,
  qrNames,
  readBarcodeBatch,
  readQrBatch,
  textNames,
  type BatchFormat,
  type BatchKind,
  type BatchRow
} from './batch'
import { csvText, parseCsv } from './csv'
import { readDesign } from './design-file'

// What the PC app (b0r3d QR 0.8, its code loaded by reflection, no window) makes of batches: how it
// reads a CSV's text and a file's bytes, the rows it takes for QR codes and for barcodes, the names
// it gives the files, which rows it can make in each kind of file (and why not), each row's design,
// its examples and its guides. The website's batches must come out the same.

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
const FORMAT: Record<string, BatchFormat> = { Png: 'png', Jpg: 'jpg', Svg: 'svg', Pdf: 'pdf', Text: 'text' }

/** a row as the PC app's harness writes it (no contact, or its fields) */
const pcRow = (r: BatchRow) => ({ row: r.row, data: r.data, frameText: r.frameText, fileName: r.fileName, font: r.font, ...(r.contact ? { contact: r.contact } : {}) })

/** a barcode row's problem, as the page asks its barcode worker: the type's checks, then zint's */
async function barcodeProblem(type: BarcodeType, text: string): Promise<string | null> {
  const look = defaultLook()
  const asked = askFor(type, text, look)
  if ('error' in asked) return asked.error
  const written = await writeBarcode(asked.ask.text, { format: asked.ask.format as never, options: asked.ask.options, scale: 1, addHRT: asked.ask.addHRT, addQuietZones: asked.ask.addQuietZones })
  const made = madeFrom(type, written.error ? null : written.svg, written.error || null, look.barHeight)
  return 'error' in made ? made.error : null
}

const designs = new Map(pc.designs.map((d) => [d.name, d.file]))
const kindOf = (design: string, format: string, barcode: string | null, frame = false): BatchKind => ({
  barcode: barcode ? TYPE[barcode] : null,
  design: readDesign(designs.get(design)!),
  frame,
  logoFetched: false,
  format: FORMAT[format],
  textStyle: 'half',
  markdown: false
})

describe('a batch’s CSV, read as the PC app reads it', () => {
  it(`${pc.csv.length} texts: the separator and the records`, () => {
    for (const c of pc.csv) {
      const table = parseCsv(c.text)
      expect({ name: c.name, separator: table.separator, records: table.records }).toEqual({ name: c.name, separator: c.separator, records: c.records })
    }
  })

  it('files’ bytes: UTF-8 (one byte order mark dropped) or Windows-1252', () => {
    for (const b of pc.bytes) expect({ name: b.name, text: csvText(new Uint8Array(Buffer.from(b.base64, 'base64'))) }).toEqual({ name: b.name, text: b.text })
  })

  it('the QR rows, whether there are captions, the files’ names and the text files’ names', () => {
    let usable = 0
    for (const c of pc.csv) {
      const read = readQrBatch(c.text)
      if (c.qr === null) {
        expect({ name: c.name, read }).toEqual({ name: c.name, read: null })
        continue
      }
      usable++
      expect(read, c.name).not.toBeNull()
      const rows = read!.rows
      expect({ name: c.name, rows: rows.map(pcRow), hasFrameText: read!.hasFrameText }).toEqual({ name: c.name, rows: c.qr.rows, hasFrameText: c.qr.hasFrameText })
      expect({ name: c.name, names: qrNames(rows) }).toEqual({ name: c.name, names: c.qr.names })
      expect({ name: c.name, names: textNames(rows, rows.map((_, i) => i)) }).toEqual({ name: c.name, names: c.qr.textNames })
    }
    expect(usable).toBeGreaterThan(500)
  })

  it('the barcode rows and their files’ names', () => {
    for (const c of pc.csv) {
      const rows = readBarcodeBatch(c.text)
      expect({ name: c.name, rows: rows.map((r) => ({ row: r.row, data: r.data, frameText: r.frameText, fileName: r.fileName, font: r.font })) }).toEqual({ name: c.name, rows: c.barcodes.rows ?? [] })
      expect({ name: c.name, names: barcodeNames(rows) }).toEqual({ name: c.name, names: c.barcodes.names ?? [] })
    }
  })
})

describe('what a batch makes, as the PC app plans it', () => {
  it(`${pc.plans.length} kinds of file: the rows that can be made, why not, their names, what they read as and the PDFs’ titles`, async () => {
    let problems = 0
    for (const p of pc.plans) {
      const kind = kindOf(p.design, p.format, p.barcode)
      const rows = p.barcode ? readBarcodeBatch(p.text) : readQrBatch(p.text)!.rows
      const items = (await planBatch(rows, kind, barcodeProblem))!
      const got = items.map((i) => ({ row: i.row.row, name: i.name, problem: i.problem, expected: i.expected, pdfTitle: pdfTitle(i, kind) }))
      expect({ design: p.design, format: p.format, barcode: p.barcode, items: got }).toEqual({ design: p.design, format: p.format, barcode: p.barcode, items: p.items })
      problems += items.filter((i) => i.problem !== null).length
    }
    // (some rows of every sort can't be made: too long for the level, the version, or the barcode)
    expect(problems).toBeGreaterThan(30)
  })

  it('a row’s design: its text, its caption and font when framed, and no logo in text', () => {
    for (const r of pc.rowDesigns) {
      const row: BatchRow = { row: 2, data: 'row text', frameText: r.row.frameText, fileName: '', font: r.row.font }
      const d = designFor(kindOf(r.design, r.format, null, r.frame), row)
      expect({ ...r, out: { data: d.data, logo: d.logo, frame: d.frame ? { text: d.frame.text, fontFamily: d.frame.fontFamily } : null } }).toEqual(r)
    }
  })

  it('caption fonts by name or as written, and the lists’ glimpses', () => {
    for (const f of pc.fonts) expect({ in: f.in, out: fontValue(f.in) }).toEqual(f)
    for (const g of pc.glimpses) expect({ in: g.in, out: glimpse(g.in) }).toEqual(g)
  })

  it('the examples and the guides', () => {
    expect(QR_EXAMPLE).toBe(pc.examples.qr)
    expect(CONTACTS_EXAMPLE).toBe(pc.examples.contacts)
    for (const [type, example] of Object.entries(pc.examples.barcodes)) expect(barcodeExample(TYPE[type])).toBe(example)
    // (the PC app's Make tab is the site's Create tab)
    expect(QR_GUIDE).toBe(pc.guides.qr.replace(/Make tab/g, 'Create tab'))
    expect(BARCODE_GUIDE).toBe(pc.guides.barcode.replace(/Make tab/g, 'Create tab'))
  })
})
