// A code's design, as b0r3d QR's design files hold it: the data, the size and quiet zone, the
// shapes and colours of the dots and the corners, the background, a logo, the error correction and
// the size of the code, and a frame with a caption. Values are kept the way the file has them (a
// dot type this site doesn't know stays as it is, and is drawn as squares), so opening and saving
// a design changes nothing that wasn't changed.

import cupLogo from '../assets/presets/b0r3d-cup.png?inline'
import rukusLogo from '../assets/presets/rukus.png?inline'
import type { QrLevel } from './tables'

/** A frame around the code with a caption. Lengths are CSS strings ("16px"), as typed. */
export interface QrFrame {
  text: string
  /** top, bottom, left or right */
  position: string
  textColor: string
  backgroundColor: string
  borderColor: string
  borderWidth: string
  borderRadius: string
  padding: string
  /** A CSS family list, or null for the default. */
  fontFamily: string | null
  /** A data: URL (or a web address in a design file), or null. */
  backgroundImage: string | null
  /** The caption's column beside the code, left or right, in px. */
  captionWidth: number
}

export interface QrDesign {
  data: string
  /** "" none, a data: URL, a web address, or a path on the site. */
  logo: string
  /** The export's size in px; the code is square, the smaller of the two. */
  width: number
  height: number
  /** The quiet zone, in modules. */
  margin: number
  dotsType: string
  dotsColor: string
  cornersSquareType: string
  cornersSquareColor: string
  cornersDotType: string
  cornersDotColor: string
  /** Modules between the logo and the dots, taken out of the logo. */
  logoSpace: number
  /** The logo's share of what the level allows; null: 0.4. */
  logoSize: number | null
  level: QrLevel
  /** 1-40 at least, or 0 for the smallest that fits. */
  version: number
  /** Rounded corners for the whole code, in px at its size. */
  borderRadius: number
  /** A colour, or "transparent". */
  background: string
  /** Starts the code with ECI 26. */
  utf8Marker: boolean
  /** null: no frame. */
  frame: QrFrame | null
}

export const DEFAULT_LOGO_SIZE = 0.4
export const DEFAULT_CAPTION = 'Scan for more info'

/** The quiet zone the QR standard asks for; scanners can struggle with less. */
export const STANDARD_QUIET_ZONE = 4

export function isTransparent(css: string | null | undefined): boolean {
  return (css ?? '').trim().toLowerCase() === 'transparent'
}

export function hasLogo(d: QrDesign): boolean {
  return d.logo.trim().length > 0
}

export function besideCode(f: QrFrame): boolean {
  return f.position === 'left' || f.position === 'right'
}

/**
 * Whether the code clears room for the logo: any logo it has a picture for. One from a web address
 * counts once its picture has been fetched (`fetched`).
 */
export function logoCounts(d: QrDesign, fetched = false): boolean {
  if (!hasLogo(d)) return false
  return !/^https?:\/\//i.test(d.logo.trim()) || fetched
}

/** The level the code is made at: a logo needs at least Q. */
export function levelUsed(d: QrDesign, fetched = false): QrLevel {
  return logoCounts(d, fetched) && (d.level === 'L' || d.level === 'M') ? 'Q' : d.level
}

export function copyDesign(d: QrDesign): QrDesign {
  return { ...d, frame: d.frame ? { ...d.frame } : null }
}

export function newFrame(): QrFrame {
  return {
    text: DEFAULT_CAPTION,
    position: 'bottom',
    textColor: '#000000',
    backgroundColor: '#ffffff',
    borderColor: '#000000',
    borderWidth: '1px',
    borderRadius: '8px',
    padding: '16px',
    fontFamily: null,
    backgroundImage: null,
    captionWidth: 200
  }
}

// ---------- presets ----------

export const PRESET_NAMES = ['Plain', 'Rounded', 'Dots', 'b0r3d Cup', 'Rukus'] as const
export type PresetName = (typeof PRESET_NAMES)[number]

/** The shape names, in the order they're offered. */
export const DOT_TYPES = ['dots', 'rounded', 'classy', 'classy-rounded', 'square', 'extra-rounded'] as const
export const CORNER_SQUARE_TYPES = ['dot', 'square', 'rounded', 'extra-rounded'] as const
export const CORNER_DOT_TYPES = ['dot', 'square', 'rounded'] as const

/** The preset logos, as design files hold them: each PNG as a data: URL. */
export const PRESET_LOGOS = { cup: cupLogo, rukus: rukusLogo }

function look(d: QrDesign, dots: string, dotsColour: string, squares: string, squaresColour: string, centres: string, centresColour: string): void {
  d.dotsType = dots
  d.dotsColor = dotsColour
  d.cornersSquareType = squares
  d.cornersSquareColor = squaresColour
  d.cornersDotType = centres
  d.cornersDotColor = centresColour
}

