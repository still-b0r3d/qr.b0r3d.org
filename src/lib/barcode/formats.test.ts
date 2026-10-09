import { describe, expect, it } from 'vitest'
import {
  BARCODE_FORMATS,
  barcodeFormat,
  checkGs1,
  codeTypeForScannedFormat,
  gs1CheckDigit,
  isCodeType
} from './formats'

describe('gs1CheckDigit', () => {
  it('matches published GS1 examples', () => {
    expect(gs1CheckDigit('950600013435')).toBe(2) // EAN-13 9506000134352
    expect(gs1CheckDigit('400638133393')).toBe(1) // EAN-13 4006381333931
    expect(gs1CheckDigit('9638507')).toBe(4) // EAN-8 96385074
    expect(gs1CheckDigit('03600029145')).toBe(2) // UPC-A 036000291452
    expect(gs1CheckDigit('1540014128876')).toBe(3) // ITF-14 15400141288763
    expect(gs1CheckDigit('0950600013435')).toBe(2) // GTIN-14 09506000134352
  })
})

describe('number barcodes', () => {
  const ean13 = barcodeFormat('ean13')

  it('take the digits without or with the check digit', () => {
    expect(ean13.check('950600013435')).toBeNull()
    expect(ean13.check('9506000134352')).toBeNull()
    expect(ean13.expectedText('950600013435')).toBe('9506000134352')
    expect(ean13.expectedText('9506000134352')).toBe('9506000134352')
  })

  it('ignore spaces and hyphens people type', () => {
    expect(ean13.prepare('9 506000 134352')).toBe('9506000134352')
    expect(barcodeFormat('upca').prepare('0-36000-29145')).toBe('03600029145')
  })

  it('explain a wrong check digit, length or character', () => {
    expect(ean13.check('9506000134351')).toBe(
      "The check digit (the last digit) should be 2. Leave it off and it's added for you."
    )
    expect(ean13.check('95060001343')).toBe(
      'EAN-13 needs 12 digits (or 13 with the check digit); this has 11.'
    )
    expect(ean13.check('95060001343a')).toBe('EAN-13 can only hold digits.')
    expect(barcodeFormat('itf14').check('1540014128876')).toBeNull()
    expect(barcodeFormat('ean8').check('96385075')).toContain('should be 4')
  })

  it('read UPC-A back in either of its forms', () => {
    const upca = barcodeFormat('upca')
    expect(upca.normalizeRead!('0036000291452')).toBe('036000291452')
    expect(upca.normalizeRead!('036000291452')).toBe('036000291452')
  })

  it('validates and expands UPC-E', () => {
    const upce = barcodeFormat('upce')
    expect(upce.check('01234565')).toBeNull()
    expect(upce.check('123456')).toBeNull()
    expect(upce.check('0123456')).toBeNull()
    expect(upce.check('01234569')).toContain('should be 5')
    expect(upce.expectedText('0123456')).toBe('01234565')
    expect(upce.expectedText('123456')).toBe('01234565')
    expect(upce.normalizeRead!('0012345000065')).toBe('01234565')
  })

  it('validates ISBN-10 and ISBN-13', () => {
    const isbn = barcodeFormat('isbn')
    expect(isbn.check(isbn.prepare('0-306-40615-2'))).toBeNull()
    expect(isbn.check(isbn.prepare('978-0-306-40615-7'))).toBeNull()
    expect(isbn.check('0306406153')).toContain('should be 2')
    expect(isbn.check('9780306406158')).toContain('should be 7')
    expect(isbn.expectedText('0306406152')).toBe('9780306406157')
    expect(isbn.expectedText('9780306406157')).toBe('9780306406157')
  })

  it('gives the encoder whole ISBNs, check digit added', () => {
    const isbn = barcodeFormat('isbn')
    expect(isbn.encodeText!('030640615')).toBe('0306406152')
    expect(isbn.encodeText!('097522980')).toBe('097522980X')
    expect(isbn.encodeText!('978030640615')).toBe('9780306406157')
    expect(isbn.encodeText!('0306406152')).toBe('0306406152')
    expect(isbn.encodeText!('9780306406157')).toBe('9780306406157')
  })
})

describe('text barcodes', () => {
  it('Code 128 takes Latin-1 only', () => {
    const code128 = barcodeFormat('code128')
    expect(code128.check('Grüße 123')).toBeNull()
    expect(code128.check('日本')).toContain('Latin letters')
  })

  it('Code 39 capitalises and rejects what it cannot hold', () => {
    const code39 = barcodeFormat('code39')
    expect(code39.prepare('abc-123')).toBe('ABC-123')
    expect(code39.check('ABC-123')).toBeNull()
    expect(code39.check('A_B')).toContain('capital letters')
  })
})

describe('checkGs1', () => {
  it('accepts well-formed element strings', () => {
    expect(checkGs1('(01)09506000134352(17)271231(10)ABC123')).toBeNull()
    expect(checkGs1('(00)106141412345678908')).toBeNull()
    expect(checkGs1('(414)9506000000008(99)internal')).toBeNull()
  })

  it('catches wrong check digits, which the encoder lets through', () => {
    expect(checkGs1('(01)09506000134351')).toBe('The check digit of (01) should be 2, not 1.')
    expect(checkGs1('(00)106141412345678907')).toContain('should be 8')
  })

  it('asks for the bracket syntax', () => {
    expect(checkGs1('0109506000134352')).toContain('(AI)value pairs')
    expect(checkGs1('(01)')).toContain('(AI)value pairs')
    expect(checkGs1('')).toContain('Enter GS1 data')
  })
})

describe('every format', () => {
  it.each(BARCODE_FORMATS.map((f) => [f.id, f] as const))(
    '%s accepts its own example',
    (_, format) => {
      expect(format.check(format.prepare(format.example))).toBeNull()
    }
  )
})

describe('codeTypeForScannedFormat', () => {
  it('recreates scanned barcodes as the same type', () => {
    expect(codeTypeForScannedFormat('EAN13', '9506000134352')).toBe('ean13')
    expect(codeTypeForScannedFormat('Code128', '(01)09506000134352')).toBe('gs1-128')
    expect(codeTypeForScannedFormat('Code128', 'ABC')).toBe('code128')
    expect(codeTypeForScannedFormat('DataMatrix', 'hello')).toBe('datamatrix')
    expect(codeTypeForScannedFormat('ITF', '15400141288763')).toBe('itf14')
    expect(codeTypeForScannedFormat('ITF', '1234')).toBe('qr')
    expect(codeTypeForScannedFormat('QRCode', 'hi')).toBe('qr')
    expect(codeTypeForScannedFormat(undefined, 'hi')).toBe('qr')
  })

  it('knows its own types', () => {
    expect(isCodeType('qr')).toBe(true)
    expect(isCodeType('ean13')).toBe(true)
    expect(isCodeType('maxicode')).toBe(false)
  })
})
