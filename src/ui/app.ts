// The page: the code with its scan check, what's in it and the ways to save it on one side, its
// settings in fold-out sections on the other, as b0r3d QR has always been laid out.

import cupUrl from '../../b0r3d-brand/cup.png?url'
import { captionFont, QrArt, setCanvasFamilies, type Measure, type Pictures } from '../qr/art'
import { designWarnings, EVERYTHING_LINE, infoLine, inTheCode } from '../qr/checks'
import { grouped, QrError } from '../qr/code'
import { copyDesign, plainDesign, type QrDesign } from '../qr/design'
import { DESIGN_FILE_NAME, DesignFileError, keptDesign, readDesign, writeDesign } from '../qr/design-file'
import { codeText, fileName, jpgFile, markdown, paint, pdfFile, pictureSize, pngFile, svgFile, type TextStyle } from '../qr/export'
import type { TemplateKind } from '../qr/templates'
import { makeDesigner } from './designer'
import { h } from './dom'
import { download } from './download'
import { canvasFamilies, loadFonts, PAGE_FONT } from './fonts'
import { screenIcon } from './icons'
import { pictureFor, picturesReady } from './pictures'
import { makeRecent } from './recent-ui'
import { CHECK_WORDS, ScanChecker, type CheckResult } from './scan-check'
import { makeTemplateDialog } from './templates-ui'
import { themeButton } from './theme'
import { shownVersion, versionLine } from './version'

const SOURCE_URL = 'https://github.com/still-b0r3d/qr.b0r3d.org'
const PC_URL = 'https://github.com/still-b0r3d/b0r3d-QR-PC'
const FIRST_TEXT = 'https://b0r3d.org'
/** Where this site has always kept the last design (without its text). */
const KEPT_KEY = 'qrCodeConfig'

/** Where the link to the PC app sits: at the top, in the footer, or both while that's being picked. */
type PcLinkPlacement = 'top' | 'footer' | 'both'
const PC_LINK: PcLinkPlacement = 'both'

/**
 * The design kept from the last visit, or the plain one. `readable` is false when something was
 * kept that this copy of the site can't open (a newer one's design): it's then never written over.
 */
function keptOrFirst(): { design: QrDesign; readable: boolean } {
  let kept: string | null = null
  try {
    kept = localStorage.getItem(KEPT_KEY)
  } catch {
    // the browser keeps nothing for this page
  }
  if (kept) {
    try {
      return { design: readDesign(kept, plainDesign(FIRST_TEXT)), readable: true }
    } catch {
      return { design: plainDesign(FIRST_TEXT), readable: false }
    }
  }
  return { design: plainDesign(FIRST_TEXT), readable: true }
}

