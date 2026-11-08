// The page: the code with its scan check and saving on one side, its settings in fold-out sections
// on the other, as b0r3d QR has always been laid out.

import cupUrl from '../../b0r3d-brand/cup.png?url'
import { QrArt } from '../qr/art'
import { infoLine, levelHint, warnings } from '../qr/checks'
import { grouped, QrError } from '../qr/code'
import { plainDesign, type QrDesign } from '../qr/design'
import { fileName, paint, pictureSize, pngFile, svgFile } from '../qr/export'
import type { QrLevel } from '../qr/tables'
import { h, section, segmented } from './dom'
import { download } from './download'
import { screenIcon } from './icons'
import { CHECK_WORDS, ScanChecker, type CheckResult } from './scan-check'
import { themeButton } from './theme'
import { versionLine } from './version'

const SOURCE_URL = 'https://github.com/still-b0r3d/qr.b0r3d.org'
const PC_URL = 'https://github.com/still-b0r3d/b0r3d-QR-PC'
const FIRST_TEXT = 'https://b0r3d.org'

/** Where the link to the PC app sits: at the top, in the footer, or both while that's being picked. */
type PcLinkPlacement = 'top' | 'footer' | 'both'
const PC_LINK: PcLinkPlacement = 'both'

const SIZE = { min: 50, max: 4000 }
const QUIET = { min: 0, max: 20 }

const LEVEL_BUTTONS: { value: QrLevel; text: string; name: string }[] = [
  { value: 'L', text: 'L', name: 'Level L, low' },
  { value: 'M', text: 'M', name: 'Level M, medium' },
  { value: 'Q', text: 'Q', name: 'Level Q, high' },
  { value: 'H', text: 'H', name: 'Level H, highest' }
]

