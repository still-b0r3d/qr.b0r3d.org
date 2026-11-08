// The barcode types made besides QR codes, as b0r3d QR for PC describes them: each one's name and
// group in the Code type list, the hint under its data and the example it starts with, how it tidies
// what's typed, its checks in its words, and what a scanner should read back.

export type BarcodeType =
  | 'datamatrix'
  | 'gs1-datamatrix'
  | 'aztec'
  | 'pdf417'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'upce'
  | 'isbn'
  | 'code128'
  | 'gs1-128'
  | 'itf14'
  | 'code39'

export interface BarcodeFormat {
  /** as the site's files and Recent codes name it */
  readonly id: BarcodeType
  readonly label: string
  readonly group: string
  readonly hint: string
  readonly example: string
  /** bars, which can have their text underneath */
  readonly linear: boolean
  /** GS1 data, written (01)09506000134352(10)ABC */
  readonly gs1: boolean
  /** its margins are part of it (ITF-14's box) */
  readonly keepsQuietZones: boolean
  /** the reader's name for it (zxing-wasm) */
  readonly readFormat: string
  /** the writer's name for it (zxing-wasm, which makes it with zint) */
  readonly writeFormat: string
  prepare(text: string): string
  /** what's wrong with the tidied text, or null */
  check(text: string): string | null
  /** what a scanner should read */
  expectedText(text: string): string
  /** what a scanner read, in the form this type is typed */
  normalizeRead(text: string): string
  /** what zint is given, when it isn't the tidied text */
  encodeText?(text: string): string
}

export const BARCODE_GROUPS = ['2D codes', 'Product barcodes', 'Shipping and inventory'] as const

/** The GS1 check digit for the digits before it (EAN, UPC, ITF-14, GTIN, SSCC, GLN). */
export function checkDigit(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  return (10 - (sum % 10)) % 10
}

/** UPC-E (6 digits, or 7 or 8 with the number system first) as the UPC-A body it stands for, without its check digit. */
export function upcEToUpcA(upce: string): string {
  const s = upce.length >= 7 ? upce.slice(0, 1) : '0'
  const body = upce.length >= 7 ? upce.slice(1, 7) : upce.slice(0, 6)
  const d6 = body[5]
  if (d6 === '0' || d6 === '1' || d6 === '2') return s + body.slice(0, 2) + d6 + '0000' + body.slice(2, 5)
  if (d6 === '3') return s + body.slice(0, 3) + '00000' + body.slice(3, 5)
  if (d6 === '4') return s + body.slice(0, 4) + '00000' + body[4]
  return s + body.slice(0, 5) + '0000' + d6
}

export const upcECheckDigit = (upce: string): number => checkDigit(upcEToUpcA(upce))

/** A 12- or 13-digit UPC-A back to 8-digit UPC-E when it can be, or null. */
export function upcAToUpcE(upca: string): string | null {
  if (upca.length === 13 && upca[0] === '0') upca = upca.slice(1)
  if (upca.length !== 12) return null
  const s = upca[0]
  if (s !== '0' && s !== '1') return null
  const d = upca.slice(1, 11)
  const check = upca[11]
  let e: string
  if ((d[2] === '0' || d[2] === '1' || d[2] === '2') && d.slice(3, 7) === '0000') e = d.slice(0, 2) + d.slice(7, 10) + d[2]
  else if (d.slice(3, 8) === '00000') e = d.slice(0, 3) + d.slice(8, 10) + '3'
  else if (d.slice(4, 9) === '00000') e = d.slice(0, 4) + d[9] + '4'
  else if (d.slice(5, 9) === '0000' && d[9] >= '5') e = d.slice(0, 5) + d[9]
  else return null
  return s + e + check
}

/** The ISBN-10 check character ('0' to '9' or 'X') for 9 digits. */
export function isbn10CheckDigit(body9: string): string {
  let sum = 0
  for (let i = 0; i < 9; i++) sum += (body9.charCodeAt(i) - 48) * (10 - i)
  const rest = (11 - (sum % 11)) % 11
  return rest === 10 ? 'X' : String(rest)
}

/** The AIs whose value ends in a check digit, and the value's length: SSCC, GTIN, content GTIN and the GLNs. */
function gs1CheckedLength(ai: string): number {
  if (ai === '00') return 18
  if (ai === '01' || ai === '02') return 14
  if (/^41[0-7]$/.test(ai)) return 13
  return 0
}

