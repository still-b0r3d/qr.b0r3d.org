import { describe, expect, it } from 'vitest'
import type { FoundRead } from '../scan/protocol'
import { writeBarcode } from '../test/zint'
import { askFor } from './barcode-make'
import { defaultLook } from './barcode-svg'
import type { BarcodeType } from './barcodes'
import { cropOf, filesSummary, inReadingOrder, labelOf, madeAgainChecked, pictureSummary, problemLine, readAs, scannedCode, summaryOf } from './scanned'

// What the Scan tab says about a code, in b0r3d QR for PC's words (its Reader, FoundCode and
// MainWindow.Scan), from what zxing-wasm's reader gives.

const square: FoundRead['corners'] = [
  [10, 10],
  [50, 10],
  [50, 50],
  [10, 50]
]
const read = (format: string, text: string, more: Partial<FoundRead> = {}): FoundRead => ({ format, identifier: '', contentType: 'Text', text, eci: false, level: '', corners: square, ...more })

describe('a scanned barcode is read as the PC app reads it', () => {
  it('a UPC-A and a UPC-E as their own 12 and 8 digits; an EAN-13 that starts with 0 is a UPC-A', () => {
    expect(readAs('UPCA', '0036000291452')).toEqual({ format: 'UPCA', text: '036000291452' })
    expect(readAs('EAN13', '0036000291452')).toEqual({ format: 'UPCA', text: '036000291452' })
    expect(readAs('UPCE', '0012345000065')).toEqual({ format: 'UPCE', text: '01234565' })
    expect(readAs('EAN13', '9506000134352')).toEqual({ format: 'EAN13', text: '9506000134352' })
    expect(readAs('QRCode', '0036000291452')).toEqual({ format: 'QRCode', text: '0036000291452' })
  })
})

