// The Scan tab, as b0r3d QR for PC has it (without its screen and folder scans, which a page can't
// do): reading codes with the camera and from pictures (opened, pasted, dropped anywhere on the page,
// or Ctrl+V with a picture copied), with Cancel (Esc) while it reads. Every code found gets a card:
// where it was, what it is, what it holds, and Copy text, Open link… (after a question that shows
// where it goes) and Make this code again. Pictures never leave the browser.

import { linkWarnings, webLink } from '../qr/kinds'
import { filesSummary, inReadingOrder, labelOf, pictureSummary, problemLine, scannedCode, summaryOf, type ScannedCode } from '../qr/scanned'
import { makeCamera } from './camera'
import { h } from './dom'
import { PictureProblem, PictureReader, ReaderUnavailable, ReadStopped, pictureFrom, pixelsOf, thumbnailOf } from './picture-reader'
import { clipboardPicture } from './pictures'

export interface ScanHost {
  /** The Scan tab on show (a read started from elsewhere: a drop, Ctrl+V). */
  showTab(): void
  /** The Create tab with a scanned code made again. */
  makeAgain(code: ScannedCode): void
}

export interface ScanTab {
  /** the two columns: where to read from, and what was found */
  readonly columns: HTMLElement[]
  readonly dialogs: HTMLElement[]
  /** reading now (a new read waits until it's done or cancelled) */
  readonly busy: boolean
  /** Pictures from files; `folders` are ones that turned out to be folders (dropped). */
  readFiles(files: File[], folders?: ReadonlySet<File>): void
  /** A picture with no file name of its own: the copied picture. */
  readCopied(picture: Blob): void
  /** Stops a read; false when none was going on. */
  cancel(): boolean
}

/** the most lines shown at once */
export const MAX_SHOWN = 500
const NOTHING_COPIED = 'Nothing to read on the clipboard: copy a picture first.'

interface Shown {
  code: ScannedCode
  thumbnail?: string
}

interface Run {
  stopped: boolean
}

