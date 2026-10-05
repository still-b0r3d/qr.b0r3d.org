/**
 * The barcode types offered besides QR, and what each accepts. This file is
 * part of the QR page (the type menu needs the list), so it stays small: the
 * encoder itself (zint, via zxing-wasm) loads only when a type is picked.
 */

export type BarcodeType =
  | 'datamatrix'
  | 'gs1-datamatrix'
  | 'aztec'
  | 'pdf417'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'code128'
  | 'gs1-128'
  | 'itf14'
  | 'code39'

export type CodeType = 'qr' | BarcodeType

export type BarcodeGroup = '2D codes' | 'Product barcodes' | 'Shipping and inventory'

export interface BarcodeFormat {
  id: BarcodeType
  label: string
  group: BarcodeGroup
  /** Format name for writing, as zxing-wasm names it. */
  writeFormat: string
  /** Format to accept when reading the result back. */
  readFormat: string
  /** 1D (bars) rather than 2D; only these can print their text underneath. */
  linear: boolean
  /** Data is GS1 element strings, written "(01)09506000134352(10)ABC". */
  gs1: boolean
  /** Shown under the data field. */
  hint: string
  /** Filled in when the type is first picked. */
  example: string
  /** Turns what was typed into what is encoded (e.g. drops spaces in numbers). */
  prepare: (text: string) => string
  /** A problem with the prepared input, worded for the person typing it. */
  check: (text: string) => string | null
  /** The text a scanner should read back for the prepared input. */
  expectedText: (text: string) => string
  /** Puts what a scanner read into the same form as expectedText. */
  normalizeRead?: (text: string) => string
}

/** GS1 mod-10 check digit for the digits before it (EAN, UPC, ITF-14, GTIN, SSCC, GLN). */
export function gs1CheckDigit(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i])
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  return (10 - (sum % 10)) % 10
}

const stripSeparators = (text: string) => text.replace(/[\s-]/g, '')

/** EAN-13, EAN-8, UPC-A and ITF-14: `length` digits, check digit optional. */
function numberFormat(
  base: Omit<BarcodeFormat, 'prepare' | 'check' | 'expectedText' | 'hint' | 'linear' | 'gs1'>,
  length: number
): BarcodeFormat {
  return {
    ...base,
    linear: true,
    gs1: false,
    hint: `${length} digits; the check digit is added for you. With it, ${length + 1}.`,
    prepare: stripSeparators,
    check: (text) => {
      if (!text) return `Enter ${length} digits.`
      if (!/^\d+$/.test(text)) return `${base.label} can only hold digits.`
      if (text.length !== length && text.length !== length + 1) {
        return `${base.label} needs ${length} digits (or ${length + 1} with the check digit); this has ${text.length}.`
      }
      if (text.length === length + 1) {
        const expected = gs1CheckDigit(text.slice(0, length))
        if (Number(text[length]) !== expected) {
          return `The check digit (the last digit) should be ${expected}. Leave it off and it's added for you.`
        }
      }
      return null
    },
    expectedText: (text) => (text.length === length ? text + gs1CheckDigit(text) : text)
  }
}

// GS1 Application Identifiers whose value ends in a mod-10 check digit, and
// the value's length: SSCC, GTIN, content GTIN and the GLNs.
const GS1_CHECKED_AIS: Record<string, number> = {
  '00': 18,
  '01': 14,
  '02': 14,
  '410': 13,
  '411': 13,
  '412': 13,
  '413': 13,
  '414': 13,
  '415': 13,
  '416': 13,
  '417': 13
}

/**
 * Problems zint doesn't report itself: the bracket syntax, and check digits
 * (zint checks each AI's length and characters, but not check digits).
 */
export function checkGs1(text: string): string | null {
  if (!text) return 'Enter GS1 data, e.g. (01)09506000134352(10)ABC123.'
  if (!/^(\(\d{2,4}\)[^()]+)+$/.test(text)) {
    return 'Write GS1 data as (AI)value pairs, e.g. (01)09506000134352(10)ABC123.'
  }
  for (const [, ai, value] of text.matchAll(/\((\d{2,4})\)([^()]+)/g)) {
    const length = GS1_CHECKED_AIS[ai]
    if (length && value.length === length && /^\d+$/.test(value)) {
      const expected = gs1CheckDigit(value.slice(0, -1))
      if (Number(value[length - 1]) !== expected) {
        return `The check digit of (${ai}) should be ${expected}, not ${value[length - 1]}.`
      }
    }
  }
  return null
}

const anyText = (label: string) => (text: string) =>
  text ? null : `Enter the text for the ${label}.`
const same = (text: string) => text

