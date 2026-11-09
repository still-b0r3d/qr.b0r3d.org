import { describe, expect, it } from 'vitest'
import { pictureDimensions } from './picture-reader'

// A picture's size from its file's header, so a huge photo can be opened straight at the size it's
// read at.

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]
const le32 = (n: number) => [...le16(n & 0xffff), ...le16(n >>> 16)]

describe('a picture’s size from its header', () => {
  it('PNG, GIF, BMP', () => {
    expect(pictureDimensions(bytes([0x89], 'PNG', [13, 10, 26, 10], be32(13), 'IHDR', be32(100000), be32(75000), [8, 6, 0, 0, 0]))).toEqual({ width: 100000, height: 75000, turned: false })
    expect(pictureDimensions(bytes('GIF89a', le16(640), le16(480), [0]))).toEqual({ width: 640, height: 480, turned: false })
    const bmp = new Array(26).fill(0)
    bmp.splice(0, 2, 0x42, 0x4d)
    bmp.splice(14, 4, ...le32(40))
    bmp.splice(18, 8, ...le32(4000), ...le32(-3000 >>> 0))
    expect(pictureDimensions(new Uint8Array(bmp))).toEqual({ width: 4000, height: 3000, turned: false })
    // an old OS/2 BMP: its sizes are 16 bits
    const os2 = new Array(26).fill(0)
    os2.splice(0, 2, 0x42, 0x4d)
    os2.splice(14, 4, ...le32(12))
    os2.splice(18, 4, ...le16(320), ...le16(200))
    expect(pictureDimensions(new Uint8Array(os2))).toEqual({ width: 320, height: 200, turned: false })
    // a text that starts "BM" isn't a BMP
    expect(pictureDimensions(bytes('BMW,Audi,Volvo,Saab,Skoda\n'))).toBeNull()
  })

  it('JPEG: a camera’s quarter turn in its Exif data, either byte order', () => {
    const exif = (order: 'MM' | 'II', turn: number) => {
      const n16 = (v: number) => (order === 'MM' ? [v >> 8, v & 0xff] : [v & 0xff, v >> 8])
      const n32 = (v: number) => (order === 'MM' ? be32(v) : le32(v))
      const body = [...bytes('Exif'), 0, 0, ...bytes(order), ...n16(42), ...n32(8), ...n16(1), ...n16(0x0112), ...n16(3), ...n32(1), ...n16(turn), 0, 0, ...n32(0)]
      return [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]
    }
    // 6000 × 4500 as stored
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 8, ...[0x11, 0x94], ...[0x17, 0x70], 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const jpeg = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat(), ...sof0])
    expect(pictureDimensions(jpeg(exif('MM', 6)))).toEqual({ width: 6000, height: 4500, turned: true })
    expect(pictureDimensions(jpeg(exif('II', 8)))).toEqual({ width: 6000, height: 4500, turned: true })
    expect(pictureDimensions(jpeg(exif('II', 5)))).toEqual({ width: 6000, height: 4500, turned: true })
    // upright, upside down or mirrored: the same way round
    for (const turn of [1, 2, 3, 4]) expect(pictureDimensions(jpeg(exif('MM', turn)))!.turned).toBe(false)
    // no Exif, Exif that says nothing, and a turn that isn't one
    expect(pictureDimensions(jpeg())!.turned).toBe(false)
    expect(pictureDimensions(jpeg([0xff, 0xe1, 0x00, 0x08, ...bytes('Exif'), 0, 0]))!.turned).toBe(false)
    expect(pictureDimensions(jpeg(exif('MM', 9)))!.turned).toBe(false)
  })

  it('JPEG: the frame header after other segments', () => {
    const app1 = [0xff, 0xe1, 0x00, 0x08, 1, 2, 3, 4, 5, 6]
    const sof2 = [0xff, 0xc2, 0x00, 0x11, 8, ...[0x1f, 0x40], ...[0x2e, 0xe0], 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(pictureDimensions(new Uint8Array([0xff, 0xd8, ...app1, ...sof2]))).toEqual({ width: 12000, height: 8000, turned: false })
    // a Huffman table (C4) isn't a frame header
    const dht = [0xff, 0xc4, 0x00, 0x04, 0, 0]
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(pictureDimensions(new Uint8Array([0xff, 0xd8, ...dht, ...sof0]))).toEqual({ width: 640, height: 480, turned: false })
  })

  it('WebP: lossy, lossless and extended', () => {
    const riff = (chunk: string, body: number[]) => bytes('RIFF', le32(100), 'WEBP', chunk, le32(body.length), body, new Array(10).fill(0))
    expect(pictureDimensions(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(1920), ...le16(1080)]))).toEqual({ width: 1920, height: 1080, turned: false })
    // lossless: 14 bits each, less one
    const w = 2048 - 1
    const h = 1536 - 1
    expect(pictureDimensions(riff('VP8L', [0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f]))).toEqual({ width: 2048, height: 1536, turned: false })
    // extended: 24 bits each, less one (7999 is 0x1F3F, 3999 is 0x0F9F)
    expect(pictureDimensions(riff('VP8X', [0, 0, 0, 0, ...[0x3f, 0x1f, 0x00], ...[0x9f, 0x0f, 0x00]]))).toEqual({ width: 8000, height: 4000, turned: false })
  })

  it('nothing it knows', () => {
    expect(pictureDimensions(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(pictureDimensions(new Uint8Array())).toBeNull()
  })
})
