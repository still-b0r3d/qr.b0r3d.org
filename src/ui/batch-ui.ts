// Batch export, as b0r3d QR for PC has it: a CSV's rows, each made into a file with the Create
// tab's design (QR codes) or barcode settings, named as the site has always named them, all in one
// zip. The rows that can't be made are listed first, each row can be looked at in turn, and every
// file is read back out of the finished zip and scanned, to check it reads as its row says.

import type { Measure, QrArt } from '../qr/art'
import { askFor, madeFrom } from '../qr/barcode-make'
import { BarcodeArt, barcodeJpg, barcodePdf, barcodePng, barcodeSvgText, type BarcodeLook } from '../qr/barcode-svg'
import { barcodeFormat, type BarcodeType } from '../qr/barcodes'
import {
  BARCODE_GUIDE,
  barcodeExample,
  CONTACTS_EXAMPLE,
  designFor,
  extensionOf,
  glimpse,
  pdfTitle,
  planBatch,
  QR_EXAMPLE,
  QR_GUIDE,
  readBarcodeBatch,
  readQrBatch,
  textPicture,
  zipName,
  type BatchFormat,
  type BatchItem,
  type BatchKind,
  type BatchRow
} from '../qr/batch'
import { grouped, QrError } from '../qr/code'
import { csvText } from '../qr/csv'
import { DEFAULT_CAPTION, type QrDesign } from '../qr/design'
import { codeText, jpgFile, markdown, paint, pdfFile, pngFile, release, svgText, type Output, type TextStyle } from '../qr/export'
import { readPdfPicture } from '../qr/pdf'
import { crc32, type PrintSize } from '../qr/print'
import { ZipWriter, zipEntries, zipRead } from '../qr/zip'
import { BarcodeWriter } from './barcode-writer'
import { h, segmented } from './dom'
import { download } from './download'
import { PictureReader, pictureFrom, pixelsOf, ReaderUnavailable } from './picture-reader'
import { drawBarcodeForCheck, drawForCheck } from './scan-check'

/** The Create tab as it is when the window opens: what the files are made with. */
export interface BatchSource {
  barcode: BarcodeType | null
  design: QrDesign
  /** the design's logo is from a web address and is drawn */
  logoFetched: boolean
  look: BarcodeLook
  /** QR codes: the print size and whole pixels */
  output: Output
  /** barcodes: the print size */
  barcodePrint: PrintSize
}

export interface BatchHelpers {
  /** a design drawn once its pictures and its caption's font are here (QrError when it can't be made) */
  art: (design: QrDesign) => Promise<QrArt>
  /** how wide a caption's line is, in a design's own caption font */
  measure: (design: QrDesign) => Measure
  /** for the PDFs */
  producer: string
}

/** the biggest CSV a batch reads, as the PC app has it */
const MOST_CSV_BYTES = 20 * 1024 * 1024

const count = (n: number, thing: string): string => (n === 1 ? `1 ${thing}` : `${grouped(n)} ${thing}s`)

/**
 * A moment for the page to draw and take a click (Stop): a message to itself, which a browser
 * doesn't hold back while the page is in another tab, as it does a timer.
 */
const pause = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })

const TEXT_STYLES: { value: TextStyle; label: string }[] = [
  { value: 'half', label: 'Half blocks, compact' },
  { value: 'full', label: 'Full blocks' },
  { value: 'ascii', label: 'ASCII, # for the background' }
]

const FORMATS: { value: BatchFormat; text: string; name: string }[] = [
  { value: 'png', text: 'PNG', name: 'PNG' },
  { value: 'jpg', text: 'JPG', name: 'JPG' },
  { value: 'svg', text: 'SVG', name: 'SVG' },
  { value: 'pdf', text: 'PDF', name: 'PDF' },
  { value: 'text', text: 'Text', name: 'Text' }
]

