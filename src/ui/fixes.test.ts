import { describe, expect, it } from 'vitest'
import { colourWarnings, dataChecks, roundedDown, trackingNames, trimmedText } from '../qr/checks'
import { plainDesign } from '../qr/design'
import { DesignFileError, readDesign } from '../qr/design-file'
import { formattedFixed } from '../qr/numbers'
import { fitNumber } from './designer'
import { looksLikeSvgText } from './pictures'
import { typedTime } from './templates-ui'

describe('the contrast ratio, rounded down (the owner’s call, 2026-11-08)', () => {
  it('red on white reads 3.9:1, never 4:1', () => {
    expect(colourWarnings(['#ff0000', '#ff0000', '#ff0000'], '#ffffff', null, 4)[0]).toBe(
      'Low contrast (3.9:1) between the code and its background. Dark on light with at least 4:1 scans best.'
    )
  })
  it('keeps exact tenths, and drops the rest', () => {
    expect([2.3, 3.999, 3.95, 1.05, 1, 2.0999999].map(roundedDown)).toEqual([2.3, 3.9, 3.9, 1, 1, 2])
  })
})

describe('found in review: stage 3', () => {
  it('a date or time typed as the PC app reads it', () => {
    expect(typedTime('date', ' 2027-12-31 ')).toBe('2027-12-31')
    expect(typedTime('date', '2027-12-00')).toBe('')
    expect(typedTime('date', '2028-02-29')).toBe('2028-02-29')
    expect(typedTime('date', '2027-02-29')).toBe('')
    expect(typedTime('datetime', '2026-02-28 9:05')).toBe('2026-02-28T09:05')
    expect(typedTime('datetime', '2026-02-28T23:59')).toBe('2026-02-28T23:59')
    expect(typedTime('datetime', '2026-02-30 10:00')).toBe('')
    expect(typedTime('datetime', '2026-02-28 24:00')).toBe('')
  })

  it('a byte-order mark stays in a parameter’s name', () => {
    expect(trackingNames('https://b0r3d.org/?%EF%BB%BFutm_source=x').names).toEqual([])
  })

  it('long texts are checked quickly', () => {
    const started = performance.now()
    expect(dataChecks('https://' + 'a'.repeat(40000) + ' x')).toEqual([])
    expect(trimmedText('a' + ' '.repeat(40000) + 'b')).toBe('a' + ' '.repeat(40000) + 'b')
    expect(dataChecks('a' + ' '.repeat(40000) + 'b')).toEqual([])
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe("what counts as an SVG file (the PC app's rule)", () => {
  it.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"/>', true],
    ['  \n<svg>', true],
    [String.fromCharCode(0xfeff) + '<svg>', true],
    ['<?xml version="1.0"?><!-- made by hand --><svg>', true],
    ['<?xml version="1.0"?><?xml-stylesheet href="a.css"?><svg>', true],
    ['<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg>', true],
    ['<!DOCTYPE svg PUBLIC "x" "y" [ <!ENTITY ns_svg "http://www.w3.org/2000/svg"> ]><svg xmlns="&ns_svg;">', true],
    ['<!-- ' + 'x'.repeat(5000) + ' --><svg>', true],
    ['<x:svg xmlns:x="http://www.w3.org/2000/svg">', true],
    ['<svgfoo>', false],
    ['<html><svg>', false],
    ['GIF89a', false],
    ['<!-- never closed <svg>', false],
    ['', false]
  ])('%s', (text, looks) => {
    expect(looksLikeSvgText(text)).toBe(looks)
  })
})

describe("the number boxes keep numbers as the PC app's do", () => {
  const quiet = { min: 0, max: 20, step: 1, decimals: 1 }
  const size = { min: 50, max: 4000, step: 50, decimals: 0 }
  const space = { min: 0, max: 40, step: 0.5, decimals: 2 }
  it('rounds to their places, halves to even, then keeps them in range', () => {
    expect(fitNumber(4.25, quiet)).toBe(4.2)
    expect(fitNumber(4.35, quiet)).toBe(4.4)
    expect(fitNumber(25, quiet)).toBe(20)
    expect(fitNumber(250.5, size)).toBe(250)
    expect(fitNumber(251.5, size)).toBe(252)
    expect(fitNumber(9, size)).toBe(50)
    expect(fitNumber(1.255, space)).toBe(1.25)
    expect(fitNumber(100, space)).toBe(40)
  })

  it('shows the logo size as the PC app does', () => {
    expect(formattedFixed(0.4, 2)).toBe('0.40')
    expect(formattedFixed(0.145, 2)).toBe('0.15')
    expect(formattedFixed(0, 2)).toBe('0.00')
    expect(formattedFixed(1, 2)).toBe('1.00')
  })
})

describe('a logo that hides its scheme behind control characters is refused', () => {
  it.each([String.fromCharCode(1) + 'javascript:alert(1)', ' javascript:x', 'java\tscript:x', String.fromCharCode(0x1f) + 'file:///c:/x'])('%j', (logo) => {
    const file = JSON.stringify({ schemaVersion: 1, props: { image: logo }, style: { borderRadius: '0px' } })
    expect(() => readDesign(file, plainDesign(''))).toThrow(DesignFileError)
  })
})