export const BARCODE_FORMATS: readonly BarcodeFormat[] = [
  {
    id: 'datamatrix',
    label: 'Data Matrix',
    group: '2D codes',
    writeFormat: 'DataMatrix',
    readFormat: 'DataMatrix',
    linear: false,
    gs1: false,
    hint: 'Any text. Small and sturdy; common on parts, labels and packaging.',
    example: 'https://b0r3d.org',
    prepare: same,
    check: anyText('Data Matrix'),
    expectedText: same
  },
  {
    id: 'gs1-datamatrix',
    label: 'GS1 DataMatrix',
    group: '2D codes',
    writeFormat: 'DataMatrix',
    readFormat: 'DataMatrix',
    linear: false,
    gs1: true,
    hint: 'GS1 data as (AI)value pairs: product number (01), expiry date (17, YYMMDD), batch (10), serial (21)…',
    example: '(01)09506000134352(17)271231(10)ABC123',
    prepare: (text) => text.replace(/\s/g, ''),
    check: checkGs1,
    expectedText: same
  },
  {
    id: 'aztec',
    label: 'Aztec',
    group: '2D codes',
    writeFormat: 'Aztec',
    readFormat: 'Aztec',
    linear: false,
    gs1: false,
    hint: 'Any text. Used on train and plane tickets; needs no blank border.',
    example: 'https://b0r3d.org',
    prepare: same,
    check: anyText('Aztec code'),
    expectedText: same
  },
  {
    id: 'pdf417',
    label: 'PDF417',
    group: '2D codes',
    writeFormat: 'PDF417',
    readFormat: 'PDF417',
    linear: false,
    gs1: false,
    hint: 'Any text. A wide, stacked code used on boarding passes, ID cards and shipping labels.',
    example: 'b0r3d PDF417 example',
    prepare: same,
    check: anyText('PDF417 code'),
    expectedText: same
  },
  numberFormat(
    {
      id: 'ean13',
      label: 'EAN-13',
      group: 'Product barcodes',
      writeFormat: 'EAN13',
      readFormat: 'EAN13',
      example: '950600013435'
    },
    12
  ),
  numberFormat(
    {
      id: 'ean8',
      label: 'EAN-8',
      group: 'Product barcodes',
      writeFormat: 'EAN8',
      readFormat: 'EAN8',
      example: '9638507'
    },
    7
  ),
  {
    ...numberFormat(
      {
        id: 'upca',
        label: 'UPC-A',
        group: 'Product barcodes',
        writeFormat: 'UPCA',
        readFormat: 'UPCA',
        example: '03600029145'
      },
      11
    ),
    // Scanners may report UPC-A in its 13-digit EAN form, with a leading 0.
    normalizeRead: (text) => (text.length === 13 && text.startsWith('0') ? text.slice(1) : text)
  },
  {
    id: 'code128',
    label: 'Code 128',
    group: 'Shipping and inventory',
    writeFormat: 'Code128',
    readFormat: 'Code128',
    linear: true,
    gs1: false,
    hint: 'Letters, digits and symbols. For IDs, tickets, asset tags and inventory.',
    example: 'B0R3D-128',
    prepare: same,
    check: (text) => {
      if (!text) return 'Enter the text for the barcode.'
      if ([...text].some((ch) => ch.codePointAt(0)! > 0xff)) {
        return 'Code 128 can only hold Latin letters, digits and symbols. Use Data Matrix or QR for other text.'
      }
      return null
    },
    expectedText: same
  },
  {
    id: 'gs1-128',
    label: 'GS1-128',
    group: 'Shipping and inventory',
    writeFormat: 'Code128',
    readFormat: 'Code128',
    linear: true,
    gs1: true,
    hint: 'GS1 data as (AI)value pairs, e.g. shipping container code (00), product (01), batch (10).',
    example: '(01)09506000134352(10)ABC123',
    prepare: (text) => text.replace(/\s/g, ''),
    check: checkGs1,
    expectedText: same
  },
  {
    ...numberFormat(
      {
        id: 'itf14',
        label: 'ITF-14',
        group: 'Shipping and inventory',
        writeFormat: 'ITF14',
        readFormat: 'ITF',
        example: '1950600013435'
      },
      13
    ),
    hint: '13 digits; the check digit is added for you. With it, 14. Used on outer cartons.'
  },
  {
    id: 'code39',
    label: 'Code 39',
    group: 'Shipping and inventory',
    writeFormat: 'Code39',
    readFormat: 'Code39',
    linear: true,
    gs1: false,
    hint: 'Capital letters, digits, spaces and - . $ / + %. Common on ID badges and older systems.',
    example: 'B0R3D-39',
    prepare: (text) => text.toUpperCase(),
    check: (text) => {
      if (!text) return 'Enter the text for the barcode.'
      if (!/^[0-9A-Z .$/+%-]+$/.test(text)) {
        return 'Code 39 can only hold capital letters, digits, spaces and - . $ / + %.'
      }
      return null
    },
    expectedText: same
  }
]

export const BARCODE_GROUPS: readonly BarcodeGroup[] = [
  '2D codes',
  'Product barcodes',
  'Shipping and inventory'
]

export function barcodeFormat(type: BarcodeType): BarcodeFormat {
  return BARCODE_FORMATS.find((f) => f.id === type)!
}

export function isCodeType(value: unknown): value is CodeType {
  return value === 'qr' || BARCODE_FORMATS.some((f) => f.id === value)
}

/**
 * The type a scanned code can be recreated as, from the format name the
 * scanner reports ("EAN13", "DataMatrix"…); QR for anything else.
 */
export function codeTypeForScannedFormat(format: string | undefined, text: string): CodeType {
  const gs1 = /^\(\d{2,4}\)/.test(text)
  switch (format) {
    case 'DataMatrix':
      return gs1 ? 'gs1-datamatrix' : 'datamatrix'
    case 'Aztec':
      return 'aztec'
    case 'PDF417':
      return 'pdf417'
    case 'EAN13':
      return 'ean13'
    case 'EAN8':
      return 'ean8'
    case 'UPCA':
      return 'upca'
    case 'Code128':
      return gs1 ? 'gs1-128' : 'code128'
    case 'ITF':
      return /^\d{14}$/.test(text) ? 'itf14' : 'qr'
    case 'Code39':
      return 'code39'
    default:
      return 'qr'
  }
}
