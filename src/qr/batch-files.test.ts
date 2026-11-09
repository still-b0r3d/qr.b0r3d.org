import { crc32 as crc32Node, inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { barcodeNames, textNames, textPicture } from './batch'
import { makeQrCode } from './code'
import { plainDesign } from './design'
import { codeText, markdown, type TextStyle } from './export'
import { makePdf, readPdfPicture } from './pdf'
import { ZipWriter, zipEntries, zipRead } from './zip'

// A batch's zip, written here and read back; a text file's code drawn back from its characters; and
// the picture read back out of a PDF made here.

describe('a batch’s zip', () => {
  it('gives back every file as it went in: deflated when that’s smaller, stored when not, names in UTF-8', async () => {
    // (noise doesn't get smaller, so it's stored)
    const noise = crypto.getRandomValues(new Uint8Array(5000))
    const files = [
      { name: 'b0r3d_home.svg', bytes: new TextEncoder().encode('<svg>' + 'a'.repeat(4000) + '</svg>') },
      { name: 'noise.png', bytes: noise },
      { name: 'empty.txt', bytes: new Uint8Array() },
      { name: 'café ☕ (2).md', bytes: new TextEncoder().encode('```\n' + '██  ▀▀▄▄\n'.repeat(40) + '```\n') }
    ]
    const zip = new ZipWriter(new Date(2026, 10, 8, 18, 30, 15))
    for (const f of files) await zip.add(f)
    const blob = zip.finish()
    const entries = await zipEntries(blob)
    expect(entries.map((e) => [e.name, e.method])).toEqual([
      ['b0r3d_home.svg', 8],
      ['noise.png', 0],
      ['empty.txt', 0],
      ['café ☕ (2).md', 8]
    ])
    for (let i = 0; i < files.length; i++) expect(await zipRead(blob, entries[i])).toEqual(files[i].bytes)
    // the names are marked UTF-8, and the time is the local time to 2 seconds
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint16(6, true)).toBe(0x0800)
    expect(view.getUint16(10, true)).toBe((18 << 11) | (30 << 5) | 7)
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (11 << 5) | 8)
  })

  it('reads the same to another unzipper, one going through the local headers as it streams', async () => {
    const files = [
      { name: 'first.svg', bytes: new TextEncoder().encode('<svg>' + 'b0r3d '.repeat(500) + '</svg>') },
      { name: 'noise.png', bytes: crypto.getRandomValues(new Uint8Array(2000)) },
      { name: 'empty.txt', bytes: new Uint8Array() },
      { name: 'Ünïcode name.md', bytes: new TextEncoder().encode('```\n██\n```\n'.repeat(30)) }
    ]
    const zip = new ZipWriter()
    for (const f of files) await zip.add(f)
    const bytes = Buffer.from(await zip.finish().arrayBuffer())
    let at = 0
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    for (const f of files) {
      expect(bytes.readUInt32LE(at)).toBe(0x04034b50)
      const flags = bytes.readUInt16LE(at + 6)
      const method = bytes.readUInt16LE(at + 8)
      const crc = bytes.readUInt32LE(at + 14)
      const packed = bytes.readUInt32LE(at + 18)
      const size = bytes.readUInt32LE(at + 22)
      const nameLength = bytes.readUInt16LE(at + 26)
      const extraLength = bytes.readUInt16LE(at + 28)
      expect(flags & 0x0800).toBe(0x0800)
      expect(bytes.toString('utf8', at + 30, at + 30 + nameLength)).toBe(f.name)
      const data = bytes.subarray(at + 30 + nameLength + extraLength, at + 30 + nameLength + extraLength + packed)
      const out = method === 8 ? inflateRawSync(data) : method === 0 ? data : null
      expect(out && new Uint8Array(out)).toEqual(f.bytes)
      expect([size, crc]).toEqual([f.bytes.length, crc32Node(f.bytes)])
      at += 30 + nameLength + extraLength + packed
    }
    // the list of files starts where the last one ends
    expect(at).toBe(central)
  })

  it('a damaged file is caught by its CRC', async () => {
    const zip = new ZipWriter()
    await zip.add({ name: 'a.txt', bytes: new Uint8Array([1, 2, 3, 4, 5]) })
    const bytes = new Uint8Array(await zip.finish().arrayBuffer())
    bytes[30 + 'a.txt'.length + 2] ^= 0xff
    const blob = new Blob([bytes])
    await expect(zipRead(blob, (await zipEntries(blob))[0])).rejects.toThrow('a.txt came out different')
  })

  it('Zip64 records once there are more than 65,535 files', async () => {
    const zip = new ZipWriter()
    const count = 65_536
    for (let i = 0; i < count; i++) await zip.add({ name: `f${String(i).padStart(5, '0')}.txt`, bytes: new Uint8Array() })
    const blob = zip.finish()
    const tail = new DataView(await blob.slice(blob.size - 22).arrayBuffer())
    expect(tail.getUint32(0, true)).toBe(0x06054b50)
    expect(tail.getUint16(10, true)).toBe(0xffff)
    const entries = await zipEntries(blob)
    expect(entries.length).toBe(count)
    expect(entries[count - 1].name).toBe('f65535.txt')
    expect(await zipRead(blob, entries[count - 1])).toEqual(new Uint8Array())
  }, 60_000)
})

