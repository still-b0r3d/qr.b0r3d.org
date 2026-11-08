// A code's design, as b0r3d QR's design files hold it: the data, the size and quiet zone, the
// shapes and colours of the dots and the corners, the background, the error correction and the size
// of the code. (Logos and frames join in the next stage of the rebuild.)

import type { QrLevel } from './tables'

export interface QrDesign {
  data: string
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
  level: QrLevel
  /** 1-40 at least, or 0 for the smallest that fits. */
  version: number
  /** A colour, or "transparent". */
  background: string
  /** Starts the code with ECI 26. */
  utf8Marker: boolean
}

/** The Plain look: black squares on white, with the standard quiet zone. */
export function plainDesign(data = ''): QrDesign {
  return {
    data,
    width: 200,
    height: 200,
    margin: 4,
    dotsType: 'square',
    dotsColor: '#000000',
    cornersSquareType: 'square',
    cornersSquareColor: '#000000',
    cornersDotType: 'square',
    cornersDotColor: '#000000',
    level: 'Q',
    version: 0,
    background: '#ffffff',
    utf8Marker: false
  }
}

/** The quiet zone the QR standard asks for; scanners can struggle with less. */
export const STANDARD_QUIET_ZONE = 4
