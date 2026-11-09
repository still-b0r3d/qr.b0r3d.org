// The part of pngjs the checks use (it ships no types of its own).
declare module 'pngjs' {
  export class PNG {
    constructor(options?: { width: number; height: number })
    width: number
    height: number
    data: Buffer
    static sync: {
      read(bytes: Buffer): PNG
      write(png: PNG, options?: { deflateLevel?: number }): Buffer
    }
    /** copies a part of one picture into another */
    static bitblt(src: PNG, dst: PNG, srcX: number, srcY: number, width: number, height: number, deltaX: number, deltaY: number): void
  }
}
