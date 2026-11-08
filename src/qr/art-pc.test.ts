import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import pcApp from '../test/pc-app-art.json'
import { QrArt } from './art'
import { designWarnings, inTheCode } from './checks'
import { PRESET_LOGOS, plainDesign } from './design'
import { readDesign } from './design-file'
import { codeText, pictureSize } from './export'

// What the PC app (b0r3d QR 0.8, its code loaded by reflection, no window) draws and says for 243
// designs: every dot, corner square and corner dot shape (and ones it doesn't know), logos with
// every share and space, frames on every side with captions, colours, quiet zones and sizes. The
// website must write the same SVG files and text, character for character (kept here as their
// SHA-256), size its pictures the same, and give the same warnings.
interface PcArt {
  name: string
  file: string
  svgSha256?: string | null
  svgLength?: number | null
  width?: number
  height?: number
  W?: number
  H?: number
  warnings?: string[]
  inCode?: string[]
  cleared?: number
  logoModules?: number
  logoSpaceUsed?: number
  levelUsed?: string
  raised?: boolean
  lines?: string[]
  textSha256?: string[] | null
  error: string | null
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const withCup = (s: string) => s.split('{{CUP}}').join(PRESET_LOGOS.cup)

// the page's measure of a caption's lines: here, a short caption's words always fit its column
const shortCaption = (file: string) => {
  const frame = JSON.parse(file).frame
  return frame && (frame.text === 'Scan me' || frame.text === '')
}

describe('the same pictures as the PC app', () => {
  it.each((pcApp as PcArt[]).map((c) => [c.name, c] as const))('%s', (_, c) => {
    const d = readDesign(withCup(c.file), plainDesign(''))
    if (c.error !== null) {
      expect(() => new QrArt(d)).toThrow(c.error)
      return
    }
    const art = new QrArt(d)
    const svg = art.toSvg()
    expect(svg.length).toBe(c.svgLength)
    expect(sha(svg)).toBe(c.svgSha256)
    expect([art.W, art.H]).toEqual([c.W, c.H])
    expect(art.captionLines).toEqual(c.lines)
    expect(designWarnings(d)).toEqual(c.warnings)
    expect(inTheCode(art).flat()).toEqual(c.inCode)
    expect([art.cleared, art.logoModules, art.logoSpaceUsed]).toEqual([c.cleared, c.logoModules, c.logoSpaceUsed])
    expect([art.levelUsed, art.levelRaised]).toEqual([c.levelUsed, c.raised])
    expect((['half', 'full', 'ascii'] as const).map((style) => sha(codeText(d, style, art.levelUsed)))).toEqual(c.textSha256)
    if (!d.frame || shortCaption(c.file)) {
      const size = pictureSize(art, () => 0)
      expect([size.width, size.height]).toEqual([c.width, c.height])
    }
  })
})
