// The part of pngjs the checks use (it ships no types of its own).
declare module 'pngjs' {
  export class PNG {
    constructor(options?: { width: number; height: number })
    width: number
    height: number
    data: Buffer
    static sync: {
      read(bytes: Buffer): PNG
      write(png: PNG): Buffer
    }
  }
}
