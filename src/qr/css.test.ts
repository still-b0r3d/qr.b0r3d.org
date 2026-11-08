import { describe, expect, it } from 'vitest'
import pcApp from '../test/pc-app-colours.json'
import { isLength, lengthPixels, readColour } from './css'

// How the PC app (b0r3d QR 0.8, its code loaded by reflection, no window) reads these colours and
// lengths: the website must read them the same, so both warn about the same designs.
describe('colours and lengths, read as the PC app reads them', () => {
  it.each(pcApp.colours.map((c) => [JSON.stringify(c.value), c] as const))('colour %s', (_, c) => {
    const read = readColour(c.value)
    expect(read ? [read.r, read.g, read.b, read.a] : null).toEqual(c.rgba)
  })

  it.each(pcApp.lengths.map((l) => [JSON.stringify(l.value), l] as const))('length %s', (_, l) => {
    expect(isLength(l.value)).toBe(l.isLength)
    expect(lengthPixels(l.value, 12)).toBe(l.pixels)
  })
})
