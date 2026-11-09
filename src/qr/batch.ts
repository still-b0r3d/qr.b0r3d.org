// Batch export, as b0r3d QR has it (the PC app's BatchRows and BatchExport, which read and name
// batches the way the site always has): a CSV's rows, each made into a file with the Create tab's
// design (QR codes) or settings (barcodes), named as the site names them, and the rows that can't
// be made, with why.

import { CAPTION_FONTS } from '../ui/fonts'
import { makeQrCode, QrError } from './code'
import { parseCsv } from './csv'
import { copyDesign, DEFAULT_CAPTION, levelUsed, newFrame, type QrDesign } from './design'
import { barcodeFormat, type BarcodeType } from './barcodes'
import type { TextStyle } from './export'
import { makeText } from './templates'

/** A row of a batch: what goes in its code, and what the CSV says about it. */
export interface BatchRow {
  /** its row in the file, counting a header row, as a spreadsheet numbers them */
  row: number
  /** the code's text (for a file of contacts, the vCard written from the row) */
  data: string
  /** QR: the frame's caption for this row ("" for the design's own) */
  frameText: string
  /** the file name the CSV gives it ("" for none) */
  fileName: string
  /** QR: the caption's font for this row ("" for the design's own) */
  font: string
  /** QR: a contact's fields (the vCard template's names), for showing the row */
  contact?: Record<string, string>
}

// ---------- reading ----------

/** the vCard template's fields for a contact, and the column each one is read from */
const CONTACT_COLUMNS: [string, string][] = [
  ['firstName', 'firstname'],
  ['lastName', 'lastname'],
  ['org', 'org'],
  ['position', 'position'],
  ['phoneWork', 'phonework'],
  ['phonePrivate', 'phoneprivate'],
  ['phoneMobile', 'phonemobile'],
  ['email', 'email'],
  ['website', 'website'],
  ['street', 'street'],
  ['zipcode', 'zipcode'],
  ['city', 'city'],
  ['state', 'state'],
  ['country', 'country']
]

const at = (values: string[], place: number): string => (place < values.length ? values[place] : '')

/** A header's columns, looked up by name: each of its values in small letters, at the first place it comes. */
class Columns {
  private readonly places = new Map<string, number>()
  constructor(header: string[]) {
    header.forEach((name, i) => {
      const lower = name.toLowerCase()
      if (!this.places.has(lower)) this.places.set(lower, i)
    })
  }
  has = (name: string): boolean => this.places.has(name)
  get = (values: string[], name: string): string => {
    const place = this.places.get(name)
    return place === undefined ? '' : at(values, place)
  }
}

/**
 * The QR batch, as the site reads it: a header row naming the columns, then a code a row; null where
 * the site says the CSV can't be used. A file whose header has firstName and lastName columns is a
 * file of contacts, each row made into a vCard. Any other is a file of links or texts, read by place
 * whatever its header says: the code's text, then the caption, then the file name. In both, a row's
 * value in a frameFontFamily column is its caption's font, and a caption in any row puts the frame on.
 */
export function readQrBatch(content: string): { rows: BatchRow[]; hasFrameText: boolean } | null {
  const records = parseCsv(content).records
  if (records.length === 0) return null
  const columns = new Columns(records[0])
  const contacts = columns.has('firstname') && columns.has('lastname')
  if (records.length < 2) return null
  // every row needs its code's text (in a file of contacts, a first name and a last name)
  for (const values of records.slice(1)) {
    const usable = contacts ? columns.get(values, 'firstname').length > 0 && columns.get(values, 'lastname').length > 0 : at(values, 0).trim().length > 0
    if (!usable) return null
  }
  const rows = records.slice(1).map((values, i): BatchRow => {
    const row: BatchRow = { row: i + 2, data: '', frameText: '', fileName: '', font: columns.get(values, 'framefontfamily') }
    if (contacts) {
      const fields: Record<string, string> = {}
      for (const [field, column] of CONTACT_COLUMNS) fields[field] = columns.get(values, column)
      const version = columns.get(values, 'version')
      fields.version = version.length > 0 ? version : '3.0'
      row.data = makeText('vcard', fields)
      row.frameText = columns.get(values, 'frametext')
      row.fileName = columns.get(values, 'filename')
      row.contact = fields
    } else {
      row.data = at(values, 0)
      row.frameText = at(values, 1)
      row.fileName = at(values, 2)
    }
    return row
  })
  return { rows, hasFrameText: rows.some((r) => r.frameText.trim().length > 0) }
}