/** What zint doesn't report itself: the bracket syntax and check digits. */
export function checkGs1(text: string): string | null {
  if (text.length === 0) return 'Enter GS1 data, e.g. (01)09506000134352(10)ABC123.'
  if (!/^(\([0-9]{2,4}\)[^()]+)+$/.test(text)) return 'Write GS1 data as (AI)value pairs, e.g. (01)09506000134352(10)ABC123.'
  for (const m of text.matchAll(/\(([0-9]{2,4})\)([^()]+)/g)) {
    const [, ai, value] = m
    const length = gs1CheckedLength(ai)
    if (length > 0 && value.length === length && /^[0-9]+$/.test(value)) {
      const expected = checkDigit(value.slice(0, length - 1))
      if (value.charCodeAt(length - 1) - 48 !== expected) return `The check digit of (${ai}) should be ${expected}, not ${value[length - 1]}.`
    }
  }
  return null
}

/** spaces and hyphens out of numbers */
const stripSeparators = (text: string): string => text.replace(/\s/g, '').replace(/-/g, '')
const stripSpaces = (text: string): string => text.replace(/\s/g, '')
const allDigits = (text: string): boolean => /^[0-9]+$/.test(text)
const same = (text: string): string => text
const anyText =
  (label: string) =>
  (text: string): string | null =>
    text.length > 0 ? null : `Enter the text for the ${label}.`

/** EAN-13, EAN-8, UPC-A and ITF-14: `length` digits, the check digit optional. */
function numberFormat(id: BarcodeType, label: string, group: string, example: string, readFormat: string, writeFormat: string, length: number): BarcodeFormat {
  return {
    id,
    label,
    group,
    example,
    readFormat,
    writeFormat,
    linear: true,
    gs1: false,
    keepsQuietZones: false,
    hint: `${length} digits; the check digit is added for you. With it, ${length + 1}.`,
    prepare: stripSeparators,
    check: (text) => {
      if (text.length === 0) return `Enter ${length} digits.`
      if (!allDigits(text)) return `${label} can only hold digits.`
      if (text.length !== length && text.length !== length + 1) return `${label} needs ${length} digits (or ${length + 1} with the check digit); this has ${text.length}.`
      if (text.length === length + 1) {
        const expected = checkDigit(text.slice(0, length))
        if (text.charCodeAt(length) - 48 !== expected) return `The check digit (the last digit) should be ${expected}. Leave it off and it's added for you.`
      }
      return null
    },
    expectedText: (text) => (text.length === length ? text + checkDigit(text) : text),
    normalizeRead: same
  }
}

const upca: BarcodeFormat = {
  ...numberFormat('upca', 'UPC-A', 'Product barcodes', '03600029145', 'UPCA', 'UPCA', 11),
  // scanners may give a UPC-A in its 13-digit EAN form, with a leading 0
  normalizeRead: (text) => (text.length === 13 && text[0] === '0' ? text.slice(1) : text)
}

const itf14: BarcodeFormat = {
  ...numberFormat('itf14', 'ITF-14', 'Shipping and inventory', '1950600013435', 'ITF', 'ITF14', 13),
  hint: '13 digits; the check digit is added for you. With it, 14. Used on outer cartons.',
  keepsQuietZones: true // its quiet zones sit inside the bearer box; without them it doesn't scan
}

