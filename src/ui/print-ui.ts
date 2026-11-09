// "Size for print", as b0r3d QR for PC has it under Size and print (and under Barcode settings for
// barcodes): a width on paper in mm or inches at 150, 300 or 600 DPI, with a line that says what
// it makes and a warning when modules or bars come out too small. A new unit keeps the same length
// on paper. Kept in the browser where the site has always kept it.

import { h } from './dom'
import { RESOLUTIONS, defaultPrint, inUnit, readPrint, widthDecimals, writtenPrint, type PrintSize, type PrintUnit } from '../qr/print'

export interface PrintControls {
  readonly el: HTMLElement
  readonly print: PrintSize
  /** the line under it and its warning (null: none) */
  show(line: string, warning: string | null): void
}

function kept(key: string): PrintSize {
  try {
    const text = localStorage.getItem(key)
    return text ? readPrint(JSON.parse(text)) : defaultPrint()
  } catch {
    return defaultPrint()
  }
}

/** The controls, `id` naming them apart (the QR code's and the barcode's), kept under `key`. */
export function makePrintControls(id: string, key: string, onChange: (p: PrintSize) => void): PrintControls {
  const print = kept(key)
  const on = h('input', { type: 'checkbox', id: `${id}-on` })
  const width = h('input', { id: `${id}-width`, type: 'number', min: 0.01, max: 1000, step: 'any', inputmode: 'decimal', 'aria-label': 'Print width' })
  const unit = h('select', { id: `${id}-unit`, 'aria-label': 'Unit' }, h('option', { value: 'mm' }, 'mm'), h('option', { value: 'in' }, 'in'))
  const dpi = h('select', { id: `${id}-dpi`, 'aria-label': 'Resolution' }, ...RESOLUTIONS.map((d) => h('option', { value: String(d) }, `${d} DPI`)))
  const hint = h('p', { class: 'hint', 'data-testid': `${id}-hint` })
  const warn = h('p', { class: 'hint warn-text', hidden: true, 'data-testid': `${id}-warning` })
  const panel = h('div', { class: 'print-panel' }, h('div', { class: 'print-row' }, width, unit, dpi), hint, warn)
  const el = h('div', { class: 'print-size' }, h('label', { class: 'check-row', for: `${id}-on` }, on, ' Size for print'), panel)

  const keep = () => {
    try {
      localStorage.setItem(key, writtenPrint(print))
    } catch {
      // private browsing: it lasts while the page is open
    }
  }
  const showControls = () => {
    on.checked = print.on
    panel.hidden = !print.on
    width.value = String(Number(print.width.toFixed(widthDecimals(print.unit))))
    unit.value = print.unit
    dpi.value = String(print.dpi)
  }
  const changed = () => {
    keep()
    onChange(print)
  }

  on.addEventListener('change', () => {
    print.on = on.checked
    panel.hidden = !print.on
    changed()
  })
  // the box shows the width rounded: it's taken only once it's changed, so a length kept exact
  // through a change of unit stays exact
  width.addEventListener('input', () => {
    const v = width.valueAsNumber
    if (!Number.isFinite(v)) return
    print.width = v
    changed()
  })
  width.addEventListener('change', () => {
    if (!Number.isFinite(width.valueAsNumber)) showControls()
  })
  unit.addEventListener('change', () => {
    const next = inUnit(print, unit.value as PrintUnit)
    print.unit = next.unit
    print.width = next.width
    showControls()
    changed()
  })
  dpi.addEventListener('change', () => {
    print.dpi = Number(dpi.value)
    changed()
  })

  showControls()
  return {
    el,
    print,
    show(line, warning) {
      hint.textContent = line
      warn.textContent = warning ? '⚠ ' + warning : ''
      warn.hidden = !warning
    }
  }
}
