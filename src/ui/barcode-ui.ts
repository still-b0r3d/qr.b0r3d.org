// The settings for a barcode, as b0r3d QR for PC has them: what's typed for each type (kept while
// the page is open; each starts with its example), the hint and what's wrong with it, and the
// barcode's settings (one set for every type, kept in the browser from one visit to the next,
// where the site has always kept them).

import { readColour, toHex } from '../qr/css'
import { BARCODE_GROUPS, BARCODE_FORMATS, barcodeFormat, type BarcodeType } from '../qr/barcodes'
import { DEFAULT_BAR_HEIGHT, MAX_BAR_HEIGHT, MAX_SCALE, MIN_BAR_HEIGHT, MIN_SCALE, defaultLook, wholeSetting, type BarcodeLook } from '../qr/barcode-svg'
import { barcodeSettings } from '../qr/recent'
import { h, section } from './dom'

/** Where the site keeps the barcode settings (the 8 of them, as JSON), once one is changed. */
export const KEPT_LOOK_KEY = 'b0r3d-qr.barcode-settings'

/** The settings kept from the last visit (only those of the right kind, sizes in range), or the defaults. */
function keptLook(): BarcodeLook {
  try {
    const kept = localStorage.getItem(KEPT_LOOK_KEY)
    return kept ? barcodeSettings(JSON.parse(kept), defaultLook()) : defaultLook()
  } catch {
    // nothing kept, or something that isn't JSON
    return defaultLook()
  }
}

function keepLook(look: BarcodeLook): void {
  const { color, background, transparent, scale, showText, allowRectangular, barHeight, quietZones } = look
  try {
    localStorage.setItem(KEPT_LOOK_KEY, JSON.stringify({ color, background, transparent, scale, showText, allowRectangular, barHeight, quietZones }))
  } catch {
    // private browsing: the settings last while the page is open
  }
}

export interface BarcodeHost {
  /** What's typed or a setting changed: the barcode is made again. */
  changed(): void
  /** Only the size of the files changed. */
  scaled(): void
}

export interface BarcodePanel {
  readonly sections: HTMLElement[]
  readonly dataBox: HTMLTextAreaElement
  readonly look: BarcodeLook
  /** A type and what's typed for it (`text` given: that, exactly, e.g. a scanned code's). */
  show(type: BarcodeType, text?: string): void
  /** What's typed, exactly as given until it's edited (a scanned barcode's CR LF stay). */
  text(): string
  /** Typing still to be taken (the moment after typing stops): taken now. True when there was some. */
  flush(): boolean
  /** Settings from elsewhere (Recent codes): every control shows them. */
  setLook(look: BarcodeLook): void
  /** What's wrong with what's typed, or null. */
  showError(message: string | null): void
  /** The line under the size: how big the files are. */
  showScale(hint: string): void
}

/** The Code type list: QR codes, then the barcode types in their groups. */
export function codeTypeList(onPick: (type: BarcodeType | null) => void): HTMLSelectElement {
  const select = h(
    'select',
    { id: 'code-type', 'data-testid': 'code-type' },
    h('option', { value: '' }, 'QR code'),
    ...BARCODE_GROUPS.map((group) => h('optgroup', { label: group }, ...BARCODE_FORMATS.filter((f) => f.group === group).map((f) => h('option', { value: f.id }, f.label))))
  )
  select.addEventListener('change', () => onPick(select.value ? (select.value as BarcodeType) : null))
  return select
}

/**
 * A whole-number box as the site takes it (halves up, 0 or nothing for the default, then the
 * limits); a number with places is taken, never marked wrong, and the arrow keys add the step.
 */
function wholeBox(id: string, label: string, min: number, max: number, step: number, fallback: number, onValue: (v: number) => void): HTMLInputElement {
  const box = h('input', { id, type: 'number', min, max, step: 'any', inputmode: 'decimal', 'aria-label': label })
  box.addEventListener('input', () => {
    const v = box.valueAsNumber
    if (Number.isFinite(v) && v >= min && v <= max) onValue(wholeSetting(v, fallback, min, max))
  })
  box.addEventListener('change', () => {
    const v = wholeSetting(box.valueAsNumber, fallback, min, max)
    box.value = String(v)
    onValue(v)
  })
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const now = Number.isFinite(box.valueAsNumber) ? box.valueAsNumber : fallback
    const v = wholeSetting(now + (e.key === 'ArrowUp' ? step : -step), fallback, min, max)
    box.value = String(v)
    onValue(v)
  })
  return box
}

/** A colour as the picker shows it (it only takes #rrggbb). */
const pickerColour = (css: string, otherwise: string): string => {
  const c = readColour(css)
  return c ? toHex(c) : otherwise
}

