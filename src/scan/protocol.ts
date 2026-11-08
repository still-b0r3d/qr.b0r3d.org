// Messages between the page and the scan worker.

export interface ReadRequest {
  readonly id: number
  readonly image: ImageData
}

export type ReadReply =
  | { readonly id: number; readonly ok: true; readonly text: string | null; readonly eci: boolean }
  | { readonly id: number; readonly ok: false; readonly error: string }
