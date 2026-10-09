export type DotShape = 'square' | 'rounded' | 'extra-rounded' | 'classy' | 'classy-rounded' | 'dots'
export type CornerSquareShape = 'square' | 'rounded' | 'extra-rounded' | 'dot'
export type CornerDotShape = 'square' | 'rounded' | 'dot'
export type ECLevel = 'L' | 'M' | 'Q' | 'H'
export type TextPosition = 'top' | 'bottom' | 'left' | 'right'

export interface DotsConfig {
  shape?: DotShape
  color?: string
}

export interface CornerSquaresConfig {
  shape?: CornerSquareShape
  color?: string
}

export interface CornerDotsConfig {
  shape?: CornerDotShape
  color?: string
}

export interface BackgroundConfig {
  color?: string
}

export interface ImageConfig {
  href: string
  sizeRatio?: number
  /**
   * Blank space between the logo and the dots on each side, in modules.
   * Taken from inside the cleared centre square, so the logo shrinks and the
   * code loses no more modules than it would without it. 0 or absent = none.
   */
  padding?: number
  hideBackgroundDots?: boolean
  crossOrigin?: 'anonymous' | 'use-credentials'
}

export interface FrameConfig {
  text: string
  textPosition: TextPosition
  textColor?: string
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  padding?: number
  fontFamily?: string
  fontSize?: number
  /**
   * Side captions (left/right) only: caption column width in px, same units
   * as padding/fontSize. 0 or absent = auto (the QR size), mirroring the
   * preview's default caption column.
   */
  captionWidth?: number
  /**
   * Frame background image href (data:image URI or http(s) URL). Drawn over
   * backgroundColor, covering the whole frame, clipped to the border radius.
   */
  backgroundImage?: string
}

export interface QRCodeConfig {
  data: string
  size?: number
  margin?: number
  errorCorrectionLevel?: ECLevel
  /**
   * QR version (1-40) to use; the matrix is 17 + 4 * version modules wide.
   * When the data doesn't fit, the smallest larger version is used.
   * 0 or absent = the smallest version that fits.
   */
  version?: number
  /**
   * A ready-made module grid (true = dark) drawn in place of encoding `data`,
   * e.g. one with an ECI header from buildEciMatrix. It must encode `data` at
   * `errorCorrectionLevel` (as raised for a logo); `version` is then ignored.
   */
  matrix?: boolean[][]
  dots?: DotsConfig
  cornerSquares?: CornerSquaresConfig
  cornerDots?: CornerDotsConfig
  background?: BackgroundConfig
  image?: ImageConfig
  frame?: FrameConfig
}

export interface RasterOptions {
  width?: number
  height?: number
  quality?: number
  background?: string
}

export interface QRCodeInstance {
  readonly svgElement: SVGSVGElement
  update(partial: Partial<QRCodeConfig>): void
  toSVGString(): string
  toPNGBlob(opts?: RasterOptions): Promise<Blob>
  toJPGBlob(opts?: RasterOptions): Promise<Blob>
  attachTo(el: HTMLElement): void
  dispose(): void
}

export interface ResolvedQRCodeConfig {
  data: string
  size: number
  margin: number
  errorCorrectionLevel: ECLevel
  version: number
  matrix?: boolean[][]
  dots: Required<DotsConfig>
  cornerSquares: Required<CornerSquaresConfig>
  cornerDots: Required<CornerDotsConfig>
  background: Required<BackgroundConfig>
  image?: ImageConfig
  frame?: FrameConfig
}

export const DEFAULT_CONFIG: Omit<ResolvedQRCodeConfig, 'data'> = {
  size: 200,
  // ISO/IEC 18004's minimum quiet zone (#308), matching the ASCII exporter's
  // own DEFAULT_QUIET_ZONE. Only applies when a config omits margin entirely
  // — an explicit margin (including 0, as every built-in preset sets) is
  // always honoured as-is. This is a default, not an enforced floor: forcing
  // it onto every config regardless of output resolution shrinks module
  // pixel density enough to make small, high-density exports (e.g. a
  // logo'd/stylised 200px preset with long data) fail to scan.
  margin: 4,
  errorCorrectionLevel: 'Q',
  version: 0,
  dots: { shape: 'square', color: '#000000' },
  cornerSquares: { shape: 'square', color: '#000000' },
  cornerDots: { shape: 'square', color: '#000000' },
  background: { color: 'transparent' }
}