/** what to say for a row's file that couldn't be made */
function whyNot(e: unknown): string {
  if (e instanceof RangeError) return "there isn't enough memory for a picture that big"
  // the site's own messages say it in full ("That picture would be…"); anything else is the browser's
  if (e instanceof QrError || (e instanceof Error && e.constructor === Error)) return e.message
  return `it couldn't be made (${e instanceof Error ? e.message : String(e)})`
}

/** a file's fingerprint, to tell it came back out of the zip as it went in */
async function fingerprint(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
    return Array.from(sum, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${bytes.length}:${crc32(bytes)}`
}

const bytesOf = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer())

export function makeBatchDialog(helpers: BatchHelpers) {
  // ---------- what's showing ----------

  let source: BatchSource | null = null
  let kind: BatchKind | null = null
  let rows: BatchRow[] = []
  let items: BatchItem[] = []
  let shown = 0
  let planning = 0
  let planned = false
  let busy = false
  let stopping = false
  let thumbTicket = 0
  let reading = 0
  const writer = new BarcodeWriter()
  const reader = new PictureReader()

  const what = h('p', { class: 'hint batch-what' })
  const csvInput = h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', class: 'file-input', tabindex: -1, 'aria-hidden': 'true', 'data-testid': 'batch-file' })
  const choose = h('button', { type: 'button', class: 'small', 'data-testid': 'batch-choose' }, 'Choose a CSV file…')
  const example = h('button', { type: 'button', class: 'small', 'data-testid': 'batch-example' }, 'Save an example')
  const contactsExample = h('button', { type: 'button', class: 'small', 'data-testid': 'batch-contacts-example' }, 'Save a contacts example')
  const fileLine = h('p', { class: 'batch-file-line', 'data-testid': 'batch-file-line' })
  const readProblem = h('p', { class: 'hint bad-text', role: 'alert', hidden: true, 'data-testid': 'batch-problem' })
  const guide = h('p', { class: 'hint batch-guide' })

  const problemsHeading = h('p', { class: 'batch-heading', 'data-testid': 'batch-heading' })
  const problemsList = h('ul', { class: 'batch-list', 'aria-label': "Rows that can't be made", 'data-testid': 'batch-problems' })
  const rowFields = h('dl', { class: 'batch-fields', 'data-testid': 'batch-row' })
  const rowPicture = h('canvas', { class: 'batch-picture', role: 'img', 'aria-label': "This row's code", 'data-testid': 'batch-picture' })
  const previous = h('button', { type: 'button', class: 'small', 'aria-label': 'Previous row' }, '<')
  const next = h('button', { type: 'button', class: 'small', 'aria-label': 'Next row' }, '>')
  const rowNumber = h('span', { class: 'hint batch-row-number', 'data-testid': 'batch-row-number' })
  const rowsPanel = h(
    'div',
    { class: 'batch-rows', hidden: true },
    problemsHeading,
    problemsList,
    h('div', { class: 'batch-card' }, h('div', { class: 'batch-card-top' }, rowFields, h('div', { class: 'batch-picture-box' }, rowPicture)), h('div', { class: 'batch-nav' }, previous, rowNumber, next))
  )

  const formats = segmented('Kind of file', FORMATS, (value) => pickFormat(value))
  const textButton = formats.el.querySelector<HTMLButtonElement>('[data-value="text"]')!
  const textStyle = h('select', { 'aria-label': 'Kind of text', 'data-testid': 'batch-text-style' }, ...TEXT_STYLES.map((s) => h('option', { value: s.value }, s.label)))
  const asMarkdown = h('input', { type: 'checkbox', 'data-testid': 'batch-markdown' })
  const textOptions = h('div', { class: 'batch-text-options', hidden: true }, textStyle, h('label', { class: 'check-row' }, asMarkdown, ' Markdown (.md)'))
  const frameCheck = h('input', { type: 'checkbox', 'data-testid': 'batch-frame' })
  const frameRow = h('label', { class: 'check-row' }, frameCheck, " Frame each code with its row's caption")
  const settingsLine = h('p', { class: 'hint', 'data-testid': 'batch-settings' })

  // what's going on; screen readers hear only how it ended (not every file as it's made)
  const status = h('p', { class: 'batch-status', 'data-testid': 'batch-status' })
  const said = h('p', { class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'batch-said' })
  const tell = (text: string): void => {
    status.textContent = text
    said.textContent = text
  }
  const outcomeList = h('ul', { class: 'batch-list', 'aria-label': "Files that didn't come out right", 'data-testid': 'batch-outcome' })
  const make = h('button', { type: 'button', class: 'small primary', disabled: true, 'data-testid': 'batch-make' }, 'Make the files')
  const stop = h('button', { type: 'button', class: 'small', hidden: true, 'data-testid': 'batch-stop' }, 'Stop')
  const close = h('button', { type: 'button', class: 'small' }, 'Close')

  const dialog = h(
    'dialog',
    { class: 'batch-dialog', 'aria-labelledby': 'batch-title', 'data-testid': 'batch-dialog' },
    h('div', { class: 'dialog-head' }, h('h2', { id: 'batch-title' }, 'Batch export')),
    what,
    h('div', { class: 'batch-choose' }, choose, csvInput, example, contactsExample),
    fileLine,
    h('p', { class: 'hint' }, 'Or drop a CSV file on this window.'),
    readProblem,
    h('details', { class: 'batch-guide-box' }, h('summary', null, 'What goes in the CSV'), guide),
    rowsPanel,
    h('p', { class: 'label batch-label' }, 'Kind of file'),
    formats.el,
    textOptions,
    frameRow,
    settingsLine,
    h('p', { class: 'hint' }, 'The files come in one zip file. Each is read back out of it and scanned, to check it reads as its row says.'),
    h('div', { class: 'dialog-foot batch-foot' }, h('div', { class: 'batch-outcome' }, status, said, outcomeList), h('span', { class: 'buttons' }, make, stop, close))
  )

  // ---------- opening ----------

  /** The window for the Create tab as it is now, fresh each time (as the PC app's is), with a CSV read into it if one's given. */
  function open(now: BatchSource, file?: File): void {
    // (a batch still being made or read back: the window as it is, and a CSV dropped meanwhile said no to)
    if (busy) {
      if (!dialog.open) dialog.showModal()
      if (file) tell(`The last batch isn't done yet: drop ${file.name} again once it is.`)
      return
    }
    reading++
    source = now
    kind = {
      barcode: now.barcode,
      design: now.design,
      frame: now.barcode === null && now.design.frame !== null,
      logoFetched: now.logoFetched,
      format: 'png',
      textStyle: 'half',
      markdown: false
    }
    rows = []
    items = []
    planned = false
    planning++
    const qr = now.barcode === null
    what.textContent = qr
      ? "QR codes with the Create tab's design: a file for every row of a CSV, all in one zip file."
      : `${barcodeFormat(now.barcode!).label} barcodes with the Create tab's barcode settings: a file for every row of a CSV, all in one zip file.`
    guide.textContent = qr ? QR_GUIDE : BARCODE_GUIDE
    contactsExample.hidden = !qr
    textButton.hidden = !qr
    fileLine.textContent = ''
    readProblem.hidden = true
    rowsPanel.hidden = true
    textStyle.value = 'half'
    asMarkdown.checked = false
    frameCheck.checked = kind.frame
    formats.set('png')
    showFormat()
    clearOutcome()
    showMake()
    if (!dialog.open) dialog.showModal()
    if (file) void load(file)
  }

  // ---------- the CSV ----------

  choose.addEventListener('click', () => csvInput.click())
  csvInput.addEventListener('change', () => {
    const file = csvInput.files?.[0]
    csvInput.value = ''
    if (file) void load(file)
  })
  dialog.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
  })
  dialog.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files[0]
    if (!file) return
    e.preventDefault()
    e.stopPropagation()
    if (!busy) void load(file)
  })

  async function load(file: File): Promise<void> {
    if (busy || !kind) return
    // (only the last file chosen is read in: one still being read when another is chosen, or the
    // window opened again, is let go)
    const mine = ++reading
    if (file.size > MOST_CSV_BYTES) {
      showReadProblem('That file is too big for a batch: over 20 MB.')
      return
    }
    let text: string
    try {
      text = csvText(await bytesOf(file))
    } catch (e) {
      if (mine === reading) showReadProblem(`Couldn't read that file: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    if (mine === reading) loadText(file.name, text)
  }

  function loadText(name: string, text: string): void {
    if (busy || !kind) return
    let read: BatchRow[] | null
    let hasFrameText = false
    if (kind.barcode) read = readBarcodeBatch(text)
    else {
      const qr = readQrBatch(text)
      read = qr ? qr.rows : null
      hasFrameText = qr?.hasFrameText ?? false
    }
    if (!read || read.length === 0) {
      showReadProblem(
        kind.barcode
          ? `No codes found in ${name}.`
          : "That CSV can't be used: the first row names the columns, and every row after it needs its text in the first column " +
              '(in a file of contacts, a firstName and a lastName).'
      )
      return
    }
    readProblem.hidden = true
    rows = read
    shown = 0
    fileLine.textContent = `${name} · ${count(rows.length, 'row')}`
    // a frame when the file has captions, as the site always did on reading one
    if (!kind.barcode) {
      frameCheck.checked = hasFrameText
      kind.frame = hasFrameText
    }
    clearOutcome()
    void replan()
  }

  function showReadProblem(text: string): void {
    readProblem.textContent = text
    readProblem.hidden = false
  }

  // ---------- which rows can be made ----------

  /** a barcode row's problem: its type's checks, then zint's */
  async function barcodeProblem(type: BarcodeType, text: string): Promise<string | null> {
    const look = source!.look
    const asked = askFor(type, text, look)
    if ('error' in asked) return asked.error
    const { svg, error } = await writer.write(asked.ask)
    const made = madeFrom(type, svg, error, look.barHeight)
    return 'error' in made ? made.error : null
  }

  async function replan(): Promise<void> {
    if (rows.length === 0 || !kind) return
    const mine = ++planning
    const these = rows
    const snapshot = { ...kind }
    status.textContent = rows.length > 200 ? `Checking ${count(rows.length, 'row')}…` : ''
    // nothing to make from the last file or kind of file while this one's checked
    planned = false
    showMake()
    try {
      const result = await planBatch(these, snapshot, barcodeProblem, async () => {
        await pause()
        return mine === planning
      })
      if (mine !== planning || !result) return
      planned = true
      items = result
      status.textContent = ''
      showRows()
      // (said too, as the heading over the rows says it)
      said.textContent = (problemsHeading.textContent ?? '').replace(/:$/, '.')
    } catch (e) {
      if (mine !== planning) return
      items = []
      rowsPanel.hidden = true
      tell(`Couldn't check the rows: ${e instanceof Error ? e.message : String(e)}.`)
    }
  }

  function line(text: string): HTMLLIElement {
    return h('li', null, text)
  }

  function showRows(): void {
    rowsPanel.hidden = false
    const problems = items.filter((i) => i.problem !== null)
    if (problems.length === 0) {
      problemsHeading.textContent = items.length === 1 ? 'The row can be made.' : `All ${grouped(items.length)} rows can be made.`
      problemsHeading.dataset.kind = 'good'
      problemsList.replaceChildren()
    } else {
      const label = kind!.barcode ? `${barcodeFormat(kind!.barcode).label} barcodes` : 'QR codes'
      problemsHeading.textContent =
        problems.length === items.length
          ? (items.length === 1 ? "The row can't be made as " : 'None of the rows can be made as ') + label + ':'
          : `${count(problems.length, 'row')} of ${grouped(items.length)} can't be made, and will be left out:`
      problemsHeading.dataset.kind = 'bad'
      problemsList.replaceChildren(
        ...problems.slice(0, 50).map((item) => line(`Row ${item.row.row}: ${glimpse(item.row.data)} · ${item.problem}`)),
        ...(problems.length > 50 ? [line(`…and ${grouped(problems.length - 50)} more.`)] : [])
      )
    }
    showRow()
    showMake()
  }

  function showMake(): void {
    const makeable = items.filter((i) => i.problem === null).length
    make.textContent = makeable === 1 ? 'Make the file' : `Make ${grouped(makeable)} files`
    make.disabled = busy || !planned || makeable === 0
  }

  // ---------- each row in turn ----------

  previous.addEventListener('click', () => showRow(shown - 1))
  next.addEventListener('click', () => showRow(shown + 1))

  function showRow(index = -1): void {
    if (items.length === 0 || !kind) return
    if (index >= 0) shown = Math.max(0, Math.min(items.length - 1, index))
    const item = items[shown]
    rowNumber.textContent = `Row ${grouped(shown + 1)} of ${grouped(items.length)} · line ${item.row.row} of the file`
    previous.disabled = shown === 0
    next.disabled = shown === items.length - 1
    const fields: HTMLElement[] = []
    const field = (label: string, value: string, code = false): void => {
      if (!value) return
      fields.push(h('dt', null, label), h('dd', { class: code ? 'code' : null }, value.length > 300 ? value.slice(0, 297) + '…' : value))
    }
    const row = item.row
    if (row.contact) {
      // a contact, from the fields its card was written from
      const c = row.contact
      const joined = (...names: string[]) => names.map((n) => c[n] ?? '').filter((v) => v.length > 0).join(' · ')
      field('Name', `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim())
      field('Company', joined('org', 'position'))
      field('Email', c.email ?? '')
      field('Phone', joined('phoneWork', 'phoneMobile', 'phonePrivate'))
    } else field('Data', row.data, true)
    if (!kind.barcode && kind.frame && kind.format !== 'text') field('Frame text', row.frameText.length > 0 ? row.frameText : `${DEFAULT_CAPTION} (the default)`)
    if (!kind.barcode && row.font.length > 0) field('Font family', row.font)
    if (item.name !== null) field('File', item.name + extensionOf(kind), true)
    if (item.problem !== null) fields.push(h('dd', { class: 'bad-text batch-row-problem' }, item.problem))
    rowFields.replaceChildren(...fields)
    void drawThumbnail(item)
  }

  /** the row's code drawn small, as its file shows it */
  async function drawThumbnail(item: BatchItem): Promise<void> {
    const mine = ++thumbTicket
    rowPicture.width = rowPicture.height = 0
    rowPicture.hidden = true
    if (item.problem !== null || !kind || !source) return
    const k = kind
    const look = source.look
    try {
      if (k.barcode) {
        const art = await barcodeArt(k.barcode, item.row.data, look)
        if (mine !== thumbTicket) return
        const scale = Math.max(1, Math.floor(276 / Math.max(art.W, art.H)))
        rowPicture.width = Math.max(1, Math.round(art.W * scale))
        rowPicture.height = Math.max(1, Math.round(art.H * scale))
        const ctx = rowPicture.getContext('2d')
        if (!ctx) return
        art.draw(ctx, scale, look.color, look.transparent ? null : look.background)
      } else {
        const design = designFor(k, item.row)
        if (k.format === 'text') {
          design.frame = null
          design.logo = ''
        }
        const art = await helpers.art(design)
        if (mine !== thumbTicket) return
        const scale = 276 / Math.max(art.W, art.H)
        rowPicture.width = Math.max(1, Math.ceil(art.W * scale))
        rowPicture.height = Math.max(1, Math.ceil(art.H * scale))
        const ctx = rowPicture.getContext('2d')
        if (!ctx) return
        paint(ctx, art, scale, rowPicture.width, rowPicture.height)
      }
      rowPicture.hidden = false
    } catch {
      // (nothing to show: the row's problem says why)
    }
  }

  // ---------- the kind of file ----------

  function pickFormat(value: BatchFormat): void {
    if (busy || !kind) return
    formats.set(value)
    kind.format = value
    showFormat()
    clearOutcome()
    void replan()
  }

  textStyle.addEventListener('change', () => {
    if (!kind) return
    showFormat()
    void replan()
  })
  asMarkdown.addEventListener('change', () => {
    if (!kind) return
    showFormat()
    void replan()
  })
  frameCheck.addEventListener('change', () => {
    if (!kind) return
    kind.frame = kind.barcode === null && frameCheck.checked
    showRow()
  })

  function showFormat(): void {
    if (!kind) return
    kind.textStyle = (textStyle.value as TextStyle) || 'half'
    kind.markdown = asMarkdown.checked
    kind.frame = kind.barcode === null && frameCheck.checked
    const text = kind.format === 'text'
    textOptions.hidden = !text
    frameRow.hidden = kind.barcode !== null || text
    settingsLine.textContent = kind.barcode
      ? "Made with the Create tab's barcode settings (colours, size, text, bar height); change them there."
      : text
        ? (kind.textStyle === 'ascii' ? "Most scanners can't read the ASCII kind: it's for plain text, email and terminals. " : '') +
          "Text uses the Create tab's error correction and size, with no logo or frame."
        : "Made with the Create tab's design and size; change them there."
  }

  // ---------- making the files ----------

  async function barcodeArt(type: BarcodeType, text: string, look: BarcodeLook): Promise<BarcodeArt> {
    const asked = askFor(type, text, look)
    if ('error' in asked) throw new QrError(asked.error)
    const { svg, error } = await writer.write(asked.ask)
    const made = madeFrom(type, svg, error, look.barHeight)
    if ('error' in made) throw new QrError(made.error)
    return new BarcodeArt(made.barcode)
  }

  /** A row's file. */
  async function makeFile(item: BatchItem, k: BatchKind, from: BatchSource): Promise<Uint8Array> {
    if (k.barcode) {
      const look = from.look
      const print = from.barcodePrint
      const art = await barcodeArt(k.barcode, item.row.data, look)
      if (k.format === 'png') return bytesOf(await barcodePng(art, look, print))
      if (k.format === 'jpg') return bytesOf(await barcodeJpg(art, look, print))
      if (k.format === 'pdf') return bytesOf(await barcodePdf(art, look, pdfTitle(item, k), helpers.producer, print))
      return new TextEncoder().encode(barcodeSvgText(art.barcode, look, print))
    }
    const design = designFor(k, item.row)
    if (k.format === 'text') {
      const text = codeText(design, k.textStyle, design.level)
      return new TextEncoder().encode(k.markdown ? markdown(text) : text)
    }
    const art = await helpers.art(design)
    const measure = helpers.measure(design)
    if (k.format === 'png') return bytesOf(await pngFile(art, measure, from.output))
    if (k.format === 'jpg') return bytesOf(await jpgFile(art, measure, from.output))
    if (k.format === 'pdf') return bytesOf(await pdfFile(art, measure, pdfTitle(item, k), helpers.producer, from.output))
    return new TextEncoder().encode(svgText(art, from.output.print))
  }

  /** The picture a scanner would see in a file: a picture's or PDF's own pixels on white, a text file's characters as the squares they stand for, and for an SVG the code drawn as the scan check draws it (the file itself was checked against what was made). */
  async function pictureIn(bytes: Uint8Array, item: BatchItem, k: BatchKind, from: BatchSource): Promise<ImageData | null> {
    if (k.format === 'png' || k.format === 'jpg') {
      const canvas = await pictureFrom(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: k.format === 'png' ? 'image/png' : 'image/jpeg' }))
      try {
        return pixelsOf(canvas)
      } finally {
        release(canvas)
      }
    }
    if (k.format === 'pdf') {
      const p = await readPdfPicture(bytes)
      return p ? new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.width, p.height) : null
    }
    if (k.format === 'text') {
      const p = textPicture(new TextDecoder().decode(bytes), k.textStyle)
      return new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.width, p.height)
    }
    if (k.barcode) return drawBarcodeForCheck(await barcodeArt(k.barcode, item.row.data, from.look), from.look)
    return drawForCheck(await helpers.art(designFor(k, item.row)))
  }

  /** Whether the file scans as its row says (ReaderUnavailable when the reader didn't load). */
  async function readsBack(bytes: Uint8Array, item: BatchItem, k: BatchKind, from: BatchSource): Promise<boolean> {
    let image: ImageData | null
    try {
      image = await pictureIn(bytes, item, k, from)
    } catch {
      return false
    }
    if (!image) return false
    try {
      return (await reader.check(image, k.barcode ? barcodeFormat(k.barcode) : null)) === item.expected
    } catch (e) {
      if (e instanceof ReaderUnavailable) throw e
      return false
    }
  }

  function setBusy(on: boolean, making = on): void {
    busy = on
    for (const el of [choose, example, contactsExample, textStyle, asMarkdown, frameCheck]) el.disabled = on
    for (const b of formats.el.querySelectorAll('button')) b.disabled = on
    stop.hidden = !making
    showMake()
    // The keys stay in the window when what has them is turned off or goes (Make, Stop, the
    // choices): on Stop while the files are made, on Close while they're read back, on Make once
    // it's done.
    const focused = document.activeElement
    // (the window itself has them after a click in Safari, which doesn't put the keys on a button clicked)
    const stranded =
      focused === null ||
      focused === document.body ||
      focused === dialog ||
      (dialog.contains(focused) && ((focused as HTMLButtonElement).disabled === true || (focused as HTMLElement).hidden || focused.closest('[hidden]') !== null))
    if (!stranded || !dialog.open) return
    if (making) stop.focus()
    else if (on) close.focus()
    else (make.disabled ? close : make).focus()
  }

  stop.addEventListener('click', () => (stopping = true))

  make.addEventListener('click', () => void makeZip())

  async function makeZip(): Promise<void> {
    if (busy || !kind || !source) return
    const todo = items.filter((i) => i.problem === null)
    if (todo.length === 0) return
    clearOutcome()
    const k = { ...kind }
    const from = source
    const extension = extensionOf(k)
    const zipFile = zipName(k)
    const outcome = { made: 0, failed: [] as string[], unread: [] as string[], unscanned: false }
    const zip = new ZipWriter()
    const made: { item: BatchItem; entry: string; print: string }[] = []
    const taken = new Set<string>()
    let handedOver = false
    let worked = performance.now()
    stopping = false
    setBusy(true)
    try {
      for (let n = 0; n < todo.length && !stopping; n++) {
        const item = todo[n]
        // a name used already (in capitals or not: Windows doesn't tell them apart) is numbered, as Windows numbers copies
        let entry = item.name + extension
        for (let c = 2; taken.has(entry.toLowerCase()); c++) entry = `${item.name} (${c})${extension}`
        taken.add(entry.toLowerCase())
        status.textContent = `Making ${grouped(n + 1)} of ${grouped(todo.length)}: ${entry}`
        let bytes: Uint8Array
        try {
          bytes = await makeFile(item, k, from)
        } catch (e) {
          outcome.failed.push(`${entry}: ${whyNot(e)}`)
          continue
        }
        await zip.add({ name: entry, bytes })
        made.push({ item, entry, print: await fingerprint(bytes) })
        if (performance.now() - worked > 30) {
          await pause()
          worked = performance.now()
        }
      }
      if (stopping) {
        tell('Stopped: no zip file was made.')
        return
      }
      if (made.length > 0) {
        const blob = zip.finish()
        download(blob, zipFile)
        handedOver = true
        // each file back out of the zip as it was handed over
        setBusy(true, false)
        status.textContent = 'Reading the files back…'
        const entries = new Map((await zipEntries(blob)).map((e) => [e.name, e]))
        for (const m of made) {
          let back: Uint8Array | null = null
          try {
            const entry = entries.get(m.entry)
            back = entry ? await zipRead(blob, entry) : null
          } catch {
            back = null
          }
          if (!back || (await fingerprint(back)) !== m.print) {
            outcome.failed.push(`${m.entry}: it came back out of the zip different`)
            continue
          }
          outcome.made++
          if (outcome.unscanned) continue
          try {
            if (!(await readsBack(back, m.item, k, from))) outcome.unread.push(m.entry)
          } catch {
            outcome.unscanned = true
          }
        }
      }
      finish(outcome, todo.length, zipFile)
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      tell(handedOver ? `Made ${zipFile}, but couldn't read it back to check it: ${why}` : `Couldn't make ${zipFile}: ${why}`)
      status.dataset.kind = 'warn'
    } finally {
      setBusy(false)
      reader.release()
      if (!dialog.open) writer.release()
    }
  }

  function finish(outcome: { made: number; failed: string[]; unread: string[]; unscanned: boolean }, total: number, where: string): void {
    const leftOut = items.filter((i) => i.problem !== null).length
    let said = outcome.made === 0 ? 'No files were made' : `Made ${count(outcome.made, 'file')}${outcome.made < total ? ` of ${grouped(total)}` : ''} in ${where}`
    if (outcome.made > 0 && outcome.unscanned) said += ", each read back. The code reader didn't load, so they weren't scanned."
    else said += outcome.made > 0 && outcome.unread.length === 0 ? ', each read back and scanned.' : '.'
    if (leftOut > 0) said += ` ${count(leftOut, 'row')} couldn't be made (listed above).`
    if (outcome.failed.length > 0) said += ` ${count(outcome.failed.length, 'file')} ${outcome.failed.length === 1 ? "wasn't" : "weren't"} made:`
    if (outcome.unread.length > 0) said += ` ${count(outcome.unread.length, 'file')} didn't scan when read back: try more contrast or a larger size.`
    tell(said)
    status.dataset.kind = outcome.failed.length + outcome.unread.length > 0 || outcome.made === 0 || outcome.unscanned ? 'warn' : 'good'
    outcomeList.replaceChildren(...[...outcome.failed, ...outcome.unread.map((f) => `${f}: didn't scan when read back`)].slice(0, 30).map(line))
  }

  function clearOutcome(): void {
    status.textContent = ''
    said.textContent = ''
    delete status.dataset.kind
    outcomeList.replaceChildren()
  }

  // ---------- closing ----------

  close.addEventListener('click', () => dialog.close())
  // closing stops a batch being made (no zip comes of it), as the PC app's window does
  dialog.addEventListener('close', () => {
    planning++
    thumbTicket++
    if (busy) stopping = true
    else writer.release()
  })

  // ---------- examples to start from ----------

  example.addEventListener('click', () => {
    if (!kind) return
    const text = kind.barcode ? barcodeExample(kind.barcode) : QR_EXAMPLE
    const name = kind.barcode ? `${barcodeFormat(kind.barcode).id}-batch-example.csv` : 'batch-example.csv'
    download(new Blob([text], { type: 'text/csv' }), name)
    tell(`Saved ${name}. Fill it in with a spreadsheet or a text editor, then choose it here.`)
    delete status.dataset.kind
  })
  contactsExample.addEventListener('click', () => {
    download(new Blob([CONTACTS_EXAMPLE], { type: 'text/csv' }), 'batch-example-contacts.csv')
    tell('Saved batch-example-contacts.csv. Fill it in with a spreadsheet or a text editor, then choose it here.')
    delete status.dataset.kind
  })

  return {
    el: dialog,
    open,
    /** a batch is being made (or its rows checked) */
    get busy(): boolean {
      return busy
    }
  }
}