describe('a big batch’s names', () => {
  it('100,000 rows of one name are named at once, as one by one would name them', () => {
    const rows = Array.from({ length: 100_000 }, (_, i) => ({ row: i + 2, data: '5901234123457', frameText: '', fileName: 'label', font: '' }))
    const names = barcodeNames(rows)
    expect([names[0], names[1], names[99_999]]).toEqual(['label', 'label_2', 'label_100000'])
    const text = textNames(rows, rows.map((_, i) => i))
    expect([text[0], text[1], text[99_999]]).toEqual(['label', 'label_1', 'label_99999'])
  })
})

describe('a text file’s code, drawn back from its characters', () => {
  const text = 'https://b0r3d.org/95'
  const code = makeQrCode(text, 'M')
  const n = code.size + 8
  const darkAt = (r: number, c: number) => r >= 4 && c >= 4 && r < n - 4 && c < n - 4 && code.dark(r - 4, c - 4)

  for (const style of ['half', 'full', 'ascii'] as TextStyle[])
    for (const asMarkdown of [false, true])
      it(`${style}${asMarkdown ? ', in Markdown' : ''}: 4 pixels a module, every module as it is in the code`, () => {
        const design = { ...plainDesign(text), level: 'M' as const }
        const written = codeText(design, style, 'M')
        const p = textPicture(asMarkdown ? markdown(written) : written, style)
        expect([p.width, p.height]).toEqual([n * 4, (style === 'half' ? n + (n % 2) : n) * 4])
        for (let r = 0; r < n; r++)
          for (let c = 0; c < n; c++) {
            const at = ((r * 4 + 1) * p.width + c * 4 + 2) * 4
            expect(p.data[at] === 0, `${r},${c}`).toBe(darkAt(r, c))
          }
      })
})

describe('the picture in a PDF made here', () => {
  it('its own pixels, on white where they’re see-through', async () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 128, 10, 20, 30, 0, 200, 100, 50, 255])
    const pdf = new Uint8Array(await (await makePdf(rgba, 2, 2, 72, 72, 'Batch', 'b0r3d QR')).arrayBuffer())
    const p = await readPdfPicture(pdf)
    expect(p && [p.width, p.height]).toEqual([2, 2])
    const on = (c: number, a: number) => Math.floor((c * a + 255 * (255 - a) + 127) / 255)
    expect([...p!.data]).toEqual([0, 0, 0, 255, 255, on(0, 128), on(0, 128), 255, 255, 255, 255, 255, 200, 100, 50, 255])
  })

  it('nothing from a PDF that isn’t one of ours', async () => {
    expect(await readPdfPicture(new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n'))).toBeNull()
  })
})