const DATA_COLUMNS = ['data', 'code', 'barcode', 'value', 'text', 'url']
const FILE_NAME_COLUMNS = ['filename', 'file name', 'file', 'name']

/**
 * The barcode batch: one code a row. A header row is optional and known by its names (data, code,
 * barcode, value, text or url for the code; fileName, file name, file or name for the file), so a
 * QR batch file works too; without one, the first column is the code and the second the file name.
 * Rows with no code are left out.
 */
export function readBarcodeBatch(content: string): BatchRow[] {
  const text = content.length > 0 && content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const records = parseCsv(text).records
  if (records.length === 0) return []
  const first = records[0].map((cell) => cell.toLowerCase())
  const dataColumn = first.findIndex((cell) => DATA_COLUMNS.includes(cell))
  const fileColumn = first.findIndex((cell) => FILE_NAME_COLUMNS.includes(cell))
  const hasHeader = dataColumn >= 0 || fileColumn >= 0
  const dataAt = dataColumn >= 0 ? dataColumn : fileColumn === 0 ? 1 : 0
  const fileAt = hasHeader ? fileColumn : 1
  const rows: BatchRow[] = []
  for (let i = hasHeader ? 1 : 0; i < records.length; i++) {
    const values = records[i]
    const data = dataAt < values.length ? values[dataAt] : ''
    if (data.trim().length === 0) continue
    rows.push({ row: i + 1, data, frameText: '', fileName: fileAt >= 0 && fileAt < values.length ? values[fileAt] : '', font: '' })
  }
  return rows
}

// ---------- the files' names ----------

/** A name made safe for a file: every character but A-Z, a-z, 0-9, _ and - made _ (each UTF-16 unit, so an emoji is __). */
export function safeName(name: string): string {
  let safe = ''
  for (let i = 0; i < name.length; i++) {
    const c = name[i]
    safe += /[A-Za-z0-9_-]/.test(c) ? c : '_'
  }
  return safe
}

/** the names Windows keeps for devices */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** b0r3d QR's own step: a safe name Windows keeps for a device gets _ on the end, so the zip unpacks on Windows. */
const notADevice = (safe: string): string => (RESERVED.test(safe) ? safe + '_' : safe)

const isWord = (part: string): boolean => /^[A-Za-z0-9_]+$/.test(part)

/** A vCard's name: what follows its first "FN:" that has something after it, to the line's end, trimmed, its runs of white space made _. */
function vCardName(card: string): string {
  for (let i = card.indexOf('FN:'); i >= 0; i = card.indexOf('FN:', i + 1)) {
    const from = i + 3
    let to = from
    while (to < card.length && card[to] !== '\r' && card[to] !== '\n') to++
    if (to > from) return card.slice(from, to).trim().replace(/\s+/g, '_')
  }
  return ''
}

/** A link's site, as a name: after the first http:// or https:// with anything but / after it, up to the next /, its characters but A-Z, a-z and 0-9 made _. */
function siteName(text: string): string | null {
  const site = /https?:\/\/([^/]+)/.exec(text)
  return site ? site[1].replace(/[^A-Za-z0-9]/g, '_') : null
}

/**
 * A name from a code's text, for a row with no file name or caption: a vCard after the name on it;
 * text with more than one / after its last part if that's a word, else the part before it if that
 * is, else its site, else "qr_code_" and the row's index; any other text, trimmed.
 */
function nameFromText(text: string, index: number): string {
  if (text.startsWith('BEGIN:VCARD')) return vCardName(text)
  const parts = text.split('/')
  if (parts.length <= 2) return text.trim()
  if (isWord(parts[parts.length - 1])) return parts[parts.length - 1]
  if (isWord(parts[parts.length - 2])) return parts[parts.length - 2]
  return siteName(text) ?? `qr_code_${index}`
}

