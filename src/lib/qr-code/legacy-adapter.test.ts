import { describe, expect, it } from 'vitest'
import { fromLegacyOptions } from './legacy-adapter'
import { allQrCodePresets } from '@/utils/qrCodePresets'

describe('fromLegacyOptions', () => {
  it('returns a valid config for the minimal default options', () => {
    const out = fromLegacyOptions({ data: 'hi' })
    expect(out.data).toBe('hi')
  })

  it('maps dotsOptions.type identity-mapped to dots.shape', () => {
    const out = fromLegacyOptions({
      data: 'x',
      dotsOptions: { type: 'extra-rounded', color: '#abc' }
    })
    expect(out.dots?.shape).toBe('extra-rounded')
    expect(out.dots?.color).toBe('#abc')
  })

  it('clamps cornersSquare types outside the supported set to extra-rounded', () => {
    const out = fromLegacyOptions({
      data: 'x',
      cornersSquareOptions: { type: 'classy' }
    })
    expect(out.cornerSquares?.shape).toBe('extra-rounded')
  })

  it('clamps cornersDot types outside the supported set to square', () => {
    const out = fromLegacyOptions({
      data: 'x',
      cornersDotOptions: { type: 'classy' }
    })
    expect(out.cornerDots?.shape).toBe('square')
  })

  it('passes through rounded cornersSquare and cornersDot types', () => {
    const out = fromLegacyOptions({
      data: 'x',
      cornersSquareOptions: { type: 'rounded' },
      cornersDotOptions: { type: 'rounded' }
    })
    expect(out.cornerSquares?.shape).toBe('rounded')
    expect(out.cornerDots?.shape).toBe('rounded')
  })

  it('uses min(width,height) for size and warns on non-square', () => {
    let warned = ''
    const original = console.warn
    console.warn = (msg: string) => {
      warned = msg
    }
    try {
      const out = fromLegacyOptions({ data: 'x', width: 320, height: 200 })
      expect(out.size).toBe(200)
      expect(warned).toMatch(/non-square/)
    } finally {
      console.warn = original
    }
  })

  it('defaults imageOptions.imageSize to 0.4 to match qr-code-styling', () => {
    const out = fromLegacyOptions({ data: 'x', image: 'https://example.com/logo.png' })
    expect(out.image?.sizeRatio).toBe(0.4)
  })

  it('forwards imageOptions.imageSize to image.sizeRatio', () => {
    const out = fromLegacyOptions({
      data: 'x',
      image: 'https://example.com/logo.png',
      imageOptions: { imageSize: 0.7 }
    })
    expect(out.image?.sizeRatio).toBe(0.7)
  })

  it('forwards imageOptions.padding and ignores the px margin of older configs', () => {
    const out = fromLegacyOptions({
      data: 'x',
      image: 'https://example.com/logo.png',
      imageOptions: { padding: 1.5, margin: 8 }
    })
    expect(out.image?.padding).toBe(1.5)
    expect(out.image).not.toHaveProperty('margin')
  })

  it('forwards hideBackgroundDots default of true', () => {
    const out = fromLegacyOptions({ data: 'x', image: 'https://example.com/logo.png' })
    expect(out.image?.hideBackgroundDots).toBe(true)
  })

  describe('preset round-trip', () => {
    for (const preset of allQrCodePresets) {
      it(`maps preset ${preset.name} to a config with data`, () => {
        const out = fromLegacyOptions(preset)
        expect(out.data).toBeDefined()
        expect(out.dots?.shape).toBeDefined()
        expect(out.cornerSquares?.shape).toBeDefined()
        expect(out.cornerDots?.shape).toBeDefined()
      })
    }
  })

  it('maps qrOptions.typeNumber to version', () => {
    expect(fromLegacyOptions({ data: 'x', qrOptions: { typeNumber: 12 } }).version).toBe(12)
    expect(
      fromLegacyOptions({ data: 'x', qrOptions: { errorCorrectionLevel: 'Q' } }).version
    ).toBeUndefined()
  })
})