/** The types, in the Code type list's order. */
export const BARCODE_FORMATS: readonly BarcodeFormat[] = [
  {
    id: 'datamatrix',
    label: 'Data Matrix',
    group: '2D codes',
    readFormat: 'DataMatrix',
    writeFormat: 'DataMatrix',
    linear: false,
    gs1: false,
    keepsQuietZones: false,
    hint: 'Any text. Small and sturdy; common on parts, labels and packaging.',
    example: 'https://b0r3d.org',
    prepare: same,
    check: anyText('Data Matrix'),
    expectedText: same,
    normalizeRead: same
  },
  {
    id: 'gs1-datamatrix',
    label: 'GS1 DataMatrix',
    group: '2D codes',
    readFormat: 'DataMatrix',
    writeFormat: 'DataMatrix',
    linear: false,
    gs1: true,
    keepsQuietZones: false,
    hint: 'GS1 data as (AI)value pairs: product number (01), expiry date (17, YYMMDD), batch (10), serial (21)…',
    example: '(01)09506000134352(17)271231(10)ABC123',
    prepare: stripSpaces,
    check: checkGs1,
    expectedText: same,
    normalizeRead: same
  },
  {
    id: 'aztec',
    label: 'Aztec',
    group: '2D codes',
    readFormat: 'Aztec',
    writeFormat: 'Aztec',
    linear: false,
    gs1: false,
    keepsQuietZones: false,
    hint: 'Any text. Used on train and plane tickets; needs no blank border.',
    example: 'https://b0r3d.org',
    prepare: same,
    check: anyText('Aztec code'),
    expectedText: same,
    normalizeRead: same
  },
  {
    id: 'pdf417',
    label: 'PDF417',
    group: '2D codes',
    readFormat: 'PDF417',
    writeFormat: 'PDF417',
    linear: false,
    gs1: false,
    keepsQuietZones: false,
    hint: 'Any text. A wide, stacked code used on boarding passes, ID cards and shipping labels.',
    example: 'b0r3d PDF417 example',
    prepare: same,
    check: anyText('PDF417 code'),
    expectedText: same,
    normalizeRead: same
  },
  numberFormat('ean13', 'EAN-13', 'Product barcodes', '950600013435', 'EAN13', 'EAN13', 12),
  numberFormat('ean8', 'EAN-8', 'Product barcodes', '9638507', 'EAN8', 'EAN8', 7),
  upca,
  {
    id: 'upce',
    label: 'UPC-E',
    group: 'Product barcodes',
    readFormat: 'UPCE',
    writeFormat: 'UPCE',
    linear: true,
    gs1: false,
    keepsQuietZones: false,
    hint: '6 digits (or 7 with number system 0/1; 8 with check digit). Compact barcode for small packages.',
    example: '01234565',
    prepare: stripSeparators,
    check: (text) => {
      if (text.length === 0) return 'Enter 6, 7 or 8 digits.'
      if (!allDigits(text)) return 'UPC-E can only hold digits.'
      if (text.length !== 6 && text.length !== 7 && text.length !== 8) return `UPC-E needs 6 digits (or 7 with system digit, 8 with check digit); this has ${text.length}.`
      if (text.length >= 7 && text[0] !== '0' && text[0] !== '1') return 'The first digit (number system) must be 0 or 1.'
      if (text.length === 8) {
        const expected = upcECheckDigit(text.slice(0, 7))
        if (text.charCodeAt(7) - 48 !== expected) return `The check digit (the last digit) should be ${expected}. Leave it off and it's added for you.`
      }
      return null
    },
    expectedText: (text) => {
      const s = text.length >= 7 ? text.slice(0, 1) : '0'
      const body = text.length >= 7 ? text.slice(1, 7) : text.slice(0, 6)
      const check = text.length === 8 ? text.slice(7, 8) : String(upcECheckDigit(s + body))
      return s + body + check
    },
    normalizeRead: (text) => upcAToUpcE(text) ?? text
  },
  {
    id: 'isbn',
    label: 'ISBN',
    group: 'Product barcodes',
    readFormat: 'EAN13',
    writeFormat: 'ISBN',
    linear: true,
    gs1: false,
    keepsQuietZones: false,
    hint: "An ISBN-10 or ISBN-13; hyphens are fine. Leave off the check digit and it's added; type it and it's checked.",
    example: '978-0-306-40615-7',
    prepare: (text) => stripSeparators(text).toUpperCase(),
    check: (text) => {
      if (text.length === 0) return 'Enter a 10- or 13-digit ISBN.'
      if (!/^[0-9X]+$/.test(text)) return 'ISBN can only hold digits (and X for ISBN-10 check digit).'
      if (text.length === 9 || text.length === 10) {
        if (!/^[0-9]{9}[0-9X]?$/.test(text)) return 'ISBN-10 can only have an X as its final check character.'
        if (text.length === 10) {
          const expected = isbn10CheckDigit(text.slice(0, 9))
          if (text.slice(9, 10) !== expected) return `The check digit (the last character) should be ${expected}. Leave it off and it's added for you.`
        }
        return null
      }
      if (text.length === 12 || text.length === 13) {
        if (!allDigits(text)) return 'ISBN-13 can only hold digits.'
        if (!text.startsWith('978') && !text.startsWith('979')) return 'ISBN-13 must start with 978 or 979.'
        if (text.length === 13) {
          const expected = checkDigit(text.slice(0, 12))
          if (text.charCodeAt(12) - 48 !== expected) return `The check digit (the last digit) should be ${expected}. Leave it off and it's added for you.`
        }
        return null
      }
      return `ISBN needs 10 digits (ISBN-10) or 13 digits (ISBN-13); this has ${text.length}.`
    },
    expectedText: (text) => {
      if (text.length === 9 || text.length === 10) {
        const ean12 = '978' + text.slice(0, 9)
        return ean12 + checkDigit(ean12)
      }
      return text.length === 12 ? text + checkDigit(text) : text
    },
    normalizeRead: same,
    // zint takes only whole ISBNs (and reads 9 digits as an old SBN)
    encodeText: (text) => (text.length === 9 ? text + isbn10CheckDigit(text) : text.length === 12 ? text + checkDigit(text) : text)
  },
  {
    id: 'code128',
    label: 'Code 128',
    group: 'Shipping and inventory',
    readFormat: 'Code128',
    writeFormat: 'Code128',
    linear: true,
    gs1: false,
    keepsQuietZones: false,
    hint: 'Letters, digits and symbols. For IDs, tickets, asset tags and inventory.',
    example: 'B0R3D-128',
    prepare: same,
    check: (text) => {
      if (text.length === 0) return 'Enter the text for the barcode.'
      for (let i = 0; i < text.length; i++)
        if (text.charCodeAt(i) > 0xff) return 'Code 128 can only hold Latin letters, digits and symbols. Use Data Matrix or QR for other text.'
      return null
    },
    expectedText: same,
    normalizeRead: same
  },
  {
    id: 'gs1-128',
    label: 'GS1-128',
    group: 'Shipping and inventory',
    readFormat: 'Code128',
    writeFormat: 'Code128',
    linear: true,
    gs1: true,
    keepsQuietZones: false,
    hint: 'GS1 data as (AI)value pairs, e.g. shipping container code (00), product (01), batch (10).',
    example: '(01)09506000134352(10)ABC123',
    prepare: stripSpaces,
    check: checkGs1,
    expectedText: same,
    normalizeRead: same
  },
  itf14,
  {
    id: 'code39',
    label: 'Code 39',
    group: 'Shipping and inventory',
    readFormat: 'Code39',
    writeFormat: 'Code39',
    linear: true,
    gs1: false,
    keepsQuietZones: false,
    hint: 'Capital letters, digits, spaces and - . $ / + %. Common on ID badges and older systems.',
    example: 'B0R3D-39',
    prepare: (text) => text.toUpperCase(), // ß and the ligatures become capitals it can hold (SS, FI...)
    check: (text) => {
      if (text.length === 0) return 'Enter the text for the barcode.'
      if (!/^[0-9A-Z .$/+%-]+$/.test(text)) return 'Code 39 can only hold capital letters, digits, spaces and - . $ / + %.'
      return null
    },
    expectedText: same,
    normalizeRead: same
  }
]