/**
 * The QR files' names, one a row in order, as the site names them: its file name, else its caption,
 * else one from its text; an earlier row's name again gets the row's index ("same-1"); then made
 * safe. b0r3d QR's own steps after: a device's name gets _, and a safe name given already gets the
 * index too, then -3, -4 and so on until it's new (the site's zip kept only one of two files of the
 * same name).
 */
export function qrNames(rows: BatchRow[]): string[] {
  const named = new Set<string>()
  const given = new Set<string>()
  return rows.map((row, i) => {
    let name = row.fileName ? row.fileName : row.frameText ? row.frameText : nameFromText(row.data ?? '', i)
    if (named.has(name)) name += `-${i}`
    named.add(name)
    const safe = notADevice(safeName(name))
    let file = safe
    if (given.has(file)) file = `${safe}-${i}`
    for (let n = 3; given.has(file); n++) file = `${safe}-${i}-${n}`
    given.add(file)
    return file
  })
}

/**
 * A name not given yet: `wanted` itself, else `wanted` with _first, _first+1 and so on. Each try
 * that was taken stays taken (names are only ever added), so the next row wanting the same name
 * starts where the last one stopped: the same names as counting from the start every time, without
 * a batch of 100,000 rows of one name taking minutes.
 */
function numbered(wanted: string, first: number, given: Set<string>, next: Map<string, number>): string {
  let name = wanted
  if (given.has(name)) {
    let n = next.get(wanted) ?? first
    while (given.has(`${wanted}_${n}`)) n++
    name = `${wanted}_${n}`
    next.set(wanted, n + 1)
  }
  given.add(name)
  return name
}

/** The barcode files' names: the CSV's file name, else the code's text, made safe, with _2, _3 and so on for one taken. */
export function barcodeNames(rows: BatchRow[]): string[] {
  const used = new Set<string>()
  const next = new Map<string, number>()
  return rows.map((row) => numbered(notADevice(safeName(row.fileName ? row.fileName : row.data)), 2, used, next))
}

/** The text files' names, for the rows made (`places[k]` being rows[k]'s place in the batch): the CSV's file name, else "qr-" and the place; _1, _2... for one given already. */
export function textNames(rows: BatchRow[], places: number[]): string[] {
  const given = new Set<string>()
  const next = new Map<string, number>()
  return rows.map((row, k) => numbered(notADevice(safeName(row.fileName ? row.fileName : `qr-${places[k]}`)), 1, given, next))
}

// ---------- what a batch makes ----------

export type BatchFormat = 'png' | 'jpg' | 'svg' | 'pdf' | 'text'

/** a batch's kind of file and what it's made with */
export interface BatchKind {
  /** barcodes of this type, or null for QR codes */
  barcode: BarcodeType | null
  /** QR codes: the design, its text and caption replaced by each row's */
  design: QrDesign
  /** QR codes: in a frame, each with its row's caption */
  frame: boolean
  /** QR codes: the design's logo is from a web address and was fetched (so it counts toward the level) */
  logoFetched: boolean
  format: BatchFormat
  textStyle: TextStyle
  markdown: boolean
}

export const extensionOf = (k: Pick<BatchKind, 'format' | 'markdown'>): string => (k.format === 'text' ? (k.markdown ? '.md' : '.txt') : `.${k.format}`)

/** One file of a batch: its row, its name (without the extension), why it can't be made (null when it can), and what reading it back must give. */
export interface BatchItem {
  row: BatchRow
  name: string | null
  problem: string | null
  expected: string | null
}

/**
 * The files a batch makes, named as the site names them, with the rows that can't be made and why;
 * null when `between` (asked after every 30 ms or so of work, so a page can draw in between) says
 * to stop. A barcode's problem comes from `barcodeProblem` (its type's checks, then zint's).
 */