describe('each code’s card', () => {
  it('a QR code with a link: Open link… and Make this code again, with its error correction', () => {
    const c = scannedCode(read('QRCode', 'http://b0r3d.org', { identifier: ']Q1', level: 'M' }), 'photo.png', 100, 100)
    expect([c.kind, c.detail, c.format, c.isWebLink, c.canMakeAgain, c.barcode, c.level]).toEqual(['Link', 'b0r3d.org', 'QR code', true, true, null, 'M'])
    expect(summaryOf(c)).toBe('QR code · b0r3d.org · photo.png')
    expect(labelOf(c)).toBe('Link, b0r3d.org')
  })

  it('a GS1 QR code is named so and not made again (the Create tab makes no GS1 QR codes)', () => {
    const c = scannedCode(read('QRCode', '(01)09506000134352', { identifier: ']Q3', contentType: 'GS1' }), 'a.png', 100, 100)
    expect([c.format, c.canMakeAgain]).toEqual(['GS1 QR code', false])
    const eci = scannedCode(read('QRCode', 'hello', { identifier: ']Q2' }), 'a.png', 100, 100)
    expect([eci.format, eci.canMakeAgain]).toEqual(['QR code with an ECI marker', true])
  })

  it('barcodes made again as their own type, when the Create tab makes it and takes the text', () => {
    const made = (format: string, text: string, identifier = '') => {
      const c = scannedCode(read(format, text, { identifier }), 'a.png', 100, 100)
      return [c.kind, c.format, c.barcode, c.canMakeAgain]
    }
    expect(made('EAN13', '9506000134352', ']E0')).toEqual(['Product number', 'EAN-13', 'ean13', true])
    expect(made('EAN13', '9780306406157', ']E0')).toEqual(['Book number (ISBN)', 'EAN-13 (ISBN)', 'isbn', true])
    expect(made('EAN13', '0036000291452', ']E0')).toEqual(['Product number', 'UPC-A', 'upca', true])
    expect(made('DataMatrix', '(01)09506000134352(10)ABC', ']d2')).toEqual(['Text', 'GS1 DataMatrix', 'gs1-datamatrix', true])
    expect(made('Code128', '(01)09506000134352(10)ABC', ']C1')).toEqual(['Text', 'GS1-128', 'gs1-128', true])
    expect(made('Code128', 'B0R3D-128', ']C0')).toEqual(['Text', 'Code 128', 'code128', true])
    expect(made('ITF', '19506000134359', ']I1')).toEqual(['Text', 'ITF-14', 'itf14', true])
    // an ITF that isn't 14 digits, Codabar and Code 93: read, not made
    expect(made('ITF', '123456', ']I0')).toEqual(['Text', 'ITF', null, false])
    expect(made('Codabar', 'A123456A', ']F0')).toEqual(['Text', 'Codabar', null, false])
    expect(made('Code93', 'HELLO93', ']G0')).toEqual(['Text', 'Code 93', null, false])
    // (small letters are made as the capitals Code 39 holds)
    expect(made('Code39', 'abc', ']A0')).toEqual(['Text', 'Code 39', 'code39', true])
    expect(made('DataBarOmni', '(01)09506000134352', ']e0')).toEqual(['Product number', 'GS1 DataBar', null, false])
  })

  it('Make this code again only for a barcode zint makes too, as the PC app runs zint first', async () => {
    // GS1-128 data the type's own checks take (there's no check digit to check), but zint refuses
    const odd = scannedCode(read('Code128', '(00)123', { identifier: ']C1', contentType: 'GS1' }), 'a.png', 100, 100)
    const ean = scannedCode(read('EAN13', '9506000134352', { identifier: ']E0' }), 'a.png', 100, 100)
    const qr = scannedCode(read('QRCode', 'hello', { identifier: ']Q1' }), 'a.png', 100, 100)
    expect([odd.barcode, odd.canMakeAgain]).toEqual(['gs1-128', true])
    // zint itself, as the page's barcode maker has it
    const zint = async (type: BarcodeType, text: string): Promise<boolean> => {
      const asked = askFor(type, text, defaultLook())
      if ('error' in asked) return false
      const w = await writeBarcode(asked.ask.text, { format: asked.ask.format as never, options: asked.ask.options, scale: 1, addHRT: asked.ask.addHRT, addQuietZones: asked.ask.addQuietZones })
      return !w.error
    }
    const asked: string[] = []
    const checked = await madeAgainChecked([odd, ean, qr], async (type, text) => {
      asked.push(`${type} ${text}`)
      return zint(type, text)
    })
    expect(checked.map((c) => c.canMakeAgain)).toEqual([false, true, true])
    expect(asked).toEqual(['gs1-128 (00)123', 'ean13 9506000134352'])
    // zint couldn't be asked (it didn't load): the button stays
    expect((await madeAgainChecked([odd], async () => null)).map((c) => c.canMakeAgain)).toEqual([true])
  })

  it('where it was: a box round its corners with some room, as the PC app crops it', () => {
    expect(cropOf(square, 100, 100)).toEqual({ x: 30, y: 30, box: { x: 0, y: 0, width: 62, height: 62 } })
    // a barcode read along a line: opened up across it, kept in the picture
    const line: FoundRead['corners'] = [
      [20, 50],
      [180, 50],
      [180, 50],
      [20, 50]
    ]
    expect(cropOf(line, 200, 300)).toEqual({ x: 100, y: 50, box: { x: 0, y: 0, width: 200, height: 106 } })
    expect(cropOf([], 10, 10)).toEqual({ x: 0, y: 0, box: null })
  })

  it('reading order: rows from the top, then left to right', () => {
    const at = (x: number, y: number) => ({ x, y })
    // (rows 64 pixels high, by where each code's middle is: 30 is the first, 40 and 70 the second)
    expect(inReadingOrder([at(300, 40), at(10, 200), at(20, 30), at(5, 70)])).toEqual([at(20, 30), at(5, 70), at(300, 40), at(10, 200)])
  })

  it('a picture with no code in a batch', () => {
    const p = problemLine("Couldn't open", "it isn't a picture, or it's damaged", 'notes.png')
    expect([p.isProblem, p.text, summaryOf(p), labelOf(p)]).toEqual([true, '', "it isn't a picture, or it's damaged · notes.png", "Couldn't open, it isn't a picture, or it's damaged"])
  })
})

describe('the line that sums up a scan', () => {
  it('one picture file', () => {
    expect(filesSummary([{ name: 'a.png', codes: 1, problem: null }])).toBe('1 code in a.png')
    expect(filesSummary([{ name: 'a.png', codes: 3, problem: null }])).toBe('3 codes in a.png')
    expect(filesSummary([{ name: 'a.png', codes: 0, problem: null }])).toBe('No code in a.png. If the code is small in the picture, crop closer to it and try again.')
    expect(filesSummary([{ name: 'a.pdf', codes: 0, problem: "it's a PDF, so open it and take a screenshot of the code instead" }])).toBe(
      "Couldn't open a.pdf: it's a PDF, so open it and take a screenshot of the code instead."
    )
  })

  it('several pictures', () => {
    const files = [
      { name: 'a.png', codes: 2, problem: null },
      { name: 'b.png', codes: 0, problem: null },
      { name: 'c.png', codes: 0, problem: 'damaged' }
    ]
    expect(filesSummary(files)).toBe("2 codes in 1 of 3 pictures; no code in 1; 1 couldn't be opened.")
    expect(filesSummary(files.slice(0, 1).concat({ name: 'd.png', codes: 1, problem: null }))).toBe('3 codes in 2 of 2 pictures.')
  })

  it('a copied picture', () => {
    expect(pictureSummary('the copied picture', 1, null)).toBe('1 code in the copied picture')
    expect(pictureSummary('the copied picture', 0, null)).toBe('No code in the copied picture.')
    expect(pictureSummary('the copied picture', 0, "it isn't a picture, or it's damaged")).toBe("Couldn't read the copied picture (it isn't a picture, or it's damaged).")
  })
})
