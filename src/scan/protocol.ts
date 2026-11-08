// Messages between the page and the scan worker.

/**
 * What to read in a picture: "check", the one code the scan check looks for (QR codes, or the
 * formats given); "all", every code in it (a picture on the Scan tab); "frame", the first code in
 * one of the camera's pictures.
 */
export interface ReadRequest {
  readonly id: number
  readonly image: ImageData
  readonly kind: 'check' | 'all' | 'frame'
  /** for "check": the reader's names for what to look for (QR codes when none are given) */
  readonly formats?: readonly string[]
  /** for "check": GS1 data written in round brackets, as it's typed */
  readonly gs1?: boolean
  /** for "frame": light codes on dark too (every other picture) */
  readonly invert?: boolean
}

/** A code found, as the reader (zxing-wasm) says it. */
export interface FoundRead {
  /** the reader's name for it: "QRCode", "EAN13", "DataBarExp"... */
  readonly format: string
  /** "]Q1", "]C1"... ("" when there's none) */
  readonly identifier: string
  /** "Text", "GS1", "Binary"... */
  readonly contentType: string
  readonly text: string
  /** marked as text in another encoding (a QR code's ECI) */
  readonly eci: boolean
  /** a QR code's error correction ("L", "M", "Q", "H"), else "" */
  readonly level: string
  /** its corners in the picture */
  readonly corners: readonly (readonly [number, number])[]
}

export type ReadReply =
  | { readonly id: number; readonly ok: true; readonly codes: readonly FoundRead[] }
  /** `unloaded`: the reader itself didn't load (it's tried again next time); otherwise it slipped on this picture */
  | { readonly id: number; readonly ok: false; readonly error: string; readonly unloaded?: boolean }