export function startApp(root: HTMLElement): void {
  setCanvasFamilies(canvasFamilies)
  const start = keptOrFirst()
  let design: QrDesign = start.design
  let art: QrArt | null = null
  const checker = new ScanChecker()
  const fontsDone = new Set<string>()
  // the text exactly as a design file had it (its CR LF line breaks too), until it's edited: a
  // text box would turn every line break into a plain LF
  let openedText: string | null = null

  // how wide a caption's line is, as the page lays it out: in its own font, or the page's
  const measurer = document.createElement('canvas').getContext('2d')
  const measure: Measure = (line) => {
    if (!measurer) return 0
    const f = design.frame?.fontFamily
    measurer.font = f && f.trim() ? captionFont(f) : `18px ${PAGE_FONT}`
    return measurer.measureText(line).width
  }

  // ---------- the code ----------

  const preview = h('canvas', { class: 'preview', role: 'img', 'aria-label': 'The QR code', 'data-testid': 'preview' })
  const stageNote = h('p', { class: 'stage-note', 'data-testid': 'stage-note', hidden: true })
  const checkLine = h('p', { class: 'check', 'aria-live': 'polite', 'data-testid': 'check' })
  const warnLine = h('p', { class: 'warn', 'data-testid': 'warnings', hidden: true })
  const info = h('p', { class: 'info', 'data-testid': 'info' })
  const inCodeRows = h('dl', { class: 'in-code-rows' })
  const inCodeText = h('textarea', { class: 'in-code-text', readonly: true, rows: 3, 'aria-label': 'The text in the code' })
  const inCode = h(
    'details',
    { class: 'in-code', 'data-testid': 'in-code' },
    h('summary', null, "What's in this code"),
    inCodeRows,
    inCodeText,
    h('p', { class: 'hint' }, EVERYTHING_LINE)
  )

  const status = h('p', { class: 'status', 'aria-live': 'polite', 'data-testid': 'status' })
  let statusTimer = 0
  /** A note under the code for a moment; `after` keeps what it said before (a save's "Saved …"). */
  function say(text: string, kind: 'good' | 'warn' | 'bad', after = false): void {
    const before = after && status.textContent ? status.textContent.replace(/\.$/, '') + '. ' : ''
    status.textContent = before + text
    status.dataset.kind = kind
    clearTimeout(statusTimer)
    statusTimer = window.setTimeout(() => (status.textContent = ''), 8000)
  }

  const copyButton = h('button', { type: 'button', 'data-testid': 'copy-picture' }, 'Copy picture')
  const saveDesignButton = h('button', { type: 'button', 'data-testid': 'save-design' }, 'Save design')
  const openDesignInput = h('input', { type: 'file', accept: '.json,application/json', class: 'file-input', tabindex: -1, 'aria-hidden': 'true', 'data-testid': 'open-design-file' })
  const openDesignButton = h('button', { type: 'button', 'data-testid': 'open-design' }, 'Open design…')
  const fileBox = h('input', { id: 'file-name', type: 'text', value: 'qr-code', autocomplete: 'off', spellcheck: 'false' })
  const formats = ['png', 'jpg', 'svg', 'pdf', 'txt'] as const
  const saveButtons = Object.fromEntries(
    formats.map((f) => [f, h('button', { type: 'button', class: 'save', 'data-testid': `save-${f}` }, f.toUpperCase())])
  ) as Record<(typeof formats)[number], HTMLButtonElement>
  const sizeHint = h('p', { class: 'hint', 'data-testid': 'size-hint' })
  const exportToggle = h('button', { type: 'button', class: 'export-toggle', 'aria-expanded': 'false' }, 'Save')

  const exportBox = h(
    'section',
    { class: 'export-box', 'aria-labelledby': 'export-title' },
    h('h2', { id: 'export-title', class: 'export-title' }, 'Save the code'),
    h('label', { for: 'file-name' }, 'File name'),
    fileBox,
    h('div', { class: 'save-buttons', role: 'group', 'aria-label': 'Save as' }, ...formats.map((f) => saveButtons[f])),
    sizeHint
  )

  // Recent codes: the codes saved or copied, to open again
  const recent = makeRecent({
    open: (d) => showOpened(d),
    current: () => copyDesign(design),
    say
  })

  const codeCol = h(
    'section',
    { class: 'code-col', 'aria-label': 'Your code' },
    h('div', { class: 'stage' }, preview, stageNote),
    h('div', { class: 'readout' }, checkLine, warnLine, info),
    inCode,
    h('div', { class: 'actions' }, copyButton, saveDesignButton, h('span', { class: 'file-button' }, openDesignButton, openDesignInput), recent.button),
    status,
    recent.note,
    exportToggle,
    exportBox
  )

  // the "Data to encode" window, opened from the Data section's templates
  const templateDialog = makeTemplateDialog()

  // ---------- the settings ----------

  const designer = makeDesigner(
    {
      get design() {
        return design
      },
      art: () => art,
      changed: () => {
        changedByVisitor = true
        update()
      },
      replace: (d) => {
        changedByVisitor = true
        designer.cancelPicks()
        design = d
        designer.show()
        update()
      },
      say,
      template: (kind) => void askTemplate(kind),
      useText: (text) => {
        setText(text)
        designer.dataBox.focus()
        designer.dataBox.setSelectionRange(text.length, text.length)
      }
    },
    design.data
  )
  const settings = h('section', { class: 'settings', 'aria-label': 'Settings' }, ...designer.sections)

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
  const version = import.meta.env.VITE_APP_VERSION
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
    h(
      'p',
      { class: 'privacy' },
      'The app loads nothing from any other site, except a logo from a web address you give it, and what you type stays in your browser. Like the rest of b0r3d.org, the site counts visits.'
    ),
    h('a', { class: 'back-link', href: 'https://b0r3d.org' }, '← b0r3d.org'),
    h(
      'p',
      { class: 'version', 'data-testid': 'app-version' },
      versionLine(version, commit),
      ' · ',
      h('a', { href: SOURCE_URL }, 'Source'),
      ' · ',
      h('a', { href: './LICENSE.txt' }, 'Licence'),
      ' · ',
      h('a', { href: './THIRD-PARTY-NOTICES.txt' }, 'Notices')
    )
  )

  // the code as text, three ways, to copy or save
  const textDialog = makeTextDialog()

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
    footer,
    textDialog.el,
    templateDialog.el,
    recent.dialog
  )
  document.documentElement.dataset.pcLink = PC_LINK

  // ---------- drawing ----------

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
    const docked = codeCol.classList.contains('docked')
    const box = docked ? 120 : 240
    let width: number
    let height: number
    if (!art.design.frame && art.design.borderRadius <= 0) {
      // whole screen pixels per module where it fits, so every square is sharp
      const modules = art.code.size + 2 * art.margin
      const per = Math.max(1, Math.floor((box * dpr) / modules))
      width = height = Math.max(1, Math.round(per * modules))
    } else {
      // a frame fits the box's width, and a little more height on a desk (none in the phone's bar)
      const fit = Math.min((box * dpr) / art.W, ((docked ? box : box * 1.4) * dpr) / art.H)
      width = Math.max(1, Math.round(art.W * fit))
      height = Math.max(1, Math.round(art.H * fit))
    }
    preview.width = width
    preview.height = height
    preview.style.width = `${width / dpr}px`
    preview.style.height = `${height / dpr}px`
    paint(ctx, art, width / art.W, width, height)
  }

  let pending = 0
  function drawSoon(): void {
    if (pending) return
    pending = requestAnimationFrame(() => {
      pending = 0
      update()
    })
  }

  function picturesNow(): Pictures {
    const logo = pictureFor(design.logo, drawSoon)
    const frame = design.frame?.backgroundImage ? pictureFor(design.frame.backgroundImage, drawSoon) : { picture: null, problem: null }
    return { logo: logo.picture, logoProblem: logo.problem, frame: frame.picture, frameProblem: frame.problem }
  }

  // a caption's web font, fetched for its text, then drawn again
  function fontsNow(): void {
    const f = design.frame
    if (!f?.fontFamily) return
    const key = f.fontFamily + '\n' + f.text
    if (fontsDone.has(key)) return
    fontsDone.add(key)
    void loadFonts(f.fontFamily, f.text).then(drawSoon)
  }

  // The design is kept a moment after each change (a logo can make it big), and at once when the
  // page is left. Only once the visitor has changed something, and never over a kept design this
  // copy of the site couldn't read (a newer copy's, met offline): that stays as it is.
  let keepTimer = 0
  let changedByVisitor = false
  function keepNow(): void {
    clearTimeout(keepTimer)
    keepTimer = 0
    try {
      localStorage.setItem(KEPT_KEY, keptDesign(design))
    } catch {
      // private browsing, or a logo too big to keep: the design just isn't kept
    }
  }
  function keepDesign(): void {
    if (!changedByVisitor || !start.readable) return
    clearTimeout(keepTimer)
    keepTimer = window.setTimeout(keepNow, 300)
  }
  window.addEventListener('pagehide', () => {
    if (keepTimer) keepNow()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && keepTimer) keepNow()
  })

  /** The text to encode: the box's, or an opened design's exactly while the box shows it unedited. */
  function textNow(): string {
    const typed = designer.dataBox.value
    if (openedText !== null && typed === openedText.replace(/\r\n?/g, '\n')) return openedText
    openedText = null
    return typed
  }

  function update(): void {
    design.data = textNow()
    fontsNow()
    const pictures = picturesNow()
    try {
      art = new QrArt(design, pictures)
    } catch (e) {
      art = null
      stageNote.textContent = e instanceof QrError ? e.message : "Couldn't make the code."
      stageNote.dataset.problem = String(!(e instanceof QrError) || design.data.length > 0)
    }
    keepDesign()
    designer.showHints()
    for (const b of [...Object.values(saveButtons), copyButton]) b.disabled = art === null
    if (!art) {
      checker.cancel()
      preview.hidden = true
      stageNote.hidden = false
      checkLine.textContent = ''
      delete checkLine.dataset.result
      warnLine.hidden = true
      info.textContent = ''
      inCode.hidden = true
      sizeHint.textContent = 'Saved pictures come out at the picture size.'
      return
    }
    preview.hidden = false
    stageNote.hidden = true
    inCode.hidden = false
    renderPreview()
    info.textContent = infoLine(art)
    const warnings = designWarnings(design)
    if (pictures.logoProblem) warnings.unshift("The logo isn't drawn. " + pictures.logoProblem)
    if (pictures.frameProblem) warnings.unshift("The frame's picture isn't drawn. " + pictures.frameProblem)
    warnLine.textContent = warnings.map((w) => '⚠ ' + w).join('\n')
    warnLine.hidden = warnings.length === 0
    inCodeRows.replaceChildren(...inTheCode(art).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))
    inCodeText.value = art.code.text
    const size = pictureSize(art, measure)
    sizeHint.textContent =
      `PNG and JPG: ${grouped(size.width)} × ${grouped(size.height)} pixels. PDF: that size on paper (96 pixels ` +
      'to the inch), drawn at up to 300 dots an inch. SVG: drawn as shapes, sharp at any size.'
    showCheck('checking')
    checker.check(art, showCheck)
  }

  // ---------- saving ----------

  /** The design drawn once its own pictures and its caption's font are here. */
  async function readyArt(): Promise<QrArt | null> {
    await picturesReady([design.logo, design.frame?.backgroundImage])
    const f = design.frame
    if (f?.fontFamily) await loadFonts(f.fontFamily, f.text)
    update()
    return art
  }

  const producer = `b0r3d QR ${shownVersion(version).slice(1)}`
  let saving = false

  async function save(kind: (typeof formats)[number]): Promise<void> {
    if (kind === 'txt') {
      if (art) textDialog.open()
      return
    }
    if (saving) return
    saving = true
    try {
      const ready = await readyArt()
      if (!ready) return
      const shown = copyDesign(ready.design)
      const name = fileName(fileBox.value, kind)
      const blob =
        kind === 'png'
          ? await pngFile(ready, measure)
          : kind === 'jpg'
            ? await jpgFile(ready, measure)
            : kind === 'svg'
              ? svgFile(ready)
              : await pdfFile(ready, measure, name.replace(/\.pdf$/, ''), producer)
      download(blob, name)
      say(`Saved ${name}`, 'good')
      void recent.remember(shown, ready)
    } catch (e) {
      say(`Couldn't save the file: ${e instanceof Error ? e.message : 'something went wrong'}`, 'bad')
    } finally {
      saving = false
    }
  }
  for (const f of formats) saveButtons[f].addEventListener('click', () => void save(f))

  copyButton.addEventListener('click', () => {
    if (!art || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      say("This browser doesn't let a page copy pictures. Save the PNG instead.", 'warn')
      return
    }
    // the picture is made after the click, which some browsers ask for
    let copied: { design: QrDesign; art: QrArt } | null = null
    const png = readyArt().then((ready) => {
      if (!ready) throw new Error('no code')
      copied = { design: copyDesign(ready.design), art: ready }
      return pngFile(ready, measure)
    })
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(
      () => {
        say('Copied the code as a picture.', 'good')
        if (copied) void recent.remember(copied.design, copied.art)
      },
      () => say("The browser didn't let the page copy the picture. Save the PNG instead.", 'warn')
    )
  })

  saveDesignButton.addEventListener('click', () => {
    download(new Blob([writeDesign(design)], { type: 'application/json' }), DESIGN_FILE_NAME)
    say(`Saved ${DESIGN_FILE_NAME}`, 'good')
    // a design saved with text in it goes to Recent codes too
    void recent.remember(copyDesign(design), art)
  })
  openDesignButton.addEventListener('click', () => openDesignInput.click())
  openDesignInput.addEventListener('change', () => {
    const file = openDesignInput.files?.[0]
    openDesignInput.value = ''
    if (file) void openDesign(file)
  })

  async function openDesign(file: File): Promise<void> {
    if (file.size > 50 * 1024 * 1024) {
      say('That file is too big to be a b0r3d QR design.', 'bad')
      return
    }
    try {
      showOpened(readDesign(await file.text(), copyDesign(design)))
      say(`Opened ${file.name}`, 'good')
    } catch (e) {
      say(e instanceof DesignFileError ? e.message : `Couldn't open ${file.name}.`, 'bad')
    }
  }

  /** A design opened (from a file or Recent codes) into the page, its text exactly as it was. */
  function showOpened(d: QrDesign): void {
    changedByVisitor = true
    designer.cancelPicks()
    design = d
    designer.show()
    openedText = d.data
    update()
  }

  /**
   * New text in the Data box, from a template's form or a check's fix: exactly as written (its
   * CR LF line breaks too) until it's edited, as an opened design's is.
   */
  function setText(text: string): void {
    designer.dataBox.value = text
    openedText = text
    changedByVisitor = true
    update()
  }

  /** The "Data to encode" window for a template; what it writes becomes the code's text. */
  async function askTemplate(kind: TemplateKind): Promise<void> {
    const written = await templateDialog.ask(kind, textNow())
    // cancelled, or nothing written: the text stays (an empty one never goes over it)
    if (written) setText(written)
    else designer.showHints()
  }

  // a picture dropped anywhere on the page is the logo; a design file opens
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  })
  document.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    e.preventDefault()
    if (/\.json$/i.test(file.name) || file.type === 'application/json') void openDesign(file)
    else if (file.type.startsWith('image/') || /\.svg$/i.test(file.name)) void designer.useLogo(file, file.name)
    else say('Drop a picture for the logo, or a design file to open it.', 'warn')
  })

  function makeTextDialog() {
    const kinds: { value: TextStyle; label: string }[] = [
      { value: 'half', label: 'Half blocks, compact' },
      { value: 'full', label: 'Full blocks' },
      { value: 'ascii', label: 'ASCII, # for the background' }
    ]
    const radios = kinds.map((k, i) => h('input', { type: 'radio', name: 'text-kind', value: k.value, checked: i === 0 }))
    const asMarkdown = h('input', { type: 'checkbox' })
    const note = h('p', { class: 'hint warn-text', hidden: true }, "Most scanners can't read the ASCII kind: it's for plain text, email and terminals.")
    const sample = h('pre', { class: 'text-sample', 'aria-label': 'The code as text' })
    const copy = h('button', { type: 'button' }, 'Copy')
    const saveText = h('button', { type: 'button' }, 'Save')
    const close = h('button', { type: 'button' }, 'Close')
    const dialog = h(
      'dialog',
      { class: 'text-dialog', 'aria-labelledby': 'text-title', 'data-testid': 'text-dialog' },
      h('h2', { id: 'text-title' }, 'The code as text'),
      h('div', { class: 'text-kinds' }, ...kinds.map((k, i) => h('label', { class: 'check-row' }, radios[i], ' ' + k.label))),
      h('label', { class: 'check-row' }, asMarkdown, ' In a Markdown code block'),
      note,
      sample,
      h('div', { class: 'buttons' }, copy, saveText, close)
    )
    const chosen = (): TextStyle => (radios.find((r) => r.checked)?.value as TextStyle) ?? 'half'
    const text = () => {
      if (!art) return ''
      const t = codeText(design, chosen(), art.levelUsed)
      return asMarkdown.checked ? markdown(t) : t
    }
    const refresh = () => {
      note.hidden = chosen() !== 'ascii'
      sample.textContent = art ? codeText(design, chosen(), art.levelUsed) : ''
    }
    for (const r of radios) r.addEventListener('change', refresh)
    copy.addEventListener('click', () => {
      navigator.clipboard?.writeText(text()).then(
        () => say('Copied the code as text.', 'good'),
        () => say("The browser didn't let the page copy the text.", 'warn')
      )
      dialog.close()
    })
    saveText.addEventListener('click', () => {
      const name = fileName(fileBox.value, asMarkdown.checked ? 'md' : 'txt')
      download(new Blob([text()], { type: asMarkdown.checked ? 'text/markdown' : 'text/plain' }), name)
      say(`Saved ${name}`, 'good')
      dialog.close()
    })
    close.addEventListener('click', () => dialog.close())
    return {
      el: dialog,
      open: () => {
        refresh()
        dialog.showModal()
      }
    }
  }

  // ---------- around the code ----------

  designer.dataBox.addEventListener('input', () => {
    changedByVisitor = true
    update()
  })

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

  // on phones the code sits in a bar at the bottom of the screen while the settings scroll; the
  // page keeps room for the bar under its last line, however tall the bar is
  const phone = matchMedia('(max-width: 899px)')
  phone.addEventListener('change', () => {
    codeCol.classList.toggle('docked', phone.matches)
    renderPreview()
  })
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const docked = codeCol.classList.contains('docked')
      root.style.setProperty('--dock-room', docked ? `${Math.ceil(codeCol.getBoundingClientRect().height) + 16}px` : '0px')
    }).observe(codeCol)
  }
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

  codeCol.classList.toggle('docked', phone.matches)
  designer.show()
  update()
}
