// The settings in fold-out sections, as b0r3d QR lays them out (and as the PC app does): Data,
// Style, Logo, Frame, and Size and print. Each control changes the design and asks for the code
// to be drawn again; `show()` puts the design back into the controls (after a preset, a design
// file or Randomize).

import type { QrArt } from '../qr/art'
import { dataChecks, levelHint, logoHint, versionHint, type DataCheck } from '../qr/checks'
import { isLength, readColour, toHex } from '../qr/css'
import {
  CORNER_DOT_TYPES,
  CORNER_SQUARE_TYPES,
  DEFAULT_LOGO_SIZE,
  DOT_TYPES,
  FRAME_PRESETS,
  PRESET_NAMES,
  applyFramePreset,
  applyPreset,
  besideCode,
  isTransparent,
  matchingFramePreset,
  matchingPreset,
  randomize,
  type QrDesign,
  type QrFrame
} from '../qr/design'
import { formatted, formattedFixed, roundTo } from '../qr/numbers'
import type { QrLevel } from '../qr/tables'
import { detect, type TemplateKind } from '../qr/templates'
import { h, section, segmented } from './dom'
import { CAPTION_FONTS } from './fonts'
import { clipboardPicture, designPicture, forgetPicture } from './pictures'
import { makeTemplatePicker } from './templates-ui'

export interface DesignerHost {
  /** The design being made (the controls change it in place). */
  readonly design: QrDesign
  /** The design drawn, or null when there's no code. */
  art(): QrArt | null
  /** Something in the design changed: draw it again. */
  changed(): void
  /** A whole new design (a preset, Randomize). */
  replace(design: QrDesign): void
  /** A short note for the person, for a moment. */
  say(text: string, kind: 'good' | 'warn' | 'bad'): void
  /** Opens a data template's form; what it writes becomes the text. */
  template(kind: TemplateKind): void
  /** The text, changed by one of the checks' fixes. */
  useText(text: string): void
}

const LEVELS: { value: QrLevel; text: string; name: string }[] = [
  { value: 'L', text: 'L', name: 'Level L, low' },
  { value: 'M', text: 'M', name: 'Level M, medium' },
  { value: 'Q', text: 'Q', name: 'Level Q, high' },
  { value: 'H', text: 'H', name: 'Level H, highest' }
]

// the PC app's boxes: their limits, steps and decimal places
const QUIET: Limits = { min: 0, max: 20, step: 1, decimals: 1 }
const SIZE: Limits = { min: 50, max: 4000, step: 50, decimals: 0 }
const RADIUS: Limits = { min: 0, max: 10000, step: 1, decimals: 0 }
const LOGO_SPACE: Limits = { min: 0, max: 40, step: 0.5, decimals: 2 }
const FRAME_WIDTH: Limits = { min: 250, max: 800, step: 10, decimals: 0 }

// ---------- small controls ----------

let ids = 0
const newId = (base: string) => `${base}-${++ids}`

function colourInput(name: string, onPick: (hex: string) => void): HTMLInputElement {
  const input = h('input', { type: 'color', class: 'colour', 'aria-label': name, title: name })
  input.addEventListener('input', () => onPick(input.value))
  return input
}

/** Shows a design's CSS colour in a colour picker (which only takes #rrggbb). */
function showColour(input: HTMLInputElement, css: string): void {
  const c = readColour(css)
  input.value = c ? toHex(c) : '#000000'
}

function choice(name: string, values: readonly string[], onPick: (value: string) => void): HTMLSelectElement {
  const select = h('select', { 'aria-label': name }, ...values.map((v) => h('option', { value: v }, v)))
  select.addEventListener('change', () => onPick(select.value))
  return select
}

