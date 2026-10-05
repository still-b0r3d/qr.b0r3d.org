import { describe, expect, it } from 'vitest'
import { contrastRatio, getScanWarnings, parseCssColor } from './scanCheck'

describe('parseCssColor', () => {
  it('reads hex, rgb() and the names the app uses', () => {
    expect(parseCssColor('#000')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(parseCssColor('#FF00ff')).toEqual({ r: 255, g: 0, b: 255, a: 1 })
    expect(parseCssColor('#ffffff80')?.a).toBeCloseTo(0.5, 2)
    expect(parseCssColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(parseCssColor('rgba(10 20 30 / 50%)')?.a).toBe(0.5)
    expect(parseCssColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseCssColor('transparent')?.a).toBe(0)
  })

  it('returns null for anything else', () => {
    expect(parseCssColor('')).toBeNull()
    expect(parseCssColor(undefined)).toBeNull()
    expect(parseCssColor('rebeccapurple')).toBeNull()
    expect(parseCssColor('#12')).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('matches the WCAG extremes', () => {
    const black = parseCssColor('#000')!
    const white = parseCssColor('#fff')!
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5)
    expect(contrastRatio(white, white)).toBe(1)
  })
})

describe('getScanWarnings', () => {
  const plain = {
    colors: ['#000000', '#000000', '#000000'],
    background: '#ffffff',
    margin: 4,
    hasFrame: false
  }

  it('has nothing to say about black on white with a quiet zone', () => {
    expect(getScanWarnings(plain)).toEqual([])
  })

  it('flags light-on-dark codes', () => {
    const keys = getScanWarnings({ ...plain, colors: ['#ffffff'], background: '#131313' }).map(
      (w) => w.key
    )
    expect(keys).toContain('inverted')
  })

  it('flags low contrast with the weakest ratio', () => {
    const warnings = getScanWarnings({ ...plain, colors: ['#000000', '#bbbbbb'] })
    const low = warnings.find((w) => w.key === 'lowContrast')
    expect(low).toBeDefined()
    expect(low && 'ratio' in low ? low.ratio : 0).toBeLessThan(4)
  })

  it('accepts the built-in brand colours', () => {
    // b0r3d Cup and Rukus corner dots on white
    expect(getScanWarnings({ ...plain, colors: ['#131313', '#131313', '#c000c0'] })).toEqual([])
    expect(getScanWarnings({ ...plain, colors: ['#2b2b2b', '#2b2b2b', '#c0396b'] })).toEqual([])
  })

  it('flags a quiet zone under 4 modules, but not inside a frame', () => {
    expect(getScanWarnings({ ...plain, margin: 1 })).toEqual([{ key: 'quietZone', modules: 1 }])
    expect(
      getScanWarnings({ ...plain, margin: 1, hasFrame: true, frameBackground: '#fff' })
    ).toEqual([])
  })

  it('notes a transparent background, and uses the frame colour when there is one', () => {
    expect(getScanWarnings({ ...plain, background: 'transparent' }).map((w) => w.key)).toEqual([
      'transparent'
    ])
    const onDarkFrame = getScanWarnings({
      ...plain,
      background: 'transparent',
      hasFrame: true,
      frameBackground: '#000000'
    }).map((w) => w.key)
    expect(onDarkFrame).not.toContain('transparent')
    expect(onDarkFrame).toContain('lowContrast')
  })
})