export function makeBarcodePanel(host: BarcodeHost): BarcodePanel {
  let type: BarcodeType = 'datamatrix'
  const texts = new Map<BarcodeType, string>()
  // a text given exactly (a scanned code's, its CR LF too) for a type, until its box is edited
  const exactTexts = new Map<BarcodeType, string>()
  const look = keptLook()

  // ---------- data ----------

  const dataBox = h('textarea', { id: 'barcode-data', rows: 3, 'aria-label': 'Data to encode', spellcheck: 'false', 'data-testid': 'barcode-data' })
  const hint = h('p', { class: 'hint', 'data-testid': 'barcode-hint' })
  // what's wrong is said at once (the PC app's is an assertive live region)
  const error = h('p', { class: 'hint bad-text', hidden: true, role: 'alert', 'data-testid': 'barcode-error' })
  let typing = 0
  dataBox.addEventListener('input', () => {
    texts.set(type, dataBox.value)
    exactTexts.delete(type)
    // a moment after typing stops, as the site has always made barcodes
    clearTimeout(typing)
    typing = window.setTimeout(() => {
      typing = 0
      host.changed()
    }, 250)
  })

  // ---------- settings ----------

  const check = (id: string, label: string, onChange: (on: boolean) => void): { box: HTMLInputElement; row: HTMLElement } => {
    const box = h('input', { type: 'checkbox', id })
    box.addEventListener('change', () => onChange(box.checked))
    return { box, row: h('label', { class: 'check-row', for: id }, box, ' ' + label) }
  }
  const set = (change: () => void): void => {
    change()
    showLook()
    keepLook(look)
    host.changed()
  }
  const showText = check('barcode-show-text', 'Show the text under the bars', (on) => set(() => (look.showText = on)))
  const quietZones = check('barcode-quiet-zones', 'Include quiet zones (margins)', (on) => set(() => (look.quietZones = on)))
  const quietNote = h(
    'p',
    { class: 'hint warn-text', hidden: true, 'data-testid': 'quiet-zones-note' },
    'Leave blank space on both sides where you place it, about 10 times the thinnest bar: scanners need it to find the code.'
  )
  const barHeight = wholeBox('barcode-bar-height', 'Bar height in modules', MIN_BAR_HEIGHT, MAX_BAR_HEIGHT, 5, DEFAULT_BAR_HEIGHT, (v) => {
    if (v !== look.barHeight) set(() => (look.barHeight = v))
  })
  const rectangular = check('barcode-rectangular', 'Allow a rectangular code (narrower; fewer scanners read it)', (on) => set(() => (look.allowRectangular = on)))
  const colour = (label: string, onPick: (hex: string) => void): HTMLInputElement => {
    const input = h('input', { type: 'color', class: 'colour', 'aria-label': label, title: label })
    input.addEventListener('input', () => onPick(input.value))
    return input
  }
  const bars = colour('Bars colour', (hex) => set(() => (look.color = hex)))
  const background = colour('Background colour', (hex) => set(() => (look.background = hex)))
  const transparent = check('barcode-transparent', 'Transparent background', (on) => set(() => (look.transparent = on)))
  const scale = wholeBox('barcode-scale', 'Size in pixels per module', MIN_SCALE, MAX_SCALE, 1, 4, (v) => {
    if (v === look.scale) return
    look.scale = v
    keepLook(look)
    host.scaled()
  })
  const scaleHint = h('p', { class: 'hint', 'data-testid': 'barcode-scale-hint' })

  const quietRow = h('div', null, quietZones.row, quietNote)
  const linear = h(
    'div',
    { class: 'linear-options' },
    showText.row,
    quietRow,
    h('div', { class: 'row' }, h('label', { for: 'barcode-bar-height' }, 'Bar height (modules)'), barHeight),
    h('p', { class: 'hint' }, '20 to 150; the default is 50.')
  )

  const sections = [
    section('Data', true, dataBox, hint, error),
    section(
      'Barcode settings',
      true,
      linear,
      rectangular.row,
      h('div', { class: 'row' }, h('span', { class: 'label-inline' }, 'Bars'), bars),
      h('div', { class: 'row' }, h('span', { class: 'label-inline' }, 'Background'), background),
      transparent.row,
      h('div', { class: 'row' }, h('label', { for: 'barcode-scale' }, 'Size (pixels per module)'), scale),
      scaleHint
    ),
    h('p', { class: 'hint barcode-credit' }, 'Barcodes are made with zint and checked with ZXing-C++; the Notices link at the bottom of the page has their licences.')
  ]

  function showLook(): void {
    showText.box.checked = look.showText
    quietZones.box.checked = look.quietZones
    quietNote.hidden = look.quietZones
    barHeight.value = String(look.barHeight)
    rectangular.box.checked = look.allowRectangular
    bars.value = pickerColour(look.color, '#000000')
    background.value = pickerColour(look.background, '#ffffff')
    background.disabled = look.transparent
    transparent.box.checked = look.transparent
    scale.value = String(look.scale)
  }

  function show(next: BarcodeType, text?: string): void {
    clearTimeout(typing)
    typing = 0
    type = next
    const format = barcodeFormat(next)
    if (text !== undefined) {
      texts.set(next, text)
      exactTexts.set(next, text)
    }
    dataBox.value = texts.get(next) ?? format.example
    dataBox.classList.toggle('mono', format.linear && !format.gs1)
    hint.textContent = format.hint
    linear.hidden = !format.linear
    quietRow.hidden = format.keepsQuietZones
    rectangular.row.hidden = next !== 'datamatrix' && next !== 'gs1-datamatrix'
    showLook()
  }

  showLook()
  return {
    sections,
    dataBox,
    look,
    show,
    // (a text box turns every line break into a plain LF)
    text: () => {
      const exact = exactTexts.get(type)
      return exact !== undefined && dataBox.value === exact.replace(/\r\n?/g, '\n') ? exact : dataBox.value
    },
    flush() {
      if (!typing) return false
      clearTimeout(typing)
      typing = 0
      host.changed()
      return true
    },
    setLook(next) {
      Object.assign(look, next)
      showLook()
      keepLook(look)
    },
    showError(message) {
      if (error.textContent !== (message ?? '')) error.textContent = message ?? ''
      error.hidden = message === null
    },
    showScale(text) {
      scaleHint.textContent = text
    }
  }
}
