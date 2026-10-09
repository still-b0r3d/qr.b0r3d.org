import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import { createPdfBlob } from './pdf'

/** A w×h RGBA image: a black pixel at the top left, the rest `fill`. */
function image(width: number, height: number, fill: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) pixels.set(i === 0 ? [0, 0, 0, 255] : fill, i * 4)
  return { pixels, width, height }
}

async function parse(blob: Blob) {
  const bytes = Buffer.from(await blob.arrayBuffer())
  const text = bytes.toString('latin1')
  // Each object's dictionary and, if it has one, its stream bytes.
  const objects = new Map<number, { dict: string; stream?: Buffer }>()
  for (const m of text.matchAll(/(\d+) 0 obj\n/g)) {
    const start = m.index! + m[0].length
    const end = text.indexOf('\nendobj', start)
    const body = text.slice(start, end)
    const streamAt = body.indexOf('stream\n')
    const dict = streamAt >= 0 ? body.slice(0, streamAt) : body
    const length = Number(/\/Length (\d+)/.exec(dict)?.[1])
    const stream =
      streamAt >= 0
        ? bytes.subarray(start + streamAt + 7, start + streamAt + 7 + length)
        : undefined
    objects.set(Number(m[1]), { dict, stream })
  }
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1])
  const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
  return { text, objects, xrefAt, offsets }
}

const imageObject = (objects: Map<number, { dict: string; stream?: Buffer }>, space: string) =>
  [...objects.values()].find((o) => o.dict.includes('/Subtype /Image') && o.dict.includes(space))

describe('createPdfBlob', () => {
  it('is a valid PDF whose cross-reference table points at every object', async () => {
    const blob = await createPdfBlob({
      ...image(3, 2, [255, 255, 255, 255]),
      widthMm: 40,
      heightMm: 20
    })
    expect(blob.type).toBe('application/pdf')
    const { text, objects, xrefAt, offsets } = await parse(blob)
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text.slice(xrefAt).startsWith('xref\n')).toBe(true)
    expect(offsets).toHaveLength(objects.size)
    offsets.forEach((offset, i) =>
      expect(text.slice(offset).startsWith(`${i + 1} 0 obj\n`)).toBe(true)
    )
  })

  it('sizes the page in points from millimetres', async () => {
    const { text } = await parse(
      await createPdfBlob({ ...image(3, 2, [255, 255, 255, 255]), widthMm: 40, heightMm: 20 })
    )
    expect(text).toContain('/MediaBox [0 0 113.39 56.69]')
    expect(text).toContain('q 113.39 0 0 56.69 0 0 cm /Im1 Do Q')
  })

  it('stores the pixels losslessly, at their real size', async () => {
    const { objects } = await parse(
      await createPdfBlob({ ...image(3, 2, [10, 20, 30, 255]), widthMm: 10, heightMm: 10 })
    )
    const rgb = imageObject(objects, '/DeviceRGB')!
    expect(rgb.dict).toContain('/Width 3 /Height 2 /BitsPerComponent 8')
    expect(rgb.dict).toContain('/Filter /FlateDecode')
    expect(rgb.dict).not.toContain('DCTDecode')
    expect([...inflateSync(rgb.stream!)]).toEqual([0, 0, 0, ...Array(5).fill([10, 20, 30]).flat()])
  })

  it('has no soft mask when every pixel is opaque', async () => {
    const { objects } = await parse(
      await createPdfBlob({ ...image(2, 2, [255, 255, 255, 255]), widthMm: 10, heightMm: 10 })
    )
    expect(imageObject(objects, '/DeviceRGB')!.dict).not.toContain('/SMask')
    expect(imageObject(objects, '/DeviceGray')).toBeUndefined()
  })

  it('keeps a transparent background as a soft mask', async () => {
    const { objects } = await parse(
      await createPdfBlob({ ...image(2, 2, [0, 0, 0, 0]), widthMm: 10, heightMm: 10 })
    )
    const rgb = imageObject(objects, '/DeviceRGB')!
    const maskNumber = Number(/\/SMask (\d+) 0 R/.exec(rgb.dict)![1])
    const mask = objects.get(maskNumber)!
    expect(mask.dict).toContain('/ColorSpace /DeviceGray')
    expect([...inflateSync(mask.stream!)]).toEqual([255, 0, 0, 0])
  })

  it('writes the title, as UTF-16 when it is not plain ASCII', async () => {
    const make = (title: string) =>
      createPdfBlob({ ...image(1, 1, [0, 0, 0, 255]), widthMm: 1, heightMm: 1, title }).then(parse)
    expect((await make('Shelf (A)')).text).toContain('/Title (Shelf \\(A\\))')
    // C a f é
    expect((await make('Café')).text).toContain('/Title <FEFF00430061006600E9>')
  })

  it('rejects pixels that do not match the size', async () => {
    await expect(
      createPdfBlob({
        pixels: new Uint8ClampedArray(8),
        width: 3,
        height: 3,
        widthMm: 1,
        heightMm: 1
      })
    ).rejects.toThrow()
  })
})
