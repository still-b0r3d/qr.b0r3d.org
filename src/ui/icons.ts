// Small line icons, drawn here (no icon font or files from elsewhere). They take the text colour.

const SVG = 'http://www.w3.org/2000/svg'

function icon(className: string, ...shapes: [string, Record<string, string>][]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'icon ' + className)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const [tag, attrs] of shapes) {
    const el = document.createElementNS(SVG, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    svg.append(el)
  }
  return svg
}

export function sunIcon(): SVGSVGElement {
  const rays: [string, Record<string, string>][] = []
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const p = (r: number) => [12 + r * Math.cos(a), 12 + r * Math.sin(a)].map((v) => v.toFixed(2))
    const [x1, y1] = p(7.5)
    const [x2, y2] = p(10)
    rays.push(['line', { x1, y1, x2, y2 }])
  }
  return icon('icon-sun', ['circle', { cx: '12', cy: '12', r: '4.5' }], ...rays)
}

export function moonIcon(): SVGSVGElement {
  return icon('icon-moon', ['path', { d: 'M20 14.5A8.2 8.2 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5Z' }])
}

/** A padlock, for a code with a password in it. */
export function lockIcon(): SVGSVGElement {
  return icon('icon-lock', ['path', { d: 'M6 11H18V20H6Z M8.5 11V8A3.5 3.5 0 0 1 15.5 8V11' }])
}