export function startApp(root: HTMLElement): void {
  const design: QrDesign = plainDesign(FIRST_TEXT)
  let art: QrArt | null = null
  const checker = new ScanChecker()

  // ---------- the code ----------

  const preview = h('canvas', { class: 'preview', role: 'img', 'aria-label': 'The QR code', 'data-testid': 'preview' })
  const stageNote = h('p', { class: 'stage-note', 'data-testid': 'stage-note', hidden: true })
  const checkLine = h('p', { class: 'check', 'aria-live': 'polite', 'data-testid': 'check' })
  const warnLine = h('p', { class: 'warn', 'data-testid': 'warnings', hidden: true })
  const info = h('p', { class: 'info', 'data-testid': 'info' })
  const fileBox = h('input', { id: 'file-name', type: 'text', value: 'qr-code', autocomplete: 'off', spellcheck: 'false' })
  const pngButton = h('button', { type: 'button', class: 'save', 'data-testid': 'save-png' }, 'PNG')
  const svgButton = h('button', { type: 'button', class: 'save', 'data-testid': 'save-svg' }, 'SVG')
  const sizeHint = h('p', { class: 'hint', 'data-testid': 'size-hint' })
  const saveNote = h('p', { class: 'warn', 'data-testid': 'save-note', hidden: true })
  const exportToggle = h('button', { type: 'button', class: 'export-toggle', 'aria-expanded': 'false' }, 'Save')

  const exportBox = h(
    'section',
    { class: 'export-box', 'aria-labelledby': 'export-title' },
    h('h2', { id: 'export-title', class: 'export-title' }, 'Save the code'),
    h('label', { for: 'file-name' }, 'File name'),
    fileBox,
    h('div', { class: 'save-buttons', role: 'group', 'aria-label': 'Save as' }, pngButton, svgButton),
    sizeHint,
    saveNote
  )

  const codeCol = h(
    'section',
    { class: 'code-col', 'aria-label': 'Your code' },
    h('div', { class: 'stage' }, preview, stageNote),
    h('div', { class: 'readout' }, checkLine, warnLine, info),
    exportToggle,
    exportBox
  )

  // ---------- the settings ----------

  const dataBox = h('textarea', {
    id: 'data',
    rows: 4,
    placeholder: 'Type or paste a link, or any text',
    'aria-label': 'Data',
    spellcheck: 'false'
  })
  dataBox.value = design.data

  const levels = segmented('Error correction', LEVEL_BUTTONS, (level) => {
    design.level = level
    levels.set(level)
    update()
  })
  const levelHintLine = h('p', { class: 'hint', 'data-testid': 'level-hint' })

  const quietBox = h('input', {
    id: 'quiet-zone',
    type: 'number',
    min: QUIET.min,
    max: QUIET.max,
    step: 0.1,
    inputmode: 'decimal'
  })
  quietBox.value = String(design.margin)
  const sizeBox = h('input', { id: 'picture-size', type: 'number', min: SIZE.min, max: SIZE.max, step: 50, inputmode: 'numeric' })
  sizeBox.value = String(Math.max(design.width, design.height))

  const settings = h(
    'section',
    { class: 'settings', 'aria-label': 'Settings' },
    section('Data', true, dataBox),
    section(
      'Size and print',
      true,
      h('p', { class: 'label', id: 'level-label' }, 'Error correction'),
      levels.el,
      levelHintLine,
      h('div', { class: 'row' }, h('label', { for: 'quiet-zone' }, 'Quiet zone (modules)'), quietBox),
      h('p', { class: 'hint' }, '4 is the standard (ISO/IEC 18004): scanners need blank space around a code to find it.'),
      h('div', { class: 'row' }, h('label', { for: 'picture-size' }, 'Picture size (px)'), sizeBox)
    )
  )

  // ---------- the page ----------

  const pcTop = h('a', { class: 'pc-link pc-link-top', href: PC_URL, 'data-testid': 'pc-link-top' }, screenIcon(), 'Get it for Windows')
  const createTab = h('button', { type: 'button', role: 'tab', id: 'tab-create', class: 'tab', 'aria-selected': 'true', 'aria-controls': 'panel-create' }, 'Create')
  const scanTab = h('button', { type: 'button', role: 'tab', id: 'tab-scan', class: 'tab', 'aria-selected': 'false', 'aria-controls': 'panel-scan' }, 'Scan')
  const createPanel = h('main', { class: 'layout', id: 'panel-create', role: 'tabpanel', 'aria-labelledby': 'tab-create' }, codeCol, settings)
  const scanPanel = h(
    'main',
    { class: 'scan-panel', id: 'panel-scan', role: 'tabpanel', 'aria-labelledby': 'tab-scan', hidden: true },
    h('p', null, 'Reading codes from a picture, the clipboard or a camera comes back in a later step of the rebuild.')
  )

  const commit = import.meta.env.VITE_BUILD_COMMIT
  const footer = h(
    'footer',
    { class: 'app-footer' },
    h(
      'p',
      { class: 'pc-link-footer', 'data-testid': 'pc-link-footer' },
      'Also for Windows: ',
      h('a', { href: PC_URL }, 'b0r3d QR for PC'),
      ', the same codes as a program that never goes online.'
    ),
    h('p', { class: 'privacy' }, 'The app loads nothing from any other site, and what you type stays in your browser. Like the rest of b0r3d.org, the site counts visits.'),
    h('a', { class: 'back-link', href: 'https://b0r3d.org' }, '← b0r3d.org'),
    h(
      'p',
      { class: 'version', 'data-testid': 'app-version' },
      versionLine(import.meta.env.VITE_APP_VERSION, commit),
      ' · ',
      h('a', { href: SOURCE_URL }, 'Source'),
      ' · ',
      h('a', { href: './LICENSE.txt' }, 'Licence'),
      ' · ',
      h('a', { href: './THIRD-PARTY-NOTICES.txt' }, 'Notices')
    )
  )

  root.replaceChildren(
    h(
      'header',
      { class: 'top' },
      h('a', { class: 'brand', href: './' }, h('img', { src: cupUrl, alt: '', width: 40, height: 40 }), h('h1', { class: 'brand-title' }, 'b0r3d QR')),
      h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Make or read codes' }, createTab, scanTab),
      h('div', { class: 'top-right' }, pcTop, themeButton())
    ),
    h('p', { class: 'banner' }, 'Static codes: nothing expires, nothing is sent anywhere.'),
    createPanel,
    scanPanel,
    footer
  )
  document.documentElement.dataset.pcLink = PC_LINK

  // ---------- what happens ----------

  function showCheck(result: CheckResult | 'checking'): void {
    const kind = result === 'checking' ? 'checking' : result.kind
    checkLine.dataset.result = kind
    checkLine.textContent = CHECK_WORDS[kind] + (result !== 'checking' && result.kind === 'mismatch' ? result.read : '')
  }

  function renderPreview(): void {
    if (!art) return
    const ctx = preview.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const box = codeCol.classList.contains('docked') ? 120 : 240
    // whole screen pixels per module where it fits, so every square is sharp
    const modules = art.code.size + 2 * art.margin
    const per = Math.max(1, Math.floor((box * dpr) / modules))
    const side = Math.max(1, Math.round(per * modules))
    preview.width = side
    preview.height = side
    preview.style.width = `${side / dpr}px`
    preview.style.height = `${side / dpr}px`
    paint(ctx, art, side / art.S, side, side)
  }

  function update(): void {
    design.data = dataBox.value
    try {
      art = new QrArt(design)
    } catch (e) {
      art = null
      stageNote.textContent = e instanceof QrError ? e.message : "Couldn't make the code."
      stageNote.dataset.problem = String(!(e instanceof QrError) || design.data.length > 0)
    }
    levelHintLine.textContent = levelHint(design.level, design.data)
    pngButton.disabled = svgButton.disabled = art === null
    saveNote.hidden = true
    if (!art) {
      checker.cancel()
      preview.hidden = true
      stageNote.hidden = false
      checkLine.textContent = ''
      delete checkLine.dataset.result
      warnLine.hidden = true
      info.textContent = ''
      sizeHint.textContent = 'Saved pictures come out at the picture size.'
      return
    }
    preview.hidden = false
    stageNote.hidden = true
    renderPreview()
    info.textContent = infoLine(art)
    const warned = warnings(design.margin)
    warnLine.textContent = warned.map((w) => '⚠ ' + w).join('\n')
    warnLine.hidden = warned.length === 0
    const size = pictureSize(art)
    sizeHint.textContent = `PNG: ${grouped(size.width)} × ${grouped(size.height)} pixels. SVG: drawn as shapes, sharp at any size.`
    showCheck('checking')
    checker.check(art, showCheck)
  }

  function numberFrom(box: HTMLInputElement, limits: { min: number; max: number }): number | null {
    const v = box.valueAsNumber
    return Number.isFinite(v) && v >= limits.min && v <= limits.max ? v : null
  }

  dataBox.addEventListener('input', update)
  quietBox.addEventListener('input', () => {
    const v = numberFrom(quietBox, QUIET)
    if (v === null) return
    design.margin = v
    update()
  })
  quietBox.addEventListener('change', () => {
    const v = quietBox.valueAsNumber
    design.margin = Number.isFinite(v) ? Math.min(QUIET.max, Math.max(QUIET.min, v)) : design.margin
    quietBox.value = String(design.margin)
    update()
  })
  sizeBox.addEventListener('input', () => {
    const v = numberFrom(sizeBox, SIZE)
    if (v === null) return
    design.width = design.height = v
    update()
  })
  sizeBox.addEventListener('change', () => {
    const v = sizeBox.valueAsNumber
    const side = Number.isFinite(v) ? Math.min(SIZE.max, Math.max(SIZE.min, Math.round(v))) : Math.max(design.width, design.height)
    design.width = design.height = side
    sizeBox.value = String(side)
    update()
  })

  async function save(kind: 'png' | 'svg'): Promise<void> {
    if (!art) return
    try {
      const blob = kind === 'png' ? await pngFile(art) : svgFile(art)
      download(blob, fileName(fileBox.value, kind))
    } catch (e) {
      saveNote.textContent = '⚠ ' + (e instanceof Error ? e.message : "Couldn't save the file.")
      saveNote.hidden = false
    }
  }
  pngButton.addEventListener('click', () => void save('png'))
  svgButton.addEventListener('click', () => void save('svg'))

  exportToggle.addEventListener('click', () => {
    const open = exportToggle.getAttribute('aria-expanded') !== 'true'
    exportToggle.setAttribute('aria-expanded', String(open))
    codeCol.classList.toggle('export-open', open)
  })

  function pickTab(tab: 'create' | 'scan'): void {
    createTab.setAttribute('aria-selected', String(tab === 'create'))
    scanTab.setAttribute('aria-selected', String(tab === 'scan'))
    createPanel.hidden = tab !== 'create'
    scanPanel.hidden = tab !== 'scan'
  }
  createTab.addEventListener('click', () => pickTab('create'))
  scanTab.addEventListener('click', () => pickTab('scan'))

  // on phones the code sits in a bar at the bottom of the screen while the settings scroll
  const phone = matchMedia('(max-width: 899px)')
  const dock = () => {
    codeCol.classList.toggle('docked', phone.matches)
    renderPreview()
  }
  phone.addEventListener('change', dock)
  // drawn again for a screen with other scaling (a window moved to another monitor)
  const watchScaling = () =>
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        renderPreview()
        watchScaling()
      },
      { once: true }
    )
  watchScaling()

  levels.set(design.level)
  codeCol.classList.toggle('docked', phone.matches)
  update()
}
