import { describe, expect, it } from 'vitest'
import pcApp from '../test/pc-app-svgs.json'
import { QrArt, svgText } from './art'
import { infoLine, levelHint, warnings } from './checks'
import { plainDesign } from './design'
import { fileName, pictureSize, tooBig } from './export'
import { formatted, roundHalfAway, roundHalfEven, written } from './numbers'
import type { QrLevel } from './tables'

// SVG files and picture sizes the PC app (b0r3d QR 0.8, its code loaded by reflection, no window)
// made for these plain designs: the website must write the same files character for character.
interface PcCase {
  name: string
  data: string
  level: QrLevel
  margin: number
  width: number
  height: number
  pngWidth: number
  pngHeight: number
  svg: string
}

describe('the same files as the PC app', () => {
  it.each((pcApp as PcCase[]).map((c) => [c.name, c] as const))('%s', (_, c) => {
    const design = { ...plainDesign(c.data), level: c.level, margin: c.margin, width: c.width, height: c.height }
    const art = new QrArt(design)
    expect(art.toSvg()).toBe(c.svg)
    const size = pictureSize(art)
    expect([size.width, size.height]).toEqual([c.pngWidth, c.pngHeight])
  })
})

describe('numbers as the PC app writes them', () => {
  it('rounds halves to even for the SVG, and away from zero where it says so', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4999].map((x) => roundHalfEven(x) + 0)).toEqual([0, 2, 2, 0, -2, 2])
    expect([0.5, 1.5, 2.5, -0.5, -2.5].map(roundHalfAway)).toEqual([1, 2, 3, -1, -3])
    expect(written(6.0606060606, 3)).toBe('6.061')
    expect(written(-0.0001, 3)).toBe('0')
    expect(written(12.5, 4)).toBe('12.5')
    expect(written(Number.NaN, 4)).toBe('0')
  })

  it('writes numbers for people with halves going up, from 15 digits', () => {
    expect(formatted(0.125, 2)).toBe('0.13')
    expect(formatted(1.005, 2)).toBe('1.01')
    expect(formatted(1.5, 2)).toBe('1.5')
    expect(formatted(0, 2)).toBe('0')
    expect(formatted(2, 2)).toBe('2')
    expect(formatted(9.999, 2)).toBe('10')
    expect(formatted(0.0001, 2)).toBe('0')
    expect(formatted(12345.678, 2)).toBe('12345.68')
  })
})

describe('the words around the code', () => {
  it('says what the level means and suggests one', () => {
    expect(levelHint('Q', 'https://b0r3d.org')).toBe(
      'High (25%): about 25% of the code can be dirty, scratched or covered and it still scans. Higher levels make the code denser. Suggested for this much text: Highest (30%).'
    )
    expect(levelHint('L', 'x'.repeat(600))).toContain('Suggested for this much text.')
    expect(levelHint('M', '')).not.toContain('Suggested')
  })

  it('sums the code up', () => {
    expect(infoLine(new QrArt(plainDesign('https://b0r3d.org')))).toBe('17 characters · 17 bytes · version 2 · 25 × 25 modules · level Q')
    expect(infoLine(new QrArt(plainDesign('é')))).toBe('1 character · 2 bytes (UTF-8) · version 1 · 21 × 21 modules · level Q')
  })

  it('warns about a thin quiet zone only', () => {
    expect(warnings(4)).toEqual([])
    expect(warnings(0.125)).toEqual([
      'Only 0.13 modules of blank space around the code. Leave at least 4 (Quiet zone), or place it on a plain light area.'
    ])
  })
})

describe('saving', () => {
  it('makes a file name that every system takes', () => {
    expect(fileName('qr-code', 'png')).toBe('qr-code.png')
    expect(fileName('  my: code?  ', 'svg')).toBe('my code.svg')
    expect(fileName('menu.png', 'png')).toBe('menu.png')
    expect(fileName('...', 'png')).toBe('qr-code.png')
    expect(fileName('a/b\\c', 'svg')).toBe('abc.svg')
  })

  it('refuses a picture too big to draw', () => {
    expect(tooBig(4000, 4000)).toBeNull()
    expect(tooBig(20000, 20000)).toContain('20,000 × 20,000 pixels')
  })

  it("leaves out what XML can't hold", () => {
    expect(svgText('a<b>&c')).toBe('a&lt;b&gt;&amp;c')
    expect(svgText('x' + String.fromCharCode(1) + 'y' + String.fromCharCode(0xd800))).toBe('xy')
    expect(svgText('😀')).toBe('😀')
  })
})