/** `design` with a preset's look: every value the preset sets, the frame off. Never the data. */
export function applyPreset(name: string, design: QrDesign): QrDesign {
  const d = copyDesign(design)
  d.width = 200
  d.height = 200
  d.margin = 4
  d.logoSpace = 1
  d.logoSize = null
  d.version = 0
  d.background = '#ffffff'
  d.frame = null
  d.logo = ''
  d.level = 'Q'
  d.borderRadius = 16
  switch (name) {
    case 'Rounded':
      look(d, 'rounded', '#000000', 'extra-rounded', '#000000', 'dot', '#000000')
      break
    case 'Dots':
      look(d, 'dots', '#000000', 'dot', '#000000', 'dot', '#000000')
      break
    case 'b0r3d Cup':
      look(d, 'rounded', '#131313', 'extra-rounded', '#131313', 'dot', '#c000c0')
      d.level = 'H'
      d.logo = PRESET_LOGOS.cup
      break
    case 'Rukus':
      look(d, 'rounded', '#2b2b2b', 'extra-rounded', '#2b2b2b', 'dot', '#c0396b')
      d.level = 'H'
      d.logo = PRESET_LOGOS.rukus
      break
    default: // Plain
      look(d, 'square', '#000000', 'square', '#000000', 'square', '#000000')
      d.borderRadius = 0
  }
  return d
}

/** The Plain look: black squares on white, with the standard quiet zone. */
export function plainDesign(data = ''): QrDesign {
  const blank: QrDesign = {
    data,
    logo: '',
    width: 200,
    height: 200,
    margin: 4,
    dotsType: 'square',
    dotsColor: '#000000',
    cornersSquareType: 'square',
    cornersSquareColor: '#000000',
    cornersDotType: 'square',
    cornersDotColor: '#000000',
    logoSpace: 1,
    logoSize: null,
    level: 'Q',
    version: 0,
    borderRadius: 0,
    background: '#ffffff',
    utf8Marker: false,
    frame: null
  }
  return applyPreset('Plain', blank)
}

/**
 * The preset a design's look matches (its shapes, colours, logo, background and corners; a frame,
 * the size or the error correction changed since don't count), or null.
 */
export function matchingPreset(d: QrDesign): PresetName | null {
  for (const name of PRESET_NAMES) {
    const p = applyPreset(name, d)
    if (
      p.dotsType === d.dotsType && p.dotsColor === d.dotsColor &&
      p.cornersSquareType === d.cornersSquareType && p.cornersSquareColor === d.cornersSquareColor &&
      p.cornersDotType === d.cornersDotType && p.cornersDotColor === d.cornersDotColor &&
      p.logo === d.logo && p.background === d.background && p.borderRadius === d.borderRadius
    ) return name
  }
  return null
}

// ---------- the frame's presets ----------

export const FRAME_PRESETS = ['Default Frame', 'Dark Frame', 'Borderless Frame'] as const

/** A frame preset: its colours and lengths, keeping the caption and its place; the default font, no picture. */
export function applyFramePreset(name: string, current: QrFrame | null): QrFrame {
  const f: QrFrame = current ? { ...current } : newFrame()
  f.fontFamily = null
  f.backgroundImage = null
  f.borderWidth = '1px'
  f.borderRadius = '8px'
  f.padding = '16px'
  switch (name) {
    case 'Dark Frame':
      f.textColor = '#ffffff'
      f.backgroundColor = '#000000'
      f.borderColor = '#ffffff'
      break
    case 'Borderless Frame':
      f.textColor = '#000000'
      f.backgroundColor = '#ffffff'
      f.borderColor = '#ffffff'
      f.borderWidth = '0px'
      f.borderRadius = '0px'
      break
    default:
      f.textColor = '#000000'
      f.backgroundColor = '#ffffff'
      f.borderColor = '#000000'
  }
  return f
}

/** The frame preset a frame matches, or null. */
export function matchingFramePreset(f: QrFrame): string | null {
  for (const name of FRAME_PRESETS) {
    const p = applyFramePreset(name, f)
    if (
      p.textColor === f.textColor && p.backgroundColor === f.backgroundColor && p.borderColor === f.borderColor &&
      p.borderWidth === f.borderWidth && p.borderRadius === f.borderRadius && p.padding === f.padding &&
      !f.fontFamily && !f.backgroundImage
    ) return name
  }
  return null
}

// ---------- Randomize ----------

/**
 * Random shapes and colours (always six digits); the logo, quiet zone, error correction, size and
 * frame stay. `random` gives numbers from 0 up to 1, like Math.random.
 */
export function randomize(design: QrDesign, random: () => number = Math.random): QrDesign {
  const d = copyDesign(design)
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]
  d.dotsType = pick(DOT_TYPES)
  d.cornersSquareType = pick(CORNER_SQUARE_TYPES)
  d.cornersDotType = pick(CORNER_DOT_TYPES)
  const colour = () => '#' + Math.floor(random() * 0x1000000).toString(16).padStart(6, '0')
  d.dotsColor = colour()
  d.cornersSquareColor = colour()
  d.cornersDotColor = colour()
  d.background = colour()
  return d
}
