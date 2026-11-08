import { describe, expect, it } from 'vitest'
import { plainDesign } from '../qr/design'
import { DesignFileError, readDesign } from '../qr/design-file'
import { formattedFixed } from '../qr/numbers'
import { fitNumber } from './designer'
import { looksLikeSvgText } from './pictures'

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