export function makeScanTab(host: ScanHost): ScanTab {
  const reader = new PictureReader()

  // ---------- where to read from ----------

  const cameraButton = h('button', { type: 'button', class: 'wide', 'data-testid': 'scan-camera' }, 'Scan with the camera')
  const openInput = h('input', { type: 'file', accept: 'image/*,.svg,.heic,.heif,.pdf', multiple: true, class: 'file-input', tabindex: -1, 'aria-hidden': 'true', 'data-testid': 'scan-open-file' })
  const openButton = h('button', { type: 'button', class: 'wide', 'data-testid': 'scan-open' }, 'Open picture…')
  const pasteButton = h('button', { type: 'button', class: 'wide', 'data-testid': 'scan-paste' }, 'Paste picture')
  const sources = h(
    'section',
    { class: 'scan-sources', 'aria-label': 'Read codes' },
    h('p', { class: 'hint lead' }, 'Read QR codes and barcodes. Pictures stay in your browser.'),
    h('h2', { class: 'scan-heading' }, 'With a camera'),
    cameraButton,
    h('p', { class: 'hint' }, 'Hold a code up to your camera. The first one it sees is read, then the camera goes off. Nothing it sees is saved.'),
    h('h2', { class: 'scan-heading' }, 'From pictures'),
    h('span', { class: 'file-button wide' }, openButton, openInput),
    pasteButton,
    h(
      'p',
      { class: 'hint' },
      'Or drop pictures anywhere on this page, or press Ctrl+V with a picture copied. PNG, JPEG, GIF, BMP and WebP, and other kinds your browser can open. For a PDF, open it and take a screenshot of the code.'
    )
  )

  // ---------- what was found ----------

  // (it takes the keys when what had them is gone: the Create tab's box after Ctrl+V, Cancel once done)
  const status = h('p', { class: 'scan-status', 'aria-live': 'polite', tabindex: -1, 'data-testid': 'scan-status' })
  const cancelButton = h('button', { type: 'button', hidden: true, title: 'Stop reading (Esc)', 'data-testid': 'scan-cancel' }, 'Cancel')
  const clearButton = h('button', { type: 'button', 'data-testid': 'scan-clear' }, 'Clear')
  const note = h('p', { class: 'hint scan-note', 'aria-live': 'polite', 'data-testid': 'scan-note' })
  const list = h('ul', { class: 'found-list', 'aria-label': 'Codes found', 'data-testid': 'found-list' })
  const emptyHint = h('p', { class: 'found-hint' }, 'Codes you read show up here.')
  const results = h(
    'section',
    { class: 'scan-results', 'aria-label': 'What was read' },
    h('div', { class: 'scan-head' }, status, h('span', { class: 'buttons' }, cancelButton, clearButton)),
    note,
    h('div', { class: 'found-stage' }, list, emptyHint)
  )

  // ---------- opening a link ----------

  const linkUrl = h('p', { class: 'link-url', 'data-testid': 'link-url' })
  const linkWarningsList = h('ul', { class: 'link-warnings warn-text', 'data-testid': 'link-warnings' })
  const linkOpen = h('button', { type: 'button', 'data-testid': 'link-open' }, 'Open')
  const linkCancel = h('button', { type: 'button' }, 'Cancel')
  const linkDialog = h(
    'dialog',
    { class: 'link-dialog', 'aria-labelledby': 'link-title', 'data-testid': 'link-dialog' },
    h('h2', { id: 'link-title' }, 'Open link'),
    h('p', null, 'Open this link in a new tab?'),
    linkUrl,
    linkWarningsList,
    h('div', { class: 'buttons dialog-foot' }, linkOpen, linkCancel)
  )
  let linkHref = ''
  linkOpen.addEventListener('click', () => {
    linkDialog.close()
    if (linkHref) window.open(linkHref, '_blank', 'noopener,noreferrer')
  })
  linkCancel.addEventListener('click', () => linkDialog.close())

  function askOpen(text: string): void {
    const link = webLink(text)
    if (!link) return
    linkHref = link.url.href
    linkUrl.textContent = link.url.href
    const warnings = linkWarnings(link)
    linkWarningsList.replaceChildren(...warnings.map((w) => h('li', null, w)))
    linkWarningsList.hidden = warnings.length === 0
    linkDialog.classList.toggle('odd', warnings.length > 0)
    linkDialog.showModal()
    linkCancel.focus()
  }

  // ---------- the cards ----------

  function card(s: Shown): HTMLElement {
    const c = s.code
    const label = labelOf(c)
    const words = h(
      'div',
      { class: 'found-words' },
      h('p', { class: c.isProblem ? 'found-kind warn-text' : 'found-kind' }, c.kind),
      h('p', { class: 'hint found-summary' }, summaryOf(c))
    )
    if (c.text.length > 0) {
      const text = h('textarea', { class: 'found-text', readonly: true, rows: Math.min(5, Math.max(1, c.text.split('\n').length)), 'aria-label': 'What the code holds', spellcheck: 'false' })
      text.value = c.text
      words.append(text)
    }
    if (!c.isProblem) {
      const copy = h('button', { type: 'button', class: 'small', 'aria-label': `Copy text (${label})` }, 'Copy text')
      copy.addEventListener('click', () => {
        if (!navigator.clipboard?.writeText) {
          say("This browser doesn't let a page copy text here.")
          return
        }
        navigator.clipboard.writeText(c.text).then(
          () => say('Copied what the code holds'),
          () => say("The browser didn't let the page copy the text.")
        )
      })
      const buttons = h('div', { class: 'buttons found-buttons' }, copy)
      if (c.isWebLink) {
        const open = h('button', { type: 'button', class: 'small', 'aria-label': `Open link (${label})` }, 'Open link…')
        open.addEventListener('click', () => askOpen(c.text))
        buttons.append(open)
      }
      if (c.canMakeAgain) {
        const again = h('button', { type: 'button', class: 'small', 'aria-label': `Make this code again (${label})` }, 'Make this code again')
        again.addEventListener('click', () => host.makeAgain(c))
        buttons.append(again)
      }
      words.append(buttons)
    }
    const picture = s.thumbnail
      ? h('div', { class: 'found-picture', title: c.isProblem ? 'The picture' : 'Where the code was found' }, h('img', { src: s.thumbnail, alt: '' }))
      : null
    return h('li', { class: 'found-card', 'aria-label': label }, picture, words)
  }

  function show(lines: Shown[]): void {
    list.replaceChildren(...lines.slice(0, MAX_SHOWN).map(card))
    emptyHint.hidden = lines.length > 0
  }

  // ---------- reading ----------

  let current: Run | null = null

  function setStatus(text: string, kind: 'text' | 'warn' | 'dim'): void {
    status.textContent = text
    status.dataset.kind = kind
  }

  let noteTimer = 0
  function say(text: string): void {
    note.textContent = text
    clearTimeout(noteTimer)
    noteTimer = window.setTimeout(() => (note.textContent = ''), 6000)
  }

  function showBusy(on: boolean): void {
    const hadKeys = cancelButton.contains(document.activeElement)
    cancelButton.hidden = !on
    clearButton.disabled = on
    for (const b of [cameraButton, openButton, pasteButton]) b.disabled = on
    // the keys go on from Clear when Cancel goes
    if (hadKeys && !on) clearButton.focus()
  }

  function begin(busy: string): Run {
    const run: Run = { stopped: false }
    current = run
    host.showTab()
    show([])
    note.textContent = ''
    setStatus(busy, 'text')
    showBusy(true)
    const keys = document.activeElement
    if (!keys || keys === document.body || (keys as HTMLElement).offsetParent === null) status.focus()
    return run
  }

  function finish(run: Run, lines: Shown[], summary: string, kind: 'text' | 'warn' | null = null): void {
    if (current !== run) return
    current = null
    reader.release()
    showBusy(false)
    show(lines)
    const any = lines.some((l) => !l.code.isProblem)
    setStatus(summary + (lines.length > MAX_SHOWN ? ` (the first ${MAX_SHOWN} lines are shown)` : ''), kind ?? (any ? 'text' : 'warn'))
  }

  /** the codes in a picture, in reading order, each with its thumbnail */
  async function codesIn(canvas: HTMLCanvasElement, source: string): Promise<Shown[]> {
    const found = await reader.read(pixelsOf(canvas), 'all')
    return inReadingOrder(found.map((f) => scannedCode(f, source, canvas.width, canvas.height))).map((code) => ({ code, thumbnail: thumbnailOf(canvas, code.box) }))
  }

  /** what went wrong, in a few words: the browser's own, quoted once */
  const said = (e: unknown): string => (e instanceof Error ? e.message : String(e)).trim().replace(/\.$/, '')
  /** why a picture file couldn't be opened, as the PC app says it ("Windows couldn't read it (…)") */
  const why = (e: unknown): string => (e instanceof PictureProblem ? e.message : `the browser couldn't read it (${said(e)})`)

  async function readFiles(files: File[], folders: ReadonlySet<File> = new Set()): Promise<void> {
    if (current || files.length === 0) return
    const run = begin('Opening…')
    const batch = files.length > 1
    const lines: Shown[] = []
    const tally: { name: string; codes: number; problem: string | null }[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      let canvas: HTMLCanvasElement | null = null
      try {
        if (folders.has(file)) throw new PictureProblem("it's a folder, so open the pictures in it instead")
        canvas = await pictureFrom(file, file.name)
        if (run.stopped) return
        const codes = await codesIn(canvas, file.name)
        if (run.stopped) return
        lines.push(...codes)
        if (codes.length === 0 && batch) lines.push({ code: problemLine('No code found', '', file.name), thumbnail: thumbnailOf(canvas) })
        tally.push({ name: file.name, codes: codes.length, problem: null })
      } catch (e) {
        if (e instanceof ReadStopped || run.stopped) return
        // nothing can be read without the reader
        if (e instanceof ReaderUnavailable) {
          finish(run, [], e.message, 'warn')
          return
        }
        // one picture's trouble never ends the others
        tally.push({ name: file.name, codes: 0, problem: why(e) })
        if (batch) lines.push({ code: problemLine("Couldn't open", why(e), file.name) })
      } finally {
        if (canvas) canvas.width = canvas.height = 0
      }
      if (batch) setStatus(`Reading ${i + 1} of ${files.length}…`, 'text')
    }
    finish(run, lines, filesSummary(tally))
  }

  async function readCopied(picture: Blob, where = 'the copied picture'): Promise<void> {
    if (current) return
    const run = begin(`Reading ${where}…`)
    let canvas: HTMLCanvasElement | null = null
    try {
      canvas = await pictureFrom(picture)
      if (run.stopped) return
      const codes = await codesIn(canvas, where)
      finish(run, codes, pictureSummary(where, codes.length, null))
    } catch (e) {
      if (e instanceof ReadStopped || run.stopped) return
      if (e instanceof ReaderUnavailable) finish(run, [], e.message, 'warn')
      // (as the PC app says it for a copied picture: "Couldn't read the copied picture (…)")
      else finish(run, [], pictureSummary(where, 0, e instanceof PictureProblem ? e.message : said(e)))
    } finally {
      if (canvas) canvas.width = canvas.height = 0
    }
  }

  function cancel(): boolean {
    if (!current) return false
    current.stopped = true
    current = null
    reader.stop()
    showBusy(false)
    setStatus('Stopped.', 'dim')
    return true
  }

  // ---------- the buttons ----------

  const camera = makeCamera(reader, (code, thumbnail) => {
    host.showTab()
    show([{ code, thumbnail }])
    setStatus(`1 code from ${code.source}`, 'text')
  })
  cameraButton.addEventListener('click', () => {
    if (current) return
    note.textContent = ''
    camera.open()
  })
  openButton.addEventListener('click', () => openInput.click())
  openInput.addEventListener('change', () => {
    const files = [...(openInput.files ?? [])]
    openInput.value = ''
    void readFiles(files)
  })
  pasteButton.addEventListener('click', async () => {
    if (current) return
    if (!navigator.clipboard?.read) {
      setStatus("This browser doesn't let a page read pictures from the clipboard. Press Ctrl+V, or open the picture's file instead.", 'warn')
      return
    }
    let picture: Blob | null
    try {
      picture = await clipboardPicture()
    } catch {
      setStatus("This browser didn't let the page look at the clipboard. Press Ctrl+V, or open the picture's file instead.", 'warn')
      return
    }
    if (picture) void readCopied(picture)
    else setStatus(NOTHING_COPIED, 'warn')
  })
  cancelButton.addEventListener('click', () => void cancel())
  clearButton.addEventListener('click', () => {
    show([])
    setStatus('', 'text')
    note.textContent = ''
  })

  show([])
  return {
    columns: [sources, results],
    dialogs: [camera.el, linkDialog],
    get busy() {
      return current !== null
    },
    readFiles: (files, folders) => void readFiles(files, folders),
    readCopied: (picture) => void readCopied(picture),
    cancel
  }
}
