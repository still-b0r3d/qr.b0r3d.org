import { describe, expect, it } from 'vitest'
import pcApp from '../test/pc-app-designs.json'
import { applyPreset, plainDesign } from './design'
import { DesignFileError, keptDesign, readDesign, writeDesign } from './design-file'
import { jsonNumber } from './json'

// What the PC app (b0r3d QR 0.8, its code loaded by reflection, no window) makes of these design
// files: read, then written again (with and without the text), or the reason it refuses one. The
// website must give the same files, byte for byte, and refuse the same ones.
interface PcFile {
  input: string
  output: string | null
  kept: string | null
  error: string | null
}

describe('design files, as the PC app reads and writes them', () => {
  it.each((pcApp.files as PcFile[]).map((f, i) => [i, f.input.replace(/\s+/g, ' ').slice(0, 60), f] as const))('#%i %s', (_, __, f) => {
    if (f.error !== null) {
      expect(() => readDesign(f.input, plainDesign(''))).toThrow(DesignFileError)
      expect(() => readDesign(f.input, plainDesign(''))).toThrow(f.error)
      return
    }
    const d = readDesign(f.input, plainDesign(''))
    expect(writeDesign(d)).toBe(f.output)
    expect(writeDesign(d, false)).toBe(f.kept)
  })

  it.each(pcApp.presets.map((p) => [p.name, p] as const))('the %s preset', (name, p) => {
    expect(writeDesign(applyPreset(name, plainDesign('https://b0r3d.org')))).toBe(p.file)
  })
})

describe('the design the browser keeps', () => {
  it("is today's site's format: one line, without the text", () => {
    expect(keptDesign(plainDesign('https://b0r3d.org'))).toBe(
      '{"schemaVersion":1,"props":{"image":"","width":200,"height":200,"margin":4,"dotsOptions":{"color":"#000000","type":"square"},"cornersSquareOptions":{"color":"#000000","type":"square"},"cornersDotOptions":{"color":"#000000","type":"square"},"imageOptions":{"padding":1},"qrOptions":{"errorCorrectionLevel":"Q","typeNumber":0}},"style":{"borderRadius":"0px","background":"#ffffff"},"frame":null}'
    )
  })

  it('opens what today\'s site kept, keeping the text it starts with', () => {
    const kept =
      '{"schemaVersion":1,"props":{"image":"","width":300,"height":300,"margin":2,"dotsOptions":{"color":"#c000c0","type":"dots"},"cornersSquareOptions":{"color":"#000000","type":"dot"},"cornersDotOptions":{"color":"#000000","type":"dot"},"imageOptions":{"padding":1},"qrOptions":{"errorCorrectionLevel":"H","typeNumber":0}},"style":{"borderRadius":"16px","background":"#ffffff"},"frame":null}'
    const d = readDesign(kept, plainDesign('https://b0r3d.org'))
    expect(d).toMatchObject({ data: 'https://b0r3d.org', width: 300, margin: 2, dotsType: 'dots', dotsColor: '#c000c0', level: 'H', borderRadius: 16 })
  })
})

describe('numbers in design files', () => {
  it('as .NET writes them', () => {
    expect(jsonNumber(200)).toBe('200')
    expect(jsonNumber(0.4)).toBe('0.4')
    expect(jsonNumber(1.5)).toBe('1.5')
    expect(jsonNumber(0.1 + 0.2)).toBe('0.30000000000000004')
    expect(jsonNumber(0.1 + 0.7)).toBe('0.79999999999999993')
    expect(jsonNumber(0.00001)).toBe('1E-05')
    expect(jsonNumber(1e20 + 0.5)).toBe('1E+20')
    expect(jsonNumber(-0)).toBe('0')
    expect(jsonNumber(Number.NaN)).toBe('0')
  })
})
