import { describe, expect, it } from 'vitest'
import {
  cleanZintSvg,
  friendlyEncoderError,
  setBarHeight,
  styleBarcodeSvg,
  svgDataUrl,
  type BarcodeSvg
} from './svg'

// Trimmed from zint's actual output for an EAN-13.
const ZINT_SVG = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="113" height="59" version="1.1" xmlns="http://www.w3.org/2000/svg">
 <desc>Zint Generated Symbol</desc>
 <g id="barcode" fill="#000000">
  <rect x="0" y="0" width="113" height="59" fill="#FFFFFF"/>
  <path d="M11 0h1v55h-1ZM13 0h1v55h-1Z"/>
  <text x="6.1" y="58.6" text-anchor="end" font-family="OCRB, monospace" font-size="10">
   9
  </text>
 </g>
</svg>
`

describe('cleanZintSvg', () => {
  it('keeps the drawing, drops the prolog and description, and reads the size', () => {
    const clean = cleanZintSvg(ZINT_SVG)
    expect(clean.width).toBe(113)
    expect(clean.height).toBe(59)
    expect(clean.svg.startsWith('<svg')).toBe(true)
    expect(clean.svg).not.toContain('<desc>')
    expect(clean.svg).not.toContain('DOCTYPE')
    expect(clean.svg).toContain('<path d="M11 0h1v55h-1Z')
  })

  it('refuses output that is not an SVG', () => {
    expect(() => cleanZintSvg('nope')).toThrow()
  })
})

describe('styleBarcodeSvg', () => {
  const clean = cleanZintSvg(ZINT_SVG)

  it('sizes it in whole pixels per module and keeps a module viewBox', () => {
    const svg = styleBarcodeSvg(clean, { color: '#000000', background: '#ffffff', scale: 3 })
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 113 59" width="339" height="177"/
    )
    expect(svg).toContain('shape-rendering="crispEdges"')
  })

  it('applies the colours', () => {
    const svg = styleBarcodeSvg(clean, { color: '#1a2b3c', background: '#fafafa', scale: 1 })
    expect(svg).toContain('<g id="barcode" fill="#1a2b3c">')
    expect(svg).toContain('<rect x="0" y="0" width="113" height="59" fill="#fafafa"/>')
  })

  it('leaves the background out when transparent', () => {
    const svg = styleBarcodeSvg(clean, { color: '#000000', background: 'transparent', scale: 1 })
    expect(svg).not.toContain('<rect')
    expect(svg).toContain('<path')
  })

  it('escapes colour values', () => {
    const svg = styleBarcodeSvg(clean, { color: '"><script>', background: '#fff', scale: 1 })
    expect(svg).not.toContain('<script>')
  })
})

describe('svgDataUrl', () => {
  it('encodes the SVG for an <img>', () => {
    expect(svgDataUrl('<svg a="#"/>')).toBe(
      'data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%22%23%22%2F%3E'
    )
  })
})

describe('friendlyEncoderError', () => {
  it('drops the error number and return value', () => {
    expect(
      friendlyEncoderError("Error 275: Invalid check digit '2', expecting '1' (retval: 7)")
    ).toBe("Invalid check digit '2', expecting '1'")
    expect(
      friendlyEncoderError('Error 719: input length 3200 too long (maximum 3116) (retval: 5)')
    ).toBe('Input length 3200 too long (maximum 3116)')
  })
})

describe('setBarHeight', () => {
  // As zint draws them at the default 50 modules (trimmed).
  const itf14: BarcodeSvg = {
    width: 165,
    height: 69,
    svg:
      '<svg width="165" height="69"><g><rect x="0" y="0" width="165" height="69" fill="#FFFFFF"/>' +
      '<path d="M15 5h1v50h-1ZM19 5h3v50h-3ZM0 0h165v5h-165ZM0 55h165v5h-165ZM0 5h5v50h-5ZM160 5h5v50h-5Z"/>' +
      '<text x="82.5" y="66.6">19506000134359</text></g></svg>'
  }
  const ean13: BarcodeSvg = {
    width: 113,
    height: 59,
    svg:
      '<svg width="113" height="59"><g><rect x="0" y="0" width="113" height="59" fill="#FFFFFF"/>' +
      '<path d="M11 0h1v55h-1ZM15 0h2v50h-2ZM19 0h1v50h-1ZM24 0h3v50h-3Z"/>' +
      '<text x="6.1" y="58.6">9</text></g></svg>'
  }
  const path = (b: BarcodeSvg) => /<path d="([^"]+)"/.exec(b.svg)![1]

  it('lengthens the bars, moves the bottom bearer and text, keeps the top bearer', () => {
    const tall = setBarHeight(itf14, 80)
    expect(tall.height).toBe(99)
    expect(tall.svg).toContain('<svg width="165" height="99">')
    expect(tall.svg).toContain('height="99" fill="#FFFFFF"')
    expect(path(tall)).toBe(
      'M15 5h1v80h-1ZM19 5h3v80h-3ZM0 0h165v5h-165ZM0 85h165v5h-165ZM0 5h5v80h-5ZM160 5h5v80h-5Z'
    )
    expect(tall.svg).toContain('y="96.6"')
  })

  it('keeps EAN guard bars their few modules longer', () => {
    const short = setBarHeight(ean13, 20)
    expect(short.height).toBe(29)
    expect(path(short)).toBe('M11 0h1v25h-1ZM15 0h2v20h-2ZM19 0h1v20h-1ZM24 0h3v20h-3Z')
    expect(short.svg).toContain('y="28.6"')
  })

  it('leaves the default height, and drawings it does not understand, alone', () => {
    expect(setBarHeight(ean13, 50)).toBe(ean13)
    const curved = { ...ean13, svg: ean13.svg.replace('M11 0h1v55h-1Z', 'M11 0c1 1 2 2 3 3Z') }
    expect(setBarHeight(curved, 80)).toBe(curved)
  })
})