export async function planBatch(
  rows: BatchRow[],
  kind: BatchKind,
  barcodeProblem: (type: BarcodeType, text: string) => Promise<string | null>,
  between: () => Promise<boolean> = async () => true
): Promise<BatchItem[] | null> {
  const items: BatchItem[] = []
  let worked = performance.now()
  for (const row of rows) {
    if (performance.now() - worked > 30) {
      if (!(await between())) return null
      worked = performance.now()
    }
    const item: BatchItem = { row, name: null, problem: null, expected: null }
    if (kind.barcode) {
      const format = barcodeFormat(kind.barcode)
      item.problem = await barcodeProblem(kind.barcode, row.data)
      if (item.problem === null) item.expected = format.expectedText(format.prepare(row.data))
    } else {
      try {
        const level = kind.format === 'text' ? kind.design.level : levelUsed(kind.design, kind.logoFetched)
        makeQrCode(row.data, level, kind.design.version, kind.design.utf8Marker)
        item.expected = row.data
      } catch (e) {
        if (!(e instanceof QrError)) throw e
        item.problem = e.message
      }
    }
    items.push(item)
  }
  // The names. QR pictures name every row (the site's batch never leaves one out); barcodes and
  // text files name only the rows they make, so a row left out doesn't take a name from the next.
  if (!kind.barcode && kind.format !== 'text') {
    const names = qrNames(rows)
    items.forEach((item, i) => (item.name = names[i]))
  } else {
    // (each made row with its place among all the rows: items[i] is rows[i])
    const places = items.flatMap((item, i) => (item.problem === null ? [i] : []))
    const made = places.map((i) => items[i])
    const names = kind.barcode
      ? barcodeNames(made.map((item) => item.row))
      : textNames(
          made.map((item) => item.row),
          places
        )
    made.forEach((item, i) => (item.name = names[i]))
  }
  return items
}

/** a caption font from a batch CSV, as the site reads it: one of its fonts by name or by its CSS, else as written; "" for Default (the frame's own) */
export function fontValue(font: string): string {
  if (font === 'Default') return ''
  return CAPTION_FONTS.find((f) => f.value === font || f.label === font)?.value ?? font
}

/**
 * A QR row's design: the batch's, with the row's text, and its caption and font when it's framed
 * (the default caption for a row without one, the design's font for a row without one, the default
 * font for "Default"). Text files have no logo.
 */
export function designFor(kind: BatchKind, row: BatchRow): QrDesign {
  const design = copyDesign(kind.design)
  design.data = row.data
  if (kind.format === 'text') design.logo = ''
  if (!kind.frame) design.frame = null
  else {
    design.frame ??= newFrame()
    design.frame.text = row.frameText.length > 0 ? row.frameText : DEFAULT_CAPTION
    if (row.font.length > 0) {
      const font = fontValue(row.font)
      design.frame.fontFamily = font.length > 0 ? font : null
    }
  }
  return design
}

/** the PDFs' titles: the CSV's file name, else "QR code <n>" (n from 1 after the header) or the barcode's text */
export const pdfTitle = (item: BatchItem, kind: BatchKind): string => (item.row.fileName.length > 0 ? item.row.fileName : kind.barcode ? item.row.data : `QR code ${item.row.row - 1}`)

/** the zip's name, as the site names it */
export const zipName = (kind: BatchKind): string =>
  kind.barcode ? `${barcodeFormat(kind.barcode).id}-batch.zip` : kind.format === 'text' ? `qr-codes-ascii-${{ half: 'unicode-half', full: 'unicode-full', ascii: 'ascii' }[kind.textStyle]}.zip` : 'qr-codes.zip'

/** A picture's pixels, four bytes (RGBA) a pixel, as ImageData has them. */
export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * A text file's code drawn back from its characters, 4 pixels a module, black on white: half blocks
 * are two modules each (▀ the top, ▄ the bottom, █ both), full blocks are ██ for a dark module, and
 * ASCII is ## for a light one; a Markdown file's ``` lines are left out.
 */