export function barcodeFormat(id: BarcodeType): BarcodeFormat {
  return BARCODE_FORMATS.find((f) => f.id === id)!
}

export const isBarcodeType = (id: unknown): id is BarcodeType => typeof id === 'string' && BARCODE_FORMATS.some((f) => f.id === id)

/**
 * The types a scanned barcode could be made again as, the likeliest first, from what the reader
 * called it (zxing-wasm's names) and read (`gs1` when the reader said the data is GS1's).
 */
export function forScanned(format: string, text: string, gs1: boolean): BarcodeType[] {
  switch (format) {
    case 'DataMatrix':
      return [gs1 ? 'gs1-datamatrix' : 'datamatrix']
    case 'Aztec':
      return ['aztec']
    case 'PDF417':
      return ['pdf417']
    case 'EAN13':
      // a book's number as its ISBN, else as the EAN-13 it also is
      return /^97[89][0-9]{10}$/.test(text) ? ['isbn', 'ean13'] : ['ean13']
    case 'EAN8':
      return ['ean8']
    case 'UPCA':
      return ['upca']
    case 'UPCE':
      return ['upce']
    case 'Code128':
      return [gs1 ? 'gs1-128' : 'code128']
    case 'ITF':
      return /^[0-9]{14}$/.test(text) ? ['itf14'] : []
    case 'Code39':
      return ['code39']
    default:
      return []
  }
}