/** Picks a value in a list, adding it ("From the design") when the list doesn't have it. */
function showChoice(select: HTMLSelectElement, value: string, label = (v: string) => `From the design: ${v}`): void {
  if (![...select.options].some((o) => o.value === value)) {
    select.querySelectorAll('option[data-extra]').forEach((o) => o.remove())
    select.prepend(h('option', { value, 'data-extra': 'true' }, label(value)))
  }
  select.value = value
}

interface Limits {
  min: number
  max: number
  /** What the arrows add. */
  step: number
  /** Decimal places kept: a typed number is rounded to them (halves to even), then kept in range. */
  decimals: number
}

/** A number as a box keeps it: rounded to its places, then within its limits (as the PC app's boxes do). */
export function fitNumber(v: number, limits: Limits): number {
  return Math.max(limits.min, Math.min(limits.max, roundTo(v, limits.decimals)))
}

/** A design's number as its box shows it (the design keeps its own until the box is changed). */
function shownIn(v: number, limits: Limits): string {
  return formatted(fitNumber(Number.isFinite(v) ? v : limits.min, limits), limits.decimals)
}

function numberBox(id: string, limits: Limits, onValue: (v: number) => void): HTMLInputElement {
  // step "any": a typed number with more places is taken (and rounded), never marked wrong
  const box = h('input', { id, type: 'number', min: limits.min, max: limits.max, step: 'any', inputmode: 'decimal' })
  box.addEventListener('input', () => {
    const v = box.valueAsNumber
    if (Number.isFinite(v) && v >= limits.min && v <= limits.max) onValue(fitNumber(v, limits))
  })
  box.addEventListener('change', () => {
    const v = box.valueAsNumber
    if (!Number.isFinite(v)) return
    const kept = fitNumber(v, limits)
    box.value = formatted(kept, limits.decimals)
    onValue(kept)
  })
  // the arrow keys add the box's own step, as the PC app's do
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const v = Number.isFinite(box.valueAsNumber) ? box.valueAsNumber : limits.min
    const kept = fitNumber(v + (e.key === 'ArrowUp' ? limits.step : -limits.step), limits)
    box.value = formatted(kept, limits.decimals)
    onValue(kept)
  })
  return box
}

function row(label: string, control: HTMLElement, id = control.id): HTMLElement {
  return h('div', { class: 'row' }, h('label', { for: id }, label), control)
}

function hint(text = '', testid?: string): HTMLParagraphElement {
  return h('p', { class: 'hint', 'data-testid': testid ?? null }, text)
}

function fileButton(label: string, accept: string, onFile: (file: File) => void): HTMLElement {
  const input = h('input', { type: 'file', accept, class: 'file-input', tabindex: -1, 'aria-hidden': 'true' })
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.value = ''
    if (file) onFile(file)
  })
  const button = h('button', { type: 'button', class: 'small' }, label)
  button.addEventListener('click', () => input.click())
  return h('span', { class: 'file-button' }, button, input)
}

// ---------- the sections ----------

export interface Designer {
  readonly sections: HTMLElement[]
  readonly dataBox: HTMLTextAreaElement
  /** where a picture dropped becomes the logo */
  readonly logoSection: HTMLElement
  /** Puts the design back into every control. */
  show(): void
  /** The hints that follow the code (logo room, level, size). */
  showHints(): void
  /** A picture chosen, pasted or dropped, as the logo. */
  useLogo(file: Blob, name?: string): Promise<void>
  /** Drops pictures still being read. */
  cancelPicks(): void
}

