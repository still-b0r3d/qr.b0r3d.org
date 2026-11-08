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

export function screenIcon(): SVGSVGElement {
  return icon(
    'icon-screen',
    ['rect', { x: '3', y: '4.5', width: '18', height: '12', rx: '1.5' }],
    ['line', { x1: '12', y1: '16.5', x2: '12', y2: '20' }],
    ['line', { x1: '8', y1: '20', x2: '16', y2: '20' }]
  )
}
