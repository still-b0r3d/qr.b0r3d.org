// Batch export's zip files: written here (no library), each file deflated when that makes it
// smaller and stored as it is when not, names in UTF-8; Zip64 records once there are more than
// 65,535 files or the zip passes 4 GB, as Windows and every unzip program read them. And read back:
// each file out of the finished zip, for the batch to check against what it made.

import { crc32 } from './print'

/** One file for a zip: its name in the zip, and its bytes. */
export interface ZipFile {
  name: string
  bytes: Uint8Array
}

const U16 = 0xffff
const U32 = 0xffffffff

async function streamed(bytes: Uint8Array, through: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(through)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** deflated as a zip has it (no zlib header), or null where this browser can't */
async function deflated(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    return await streamed(bytes, new CompressionStream('deflate-raw'))
  } catch {
    return null
  }
}

/** the time as MS-DOS writes it in a zip: its local time to 2 seconds, from 1980 */
function dosTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear())
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  }
}

class Bytes {
  private readonly view: DataView
  readonly bytes: Uint8Array
  private at = 0
  constructor(size: number) {
    this.bytes = new Uint8Array(size)
    this.view = new DataView(this.bytes.buffer)
  }
  u16(v: number): this {
    this.view.setUint16(this.at, v, true)
    this.at += 2
    return this
  }
  u32(v: number): this {
    this.view.setUint32(this.at, v >>> 0, true)
    this.at += 4
    return this
  }
  u64(v: number): this {
    this.view.setUint32(this.at, v % 0x100000000, true)
    this.view.setUint32(this.at + 4, Math.floor(v / 0x100000000), true)
    this.at += 8
    return this
  }
  put(b: Uint8Array): this {
    this.bytes.set(b, this.at)
    this.at += b.length
    return this
  }
}

interface Written {
  name: Uint8Array
  method: number
  crc: number
  packed: number
  size: number
  offset: number
}

/**
 * Makes a zip a file at a time: `add` each, then `finish` (once) for the zip itself. Each file goes
 * into a Blob of its own as it's added, so the browser keeps the bytes (on disk when there are a
 * lot of them) and the page lets them go.
 */
export class ZipWriter {
  private parts: Blob[] = []
  private readonly written: Written[] = []
  private length = 0
  private readonly stamp: { time: number; date: number }

  constructor(when: Date = new Date()) {
    this.stamp = dosTime(when)
  }

  get count(): number {
    return this.written.length
  }

  async add(file: ZipFile): Promise<void> {
    const name = new TextEncoder().encode(file.name)
    const crc = crc32(file.bytes)
    const packed = file.bytes.length > 0 ? await deflated(file.bytes) : null
    const smaller = packed !== null && packed.length < file.bytes.length
    const data = smaller ? packed : file.bytes
    const method = smaller ? 8 : 0
    // each file is under 4 GB (a picture can't be that big), so only where it starts can need Zip64
    const header = new Bytes(30 + name.length)
      .u32(0x04034b50)
      .u16(20)
      .u16(0x0800) // the name is UTF-8
      .u16(method)
      .u16(this.stamp.time)
      .u16(this.stamp.date)
      .u32(crc)
      .u32(data.length)
      .u32(file.bytes.length)
      .u16(name.length)
      .u16(0)
      .put(name)
    this.written.push({ name, method, crc, packed: data.length, size: file.bytes.length, offset: this.length })
    this.parts.push(new Blob([header.bytes as Uint8Array<ArrayBuffer>, data as Uint8Array<ArrayBuffer>]))
    this.length += header.bytes.length + data.length
  }

  /** The zip, its list of files at the end. */
  finish(): Blob {
    const start = this.length
    let size = 0
    const central: Uint8Array[] = []
    for (const w of this.written) {
      const far = w.offset >= U32
      const entry = new Bytes(46 + w.name.length + (far ? 12 : 0))
        .u32(0x02014b50)
        .u16(far ? 45 : 20)
        .u16(far ? 45 : 20)
        .u16(0x0800)
        .u16(w.method)
        .u16(this.stamp.time)
        .u16(this.stamp.date)
        .u32(w.crc)
        .u32(w.packed)
        .u32(w.size)
        .u16(w.name.length)
        .u16(far ? 12 : 0)
        .u16(0)
        .u16(0)
        .u16(0)
        .u32(0)
        .u32(far ? U32 : w.offset)
        .put(w.name)
      if (far) entry.u16(0x0001).u16(8).u64(w.offset)
      central.push(entry.bytes)
      size += entry.bytes.length
    }
    const count = this.written.length
    const zip64 = count >= U16 || start >= U32 || size >= U32 || this.written.some((w) => w.offset >= U32)
    const end: Uint8Array[] = []
    if (zip64) {
      const record = new Bytes(56).u32(0x06064b50).u64(44).u16(45).u16(45).u32(0).u32(0).u64(count).u64(count).u64(size).u64(start)
      const locator = new Bytes(20).u32(0x07064b50).u32(0).u64(start + size).u32(1)
      end.push(record.bytes, locator.bytes)
    }
    end.push(
      new Bytes(22)
        .u32(0x06054b50)
        .u16(0)
        .u16(0)
        .u16(Math.min(count, U16))
        .u16(Math.min(count, U16))
        .u32(Math.min(size, U32))
        .u32(Math.min(start, U32))
        .u16(0).bytes
    )
    const zip = new Blob([...this.parts, ...(central as Uint8Array<ArrayBuffer>[]), ...(end as Uint8Array<ArrayBuffer>[])], { type: 'application/zip' })
    this.parts = []
    return zip
  }
}