export function makeDesigner(host: DesignerHost, firstText: string): Designer {
  let lastBackground = '#ffffff'
  let lastFrame: QrFrame | null = null

  // ---------- Data ----------

  const dataBox = h('textarea', { id: 'data', rows: 4, placeholder: 'Type or paste a link, or any text', 'aria-label': 'Data', spellcheck: 'false' })
  dataBox.value = firstText
  // the list shows the template the text is (none while there's no text); Edit… opens that one
  let shownTemplate: TemplateKind | null = null
  const templates = makeTemplatePicker(
    (kind) => host.template(kind),
    () => host.template(shownTemplate ?? 'text')
  )
  // the checks on the typed text, each with its one-click fix; screen readers hear new ones (the
  // same messages stay as they are while typing, and their fixes follow the text)
  const checksBox = h('div', { class: 'data-checks', 'aria-live': 'polite', 'data-testid': 'data-checks' })
  let checkedText: string | null = null
  let checks: DataCheck[] = []
  let checksSaid = ''

  function showData(text: string): void {
    shownTemplate = text.trim().length === 0 ? null : detect(text).kind
    templates.show(shownTemplate)
    if (text === checkedText) return
    checkedText = text
    checks = dataChecks(text)
    const said = checks.map((c) => c.message).join('\n')
    if (said === checksSaid) return
    checksSaid = said
    checksBox.replaceChildren(
      ...checks.map((check, i) => {
        const fix = h('button', { type: 'button', class: 'small' }, check.button)
        fix.addEventListener('click', () => {
          if (checks[i]) host.useText(checks[i].fixed)
        })
        return h('div', { class: 'data-check' }, h('p', { class: 'warn-text' }, '⚠ ' + check.message), fix)
      })
    )
  }

  // ---------- Style ----------

  const preset = h(
    'select',
    { id: 'preset', 'aria-label': 'Preset' },
    ...PRESET_NAMES.map((name) => h('option', { value: name }, name)),
    h('option', { value: '', disabled: true }, 'Your own')
  )
  preset.addEventListener('change', () => {
    if (!preset.value) return
    if (host.design.frame) lastFrame = host.design.frame
    const d = applyPreset(preset.value, host.design)
    lastBackground = d.background
    host.replace(d)
  })
  const randomButton = h('button', { type: 'button', class: 'small', title: 'Random shapes and colours. The logo, sizes and frame stay.' }, 'Randomize')
  randomButton.addEventListener('click', () => {
    const d = randomize(host.design)
    lastBackground = d.background
    host.replace(d)
  })

  const dotsType = choice('Dot shape', DOT_TYPES, (v) => set(() => (host.design.dotsType = v)))
  const squaresType = choice('Corner square shape', CORNER_SQUARE_TYPES, (v) => set(() => (host.design.cornersSquareType = v)))
  const centresType = choice('Corner dot shape', CORNER_DOT_TYPES, (v) => set(() => (host.design.cornersDotType = v)))
  const dotsColour = colourInput('Dot colour', (v) => set(() => (host.design.dotsColor = v)))
  const squaresColour = colourInput('Corner square colour', (v) => set(() => (host.design.cornersSquareColor = v)))
  const centresColour = colourInput('Corner dot colour', (v) => set(() => (host.design.cornersDotColor = v)))
  const withBackground = h('input', { type: 'checkbox', id: 'with-background' })
  const backgroundColour = colourInput('Background colour', (v) => {
    lastBackground = v
    set(() => {
      if (!isTransparent(host.design.background)) host.design.background = v
    })
  })
  withBackground.addEventListener('change', () =>
    set(() => {
      if (withBackground.checked) host.design.background = lastBackground
      else {
        if (!isTransparent(host.design.background)) lastBackground = host.design.background
        host.design.background = 'transparent'
      }
      backgroundColour.disabled = !withBackground.checked
    })
  )
  const radius = numberBox('rounded-corners', RADIUS, (v) => set(() => (host.design.borderRadius = v)))

  // ---------- Logo ----------

  const logoNote = hint('', 'logo-note')
  const logoRoom = hint('', 'logo-hint')
  const webLogo = h('input', { id: 'logo-url', type: 'url', placeholder: 'https://…', autocomplete: 'off', spellcheck: 'false' })
  webLogo.addEventListener('change', () => {
    const v = webLogo.value.trim()
    if (v && !/^https?:\/\//i.test(v)) {
      host.say('Give a web address that starts with https://, or choose a picture.', 'warn')
      return
    }
    // given again after it failed: try again
    forgetPicture(v)
    logoTicket++
    set(() => (host.design.logo = v))
  })
  const removeLogo = h('button', { type: 'button', class: 'small' }, 'Remove')
  removeLogo.addEventListener('click', () => {
    logoTicket++
    set(() => (host.design.logo = ''))
  })
  const pasteLogo = h('button', { type: 'button', class: 'small' }, 'Paste')
  pasteLogo.addEventListener('click', async () => {
    try {
      const picture = await clipboardPicture()
      if (picture) await useLogo(picture)
      else host.say('Nothing to use on the clipboard: copy a picture first.', 'warn')
    } catch {
      host.say("This browser didn't let the page look at the clipboard. Choose the picture's file instead.", 'warn')
    }
  })
  // as the PC app's slider: 0 to 0.5 in steps of 0.05 (a design file may hold any share up to 1,
  // which stays as it is until the slider is moved)
  const logoSize = h('input', { id: 'logo-size', type: 'range', min: 0, max: 0.5, step: 0.05 })
  const logoSizeShown = h('output', { for: 'logo-size', class: 'slider-value' })
  logoSize.addEventListener('input', () => {
    const v = roundTo(logoSize.valueAsNumber, 2)
    logoSizeShown.textContent = formattedFixed(v, 2)
    set(() => (host.design.logoSize = v))
  })
  const logoSpace = numberBox('logo-space', LOGO_SPACE, (v) => set(() => (host.design.logoSpace = v)))

  // a picture still being read when another is picked (or a design opened) is dropped
  let logoTicket = 0
  let frameTicket = 0

  async function useLogo(file: Blob, name = 'that picture'): Promise<void> {
    const mine = ++logoTicket
    try {
      const url = await designPicture(file, 1024)
      if (mine !== logoTicket) return
      set(() => (host.design.logo = url))
      logoSection.open = true
    } catch (e) {
      if (mine !== logoTicket) return
      host.say(`Couldn't use ${name}: ${e instanceof Error ? e.message : "it isn't a picture"}.`, 'bad')
    }
  }

  // ---------- Frame ----------

  const frameOn = h('input', { type: 'checkbox', id: 'frame-on' })
  frameOn.addEventListener('change', () => {
    if (frameOn.checked) host.design.frame = lastFrame ? { ...lastFrame } : applyFramePreset('Default Frame', null)
    else {
      lastFrame = host.design.frame
      host.design.frame = null
    }
    show()
    host.changed()
  })
  const framePreset = h(
    'select',
    { id: 'frame-preset', 'aria-label': 'Frame look' },
    ...FRAME_PRESETS.map((name) => h('option', { value: name }, name)),
    h('option', { value: '', disabled: true }, 'Your own')
  )
  framePreset.addEventListener('change', () => {
    if (!host.design.frame || !framePreset.value) return
    host.design.frame = applyFramePreset(framePreset.value, host.design.frame)
    show()
    host.changed()
  })
  const caption = h('textarea', { id: 'caption', rows: 2, 'aria-label': 'Caption', spellcheck: 'true' })
  caption.addEventListener('input', () => frameSet((f) => (f.text = caption.value)))
  const positions = segmented(
    'Where the caption goes',
    [
      { value: 'bottom', text: 'Bottom', name: 'Caption at the bottom' },
      { value: 'top', text: 'Top', name: 'Caption at the top' },
      { value: 'left', text: 'Left', name: 'Caption on the left' },
      { value: 'right', text: 'Right', name: 'Caption on the right' }
    ],
    (v) =>
      frameSet((f) => {
        f.position = v
        show()
      })
  )
  const frameWidth = numberBox('frame-width', FRAME_WIDTH, (v) => frameSet((f) => (f.captionWidth = v - 200)))
  const frameWidthRow = row('Frame width (px)', frameWidth)
  const textColour = colourInput('Caption colour', (v) => frameSet((f) => (f.textColor = v)))
  const frameColour = colourInput('Frame background colour', (v) => frameSet((f) => (f.backgroundColor = v)))
  const borderColour = colourInput('Border colour', (v) => frameSet((f) => (f.borderColor = v)))
  const lengthBox = (id: string, key: 'borderWidth' | 'borderRadius' | 'padding') => {
    const box = h('input', { id, type: 'text', class: 'length', autocomplete: 'off', spellcheck: 'false' })
    const commit = () => {
      const f = host.design.frame
      if (!f) return
      const typed = box.value.trim()
      if (typed === f[key]) return
      if (typed.length > 0 && !isLength(typed)) {
        box.value = f[key]
        host.say('Give it a length, like 16px.', 'warn')
        return
      }
      frameSet((frame) => (frame[key] = typed))
    }
    box.addEventListener('change', commit)
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit()
    })
    return box
  }
  const borderBox = lengthBox('frame-border', 'borderWidth')
  const cornersBox = lengthBox('frame-corners', 'borderRadius')
  const paddingBox = lengthBox('frame-padding', 'padding')
  const font = h(
    'select',
    { id: 'caption-font', 'aria-label': 'Caption font' },
    h('option', { value: '' }, 'Default'),
    ...CAPTION_FONTS.map((f) => h('option', { value: f.value }, f.label))
  )
  font.addEventListener('change', () => frameSet((f) => (f.fontFamily = font.value || null)))
  const noPicture = h('button', { type: 'button', class: 'small' }, 'No picture')
  noPicture.addEventListener('click', () => frameSet((f) => (f.backgroundImage = null)))
  const framePicture = fileButton('Choose picture…', 'image/*,.svg', async (file) => {
    if (!host.design.frame) return
    const mine = ++frameTicket
    try {
      const url = await designPicture(file, 2048)
      if (mine !== frameTicket) return
      frameSet((f) => (f.backgroundImage = url))
    } catch (e) {
      if (mine !== frameTicket) return
      host.say(`Couldn't use ${file.name}: ${e instanceof Error ? e.message : "it isn't a picture"}.`, 'bad')
    }
  })
  const framePanel = h(
    'div',
    { class: 'frame-panel' },
    row('Frame look', framePreset),
    h('label', { class: 'label', for: 'caption' }, 'Caption'),
    caption,
    h('p', { class: 'label' }, 'Caption goes'),
    positions.el,
    frameWidthRow,
    h('div', { class: 'swatches' }, swatch('Text', textColour), swatch('Background', frameColour), swatch('Border', borderColour)),
    h('div', { class: 'row' }, h('span', { class: 'label-inline' }, 'Background picture'), h('span', { class: 'buttons' }, framePicture, noPicture)),
    h('div', { class: 'lengths' }, lengthField('Border', borderBox), lengthField('Corners', cornersBox), lengthField('Padding', paddingBox)),
    row('Caption font', font)
  )

  // ---------- Size and print ----------

  const levels = segmented('Error correction', LEVELS, (level) =>
    set(() => {
      host.design.level = level
      levels.set(level)
    })
  )
  const levelLine = hint('', 'level-hint')
  const version = h(
    'select',
    { id: 'qr-version', 'aria-label': 'Size of the code (QR version)' },
    h('option', { value: '0' }, 'Auto (smallest that fits)'),
    ...Array.from({ length: 40 }, (_, i) => h('option', { value: String(i + 1) }, `${i + 1} (${17 + 4 * (i + 1)} × ${17 + 4 * (i + 1)})`))
  )
  version.addEventListener('change', () => set(() => (host.design.version = Number(version.value))))
  const versionLine = hint('', 'version-hint')
  const marker = h('input', { type: 'checkbox', id: 'utf8-marker' })
  marker.addEventListener('change', () => set(() => (host.design.utf8Marker = marker.checked)))
  const markerNote = h('p', { class: 'hint warn-text', hidden: true, 'data-testid': 'marker-note' }, "Couldn't add the UTF-8 marker, so this code is made without it.")
  const quiet = numberBox('quiet-zone', QUIET, (v) => set(() => (host.design.margin = v)))
  const size = numberBox('picture-size', SIZE, (v) => set(() => (host.design.width = host.design.height = v)))

  // ---------- the sections ----------

  const logoSection = section(
    'Logo',
    false,
    h('div', { class: 'buttons' }, fileButton('Choose picture…', 'image/*,.svg', (f) => void useLogo(f, f.name)), pasteLogo, removeLogo),
    logoNote,
    row('Or from a web address', webLogo),
    h('div', { class: 'row' }, h('label', { for: 'logo-size' }, 'Size'), h('span', { class: 'slider' }, logoSize, logoSizeShown)),
    row('Space around it (modules)', logoSpace),
    logoRoom
  )
  const frameSection = section('Frame', false, h('label', { class: 'check-row' }, frameOn, ' Add a frame with a caption'), framePanel)
  const sections = [
    section('Data', true, templates.el, dataBox, checksBox),
    section(
      'Style',
      true,
      h('div', { class: 'row' }, h('label', { for: 'preset' }, 'Preset'), h('span', { class: 'buttons' }, preset, randomButton)),
      shapeRow('Dots', dotsType, dotsColour),
      shapeRow('Corner squares', squaresType, squaresColour),
      shapeRow('Corner dots', centresType, centresColour),
      h('div', { class: 'row' }, h('label', { class: 'check-row', for: 'with-background' }, withBackground, ' With background'), backgroundColour),
      row('Rounded corners (px)', radius)
    ),
    logoSection,
    frameSection,
    section(
      'Size and print',
      true,
      h('p', { class: 'label' }, 'Error correction'),
      levels.el,
      levelLine,
      row('Size of the code (QR version)', version),
      versionLine,
      h('label', { class: 'check-row', for: 'utf8-marker' }, marker, ' Mark the text as UTF-8 (ECI 26)'),
      hint(
        'Tells scanners how to read accents, other alphabets and emoji, as the QR standard asks. Phones read them fine without it, and a few older scanners show the mark as extra characters, so test it before printing many.'
      ),
      markerNote,
      row('Quiet zone (modules)', quiet),
      hint('4 is the standard (ISO/IEC 18004): scanners need blank space around a code to find it.'),
      row('Picture size (px)', size)
    )
  ]

  // ---------- keeping the design and the controls in step ----------

  function set(change: () => void): void {
    change()
    showLook()
    host.changed()
  }

  function frameSet(change: (f: QrFrame) => void): void {
    const f = host.design.frame
    if (!f) return
    change(f)
    showFrameLook()
    noPicture.disabled = !f.backgroundImage
    host.changed()
  }

  function showLook(): void {
    const d = host.design
    const matching = matchingPreset(d)
    preset.value = matching ?? ''
  }

  function showFrameLook(): void {
    const f = host.design.frame
    if (f) framePreset.value = matchingFramePreset(f) ?? ''
  }

  function show(): void {
    const d = host.design
    dataBox.value = d.data
    showLook()
    showChoice(dotsType, d.dotsType)
    showChoice(squaresType, d.cornersSquareType)
    showChoice(centresType, d.cornersDotType)
    showColour(dotsColour, d.dotsColor)
    showColour(squaresColour, d.cornersSquareColor)
    showColour(centresColour, d.cornersDotColor)
    withBackground.checked = !isTransparent(d.background)
    if (!isTransparent(d.background)) lastBackground = d.background
    showColour(backgroundColour, isTransparent(d.background) ? lastBackground : d.background)
    backgroundColour.disabled = isTransparent(d.background)
    radius.value = shownIn(d.borderRadius, RADIUS)
    webLogo.value = /^https?:\/\//i.test(d.logo.trim()) ? d.logo.trim() : ''
    const share = d.logoSize ?? DEFAULT_LOGO_SIZE
    logoSize.value = String(share)
    logoSizeShown.textContent = formattedFixed(share, 2)
    logoSpace.value = shownIn(d.logoSpace, LOGO_SPACE)
    removeLogo.disabled = d.logo.trim().length === 0
    const f = d.frame
    frameOn.checked = f !== null
    framePanel.hidden = f === null
    if (f) {
      showFrameLook()
      const shown = f.text.replace(/\r\n?/g, '\n')
      if (caption.value !== shown) caption.value = shown
      positions.set(f.position === 'top' || f.position === 'left' || f.position === 'right' ? f.position : 'bottom')
      frameWidthRow.hidden = !besideCode(f)
      frameWidth.value = String(f.captionWidth + 200)
      showColour(textColour, f.textColor)
      showColour(frameColour, f.backgroundColor)
      showColour(borderColour, f.borderColor)
      borderBox.value = f.borderWidth
      cornersBox.value = f.borderRadius
      paddingBox.value = f.padding
      if (f.fontFamily && !CAPTION_FONTS.some((c) => c.value === f.fontFamily)) showChoice(font, f.fontFamily)
      else font.value = f.fontFamily ?? ''
      noPicture.disabled = !f.backgroundImage
    }
    levels.set(d.level)
    version.value = String(Math.max(0, Math.min(40, Math.trunc(d.version) || 0)))
    marker.checked = d.utf8Marker
    quiet.value = shownIn(d.margin, QUIET)
    size.value = shownIn(Math.max(d.width, d.height), SIZE)
    showHints()
  }

  function showHints(): void {
    const d = host.design
    const art = host.art()
    showData(d.data)
    levelLine.textContent = levelHint(d.level, d.data, art?.levelRaised ?? false)
    const v = versionHint(art)
    versionLine.textContent = v.text
    versionLine.classList.toggle('warn-text', v.warn)
    markerNote.hidden = !(art && art.code.markerLeftOut)
    removeLogo.disabled = d.logo.trim().length === 0
    if (!d.logo.trim()) {
      // (dropped on this section: dropped elsewhere, a picture is read on the Scan tab, as in the PC app)
      logoNote.textContent = 'Or drop a picture here. It goes in the middle, and the dots behind it are left out.'
      logoNote.classList.remove('warn-text')
      logoRoom.textContent = ''
    } else if (art?.pictures.logoProblem) {
      logoNote.textContent = art.pictures.logoProblem
      logoNote.classList.add('warn-text')
      logoRoom.textContent = ''
    } else {
      logoNote.textContent = /^https?:\/\//i.test(d.logo.trim()) && !art?.pictures.logo ? 'Getting the picture…' : 'Logo set. Drop or paste another to change it.'
      logoNote.classList.remove('warn-text')
      logoRoom.textContent = art ? logoHint(art) : ''
    }
  }

  /** Drops pictures still being read (a design was opened, or a preset picked, in the meantime). */
  function cancelPicks(): void {
    logoTicket++
    frameTicket++
  }

  return { sections, dataBox, logoSection, show, showHints, useLogo, cancelPicks }
}

function shapeRow(label: string, shape: HTMLSelectElement, colour: HTMLInputElement): HTMLElement {
  return h('div', { class: 'row' }, h('span', { class: 'label-inline' }, label), h('span', { class: 'buttons' }, shape, colour))
}

function swatch(label: string, input: HTMLInputElement): HTMLElement {
  const id = newId('swatch')
  input.id = id
  return h('label', { class: 'swatch', for: id }, input, h('span', null, label))
}

function lengthField(label: string, box: HTMLInputElement): HTMLElement {
  return h('label', { class: 'length-field', for: box.id }, h('span', null, label), box)
}
