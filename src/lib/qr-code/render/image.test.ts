import { describe, expect, it } from 'vitest'
import {
  computeImagePlacement,
  computeLogoFootprint,
  resolveEffectiveErrorCorrectionLevel
} from './image'
import { buildMatrix } from '../matrix'

describe('resolveEffectiveErrorCorrectionLevel', () => {
  it('leaves the level untouched when no image is set', () => {
    expect(resolveEffectiveErrorCorrectionLevel(false, 'L')).toBe('L')
    expect(resolveEffectiveErrorCorrectionLevel(false, 'M')).toBe('M')
  })

  it('boosts L and M up to Q when an image is set (#309: L/M have too little redundancy for a logo)', () => {
    expect(resolveEffectiveErrorCorrectionLevel(true, 'L')).toBe('Q')
    expect(resolveEffectiveErrorCorrectionLevel(true, 'M')).toBe('Q')
  })

  it('leaves Q and H untouched when an image is set — they already meet the floor', () => {
    expect(resolveEffectiveErrorCorrectionLevel(true, 'Q')).toBe('Q')
    expect(resolveEffectiveErrorCorrectionLevel(true, 'H')).toBe('H')
  })
})

describe('computeImagePlacement safety cap (#309)', () => {
  // Regression guard for a real generated-and-scanned failure: a short URL at
  // level Q with sizeRatio 0.7 hid enough of the matrix that a real QR
  // decoder (jsQR) could no longer read the exported PNG, even though the
  // pre-fix formula allowed sizeRatio up to 1.0.
  it('never hides more than 30% of the matrix width, regardless of sizeRatio', () => {
    const { count } = buildMatrix('https://a.co', 'Q')
    for (const sizeRatio of [0.4, 0.6, 0.8, 1.0]) {
      const placement = computeImagePlacement({
        image: { href: 'logo.png', sizeRatio },
        count,
        moduleSize: 1,
        offset: 0,
        totalSize: count,
        errorCorrectionLevel: 'Q'
      })
      const hiddenAxisDots = placement.size // moduleSize is 1, so size === axis dot count
      expect(hiddenAxisDots / count).toBeLessThanOrEqual(0.3)
    }
  })

  it('does not shrink the previous default (sizeRatio 0.4) footprint for typical data', () => {
    const { count } = buildMatrix('https://mercyhill.managedmissions.com/MyTrip/shanereichart', 'Q')
    const placement = computeImagePlacement({
      image: { href: 'logo.png', sizeRatio: 0.4 },
      count,
      moduleSize: 1,
      offset: 0,
      totalSize: count,
      errorCorrectionLevel: 'Q'
    })
    // Pre-fix this was 11/37 (~29.7%) — comfortably under the new 30% cap,
    // so the default experience is unaffected by the safety clamp.
    expect(placement.size).toBe(11)
  })
})

describe('space around the logo (padding)', () => {
  const place = (padding: number | undefined, data = 'https://a.co') => {
    const { count } = buildMatrix(data, 'Q')
    return {
      count,
      placement: computeImagePlacement({
        image: { href: 'logo.png', sizeRatio: 0.4, padding },
        count,
        moduleSize: 10,
        offset: 0,
        totalSize: count * 10,
        errorCorrectionLevel: 'Q'
      })
    }
  }
  const hiddenCells = (count: number, hidesCell: (r: number, c: number) => boolean) => {
    let n = 0
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (hidesCell(r, c)) n++
    return n
  }

  it('is measured in modules and taken from inside the cleared square', () => {
    const { placement } = place(1)
    // 'https://a.co' is version 2 (25 modules): a 7-module square, so the logo
    // gets 5 modules with 1 module blank on each side.
    expect(placement.size).toBe(70)
    expect(placement.margin).toBe(10)
  })

  it('never clears more modules than a logo without space does', () => {
    // Growing the cleared square by one module on each side made version 1-2
    // codes at level Q fail every test decode, so the space can't add to it.
    const without = place(0)
    for (const padding of [0.5, 1, 2, 10]) {
      const { count, placement } = place(padding)
      expect(placement.size).toBe(without.placement.size)
      expect(hiddenCells(count, placement.hidesCell)).toBe(
        hiddenCells(without.count, without.placement.hidesCell)
      )
    }
  })

  it('is capped so the logo keeps at least one module', () => {
    const { count } = buildMatrix('https://a.co', 'Q')
    expect(computeLogoFootprint(count, 'Q', 0.4, 10)).toEqual({
      clearModules: 7,
      padding: 3,
      logoModules: 1
    })
  })

  it('treats missing, negative and non-numeric values as no space', () => {
    for (const padding of [undefined, -2, Number.NaN, '' as unknown as number]) {
      expect(place(padding).placement.margin).toBe(0)
    }
  })

  it('allows half modules', () => {
    const { count } = buildMatrix('https://a.co', 'Q')
    expect(computeLogoFootprint(count, 'Q', 0.4, 0.5).logoModules).toBe(6)
  })
})