export function textPicture(text: string, style: TextStyle): Pixels {
  let lines = text.replace(/\r\n/g, '\n').split('\n')
  const fence = lines.findIndex((l) => l.startsWith('```'))
  if (fence >= 0) {
    let close = -1
    for (let i = fence + 1; i < lines.length; i++)
      if (lines[i].startsWith('```')) {
        close = i
        break
      }
    lines = lines.slice(fence + 1, close < 0 ? lines.length : close)
  }
  const grid: boolean[][] = []
  for (const line of lines) {
    const units = Array.from({ length: line.length }, (_, i) => line[i])
    if (style === 'half') {
      grid.push(units.map((c) => c === '█' || c === '▀'))
      grid.push(units.map((c) => c === '█' || c === '▄'))
    } else grid.push(Array.from({ length: Math.floor(line.length / 2) }, (_, i) => (style === 'full' ? line[2 * i] === '█' : line[2 * i] === ' ')))
  }
  const k = 4
  const columns = Math.max(1, grid.reduce((most, r) => Math.max(most, r.length), 0))
  const height = Math.max(1, grid.length) * k
  const width = columns * k
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c])
        for (let y = 0; y < k; y++)
          for (let x = 0; x < k; x++) {
            const at = ((r * k + y) * width + c * k + x) * 4
            data[at] = data[at + 1] = data[at + 2] = 0
          }
  return { width, height, data }
}

/** a short look at a row's text for the lists: one line, at most 60 characters */
export function glimpse(text: string): string {
  const line = (text ?? '').replace(/\r\n|\r|\n/g, ' ⏎ ')
  return line.length <= 60 ? line : line.slice(0, 57) + '…'
}

// ---------- examples and words ----------

/** The examples to start from (b0r3d QR's own, with every column the site reads). */
export const QR_EXAMPLE =
  'url,frameText,fileName,frameFontFamily\r\n' +
  'https://b0r3d.org,Visit b0r3d.org,b0r3d_home,Poppins\r\n' +
  'https://qr.b0r3d.org,Make your own codes,qr_maker,Roboto\r\n' +
  'https://b0r3d.org/95,"Play, then nap",b0r3d_95,\r\n' +
  'Plain text works too,,plain_text,\r\n'

export const CONTACTS_EXAMPLE =
  'firstName,lastName,org,position,phoneWork,phonePrivate,phoneMobile,email,website,street,zipcode,city,state,country,version,frameText,fileName,frameFontFamily\r\n' +
  'Rukus,Cat,b0r3d.org,Chief napper,+1 555 0100,,+1 555 0199,rukus@example.com,https://b0r3d.org,1 Loaf Lane,12345,Breadville,CA,USA,3.0,Call Rukus,rukus_card,Poppins\r\n' +
  'Ann,Lee,Example Co,Designer,,,+1 555 0123,ann@example.com,,,,,,,,Ann Lee,ann_lee,\r\n'

const quoted = (value: string): string => (/[,";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

export const barcodeExample = (type: BarcodeType): string => `data,fileName\r\n${quoted(barcodeFormat(type).example)},first_code\r\n`

export const QR_GUIDE =
  'The first row names the columns. Each row after it is a code: its text (a link, or any text) in the first column, then a frame caption and a file name ' +
  "if you like. A frameFontFamily column sets the caption's font. A file with firstName and lastName columns is a file of contacts: each row becomes a " +
  'contact card, with any of org, position, phoneWork, phonePrivate, phoneMobile, email, website, street, zipcode, city, state, country, version ' +
  '(2.1, 3.0 or 4.0; 3.0 if left out), frameText and fileName. A file without a name in it is named after its caption, else its text. ' +
  "Commas, semicolons or tabs; UTF-8 or Windows-1252. The files are made with the Create tab's design, and a frame shows each row's caption."

export const BARCODE_GUIDE =
  'A code a row: its text in the first column and a file name in the second, if you like. A first row naming the columns is optional: data, code, ' +
  'barcode, value, text or url for the code, and fileName, file name, file or name for the file. A file without a name is named after its text. ' +
  'Commas, semicolons or tabs; UTF-8 or Windows-1252.'