/** A file in a zip: its name, and where its bytes are. */
export interface ZipEntry {
  name: string
  method: number
  crc: number
  packed: number
  size: number
  offset: number
}

/** A zip that doesn't read as one. */
export class ZipProblem extends Error {}

const u64 = (view: DataView, at: number): number => view.getUint32(at, true) + view.getUint32(at + 4, true) * 0x100000000

async function slice(zip: Blob, from: number, to: number): Promise<DataView> {
  return new DataView(await zip.slice(from, to).arrayBuffer())
}

/** The files a zip lists (from its list at the end, Zip64 or not). */
export async function zipEntries(zip: Blob): Promise<ZipEntry[]> {
  const tail = Math.min(zip.size, 22 + 0xffff + 20)
  const end = await slice(zip, zip.size - tail, zip.size)
  let at = -1
  for (let i = end.byteLength - 22; i >= 0; i--)
    if (end.getUint32(i, true) === 0x06054b50) {
      at = i
      break
    }
  if (at < 0) throw new ZipProblem("it isn't a zip")
  let count = end.getUint16(at + 10, true)
  let size = end.getUint32(at + 12, true)
  let start = end.getUint32(at + 16, true)
  if (at >= 20 && end.getUint32(at - 20, true) === 0x07064b50) {
    const record = await slice(zip, u64(end, at - 12), u64(end, at - 12) + 56)
    if (record.getUint32(0, true) !== 0x06064b50) throw new ZipProblem('its Zip64 record is missing')
    count = u64(record, 32)
    size = u64(record, 40)
    start = u64(record, 48)
  }
  const list = await slice(zip, start, start + size)
  const entries: ZipEntry[] = []
  const decoder = new TextDecoder()
  for (let p = 0, n = 0; n < count; n++) {
    if (p + 46 > list.byteLength || list.getUint32(p, true) !== 0x02014b50) throw new ZipProblem('its list of files is damaged')
    const nameLength = list.getUint16(p + 28, true)
    const extraLength = list.getUint16(p + 30, true)
    const commentLength = list.getUint16(p + 32, true)
    const name = decoder.decode(new Uint8Array(list.buffer, list.byteOffset + p + 46, nameLength))
    let packed = list.getUint32(p + 20, true)
    let size = list.getUint32(p + 24, true)
    let offset = list.getUint32(p + 42, true)
    // Zip64's sizes and start, in that order, for the ones written as FFFFFFFF
    for (let e = p + 46 + nameLength; e + 4 <= p + 46 + nameLength + extraLength; ) {
      const id = list.getUint16(e, true)
      const length = list.getUint16(e + 2, true)
      if (id === 0x0001) {
        let q = e + 4
        if (size === U32) {
          size = u64(list, q)
          q += 8
        }
        if (packed === U32) {
          packed = u64(list, q)
          q += 8
        }
        if (offset === U32) offset = u64(list, q)
      }
      e += 4 + length
    }
    entries.push({ name, method: list.getUint16(p + 10, true), crc: list.getUint32(p + 16, true), packed, size, offset })
    p += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** A file's bytes out of a zip, checked against its CRC-32. */
export async function zipRead(zip: Blob, entry: ZipEntry): Promise<Uint8Array> {
  const header = await slice(zip, entry.offset, entry.offset + 30)
  if (header.byteLength < 30 || header.getUint32(0, true) !== 0x04034b50) throw new ZipProblem(`${entry.name} isn't where the zip says`)
  const from = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
  const raw = new Uint8Array(await zip.slice(from, from + entry.packed).arrayBuffer())
  let bytes: Uint8Array
  if (entry.method === 0) bytes = raw
  else if (entry.method === 8) bytes = await streamed(raw, new DecompressionStream('deflate-raw'))
  else throw new ZipProblem(`${entry.name} is packed in a way this page doesn't read`)
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new ZipProblem(`${entry.name} came out different`)
  return bytes
}
