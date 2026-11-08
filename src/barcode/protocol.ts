// Messages between the page and the barcode worker.

import type { WriteAsk } from '../qr/barcode-make'

export interface WriteRequest {
  readonly id: number
  readonly ask: WriteAsk
}

export type WriteReply =
  | { readonly id: number; readonly ok: true; readonly svg: string | null; readonly error: string | null }
  | { readonly id: number; readonly ok: false; readonly error: string }
