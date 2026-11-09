// Batch export's CSV files, read as b0r3d QR reads them (the PC app's Csv, written to read them the
// way the site always has), so a file gives the same rows on both: records and quotes much as RFC
// 4180 has them, with the site's own ways on top (one separator for the file, chosen from its first
// record; values trimmed, and an apostrophe taken off each end; its own way with CRs).

/** A CSV's records, each a list of values (records of nothing but white space left out), and the separator they were cut at. */
export interface CsvTable {
  separator: string
  records: string[][]
}

/**
 * A file's text: its bytes as UTF-8 when they are UTF-8 (any broken sequence means they aren't),
 * with one byte order mark at the start dropped; else as Windows-1252, as Excel saves a CSV on a
 * Western PC (all 256 bytes are characters there, and nothing is dropped).
 */
export function csvText(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
  return text.length > 0 && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

const isSpace = (c: string): boolean => /\s/.test(c)

/**
 * A CSV's records and their separator, in one go through the text. The separator comes from the
 * first record that isn't blank, before any of it is cut into values: from its commas, semicolons
 * and tabs outside quotes (a semicolon when it has more of them than commas and at least as many
 * as tabs, else a tab when it has more of them than commas, else a comma).
 */
export function parseCsv(text: string): CsvTable {
  const table: CsvTable = { separator: ',', records: [] }
  const reader = new Reader(text)
  if (!reader.next()) return table
  table.separator = reader.separator()
  do table.records.push(reader.values(table.separator))
  while (reader.next())
  return table
}

/**
 * Goes through a CSV's text a record at a time. A record runs to a line end (LF, or CR LF) outside
 * quotes, or to the end of the text; a CR on its own is a character of the record. A quote starts a
 * quoted stretch anywhere in a value and the next quote ends it, except that two quotes in a row
 * inside one are a quote in the value; a quote that's never closed runs to the end of the text.
 */
class Reader {
  private nextAt = 0
  private start = 0
  private end = 0
  private dropped = -1
  private commas = 0
  private semicolons = 0
  private tabs = 0

  constructor(private readonly text: string) {}

  /** Finds the next record that isn't blank (nothing but white space as it's written); false when there are no more. */
  next(): boolean {
    const text = this.text
    while (this.nextAt <= text.length) {
      this.start = this.nextAt
      let i = this.start
      let firstCr = -1
      let quoted = false
      let blank = true
      let crlf = false
      this.commas = this.semicolons = this.tabs = 0
      for (; i < text.length; i++) {
        const c = text[i]
        if (!quoted && c === '\n') break
        if (!quoted && c === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          crlf = true
          break
        }
        if (c === '"') quoted = !quoted
        else if (c === '\r' && firstCr < 0) firstCr = i
        else if (!quoted && c === ',') this.commas++
        else if (!quoted && c === ';') this.semicolons++
        else if (!quoted && c === '\t') this.tabs++
        blank &&= isSpace(c)
      }
      this.end = i
      this.nextAt = crlf ? i + 2 : i + 1
      // the site's way with CRs: a record that ends with a lone LF, or with the end of the text,
      // goes without the first CR in it (in quotes or not), and the rest of the reading never sees
      // that CR (so it can bring two quotes together); one that ends with CR LF keeps them all
      this.dropped = crlf ? -1 : firstCr
      if (!blank) return true
    }
    return false
  }

  separator(): string {
    return this.semicolons > this.commas && this.semicolons >= this.tabs ? ';' : this.tabs > this.commas ? '\t' : ','
  }

  /** The record's values: cut at the separator where it's outside quotes, without the quotes, and each trimmed. */
  values(separator: string): string[] {
    const text = this.text
    const values: string[] = []
    let value = ''
    let quoted = false
    for (let i = this.start; i < this.end; i++) {
      if (i === this.dropped) continue
      const c = text[i]
      if (c === '"') {
        const after = i + 1 === this.dropped ? i + 2 : i + 1 // the next character, past a dropped CR
        if (quoted && after < this.end && text[after] === '"') {
          value += '"'
          i = after
        } else quoted = !quoted
      } else if (c === separator && !quoted) {
        values.push(finish(value))
        value = ''
      } else value += c
    }
    values.push(finish(value))
    return values
  }
}

/** a value as the site uses it: trimmed, then one apostrophe taken off its start and one off its end where they are, and not trimmed again */
function finish(raw: string): string {
  let value = raw.trim()
  if (value.length > 0 && value[0] === "'") value = value.slice(1)
  if (value.length > 0 && value[value.length - 1] === "'") value = value.slice(0, -1)
  return value
}
