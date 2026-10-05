import { describe, expect, it } from 'vitest'
import en from '../../../locales/en.json'
import { BARCODE_FORMATS, BARCODE_GROUPS } from './formats'

// The app shows these through t(); a missing entry shows the raw key and
// skips {placeholder} filling, so every one needs an English message.
describe('barcode strings', () => {
  it('has an English message for every type name, hint and group', () => {
    const strings = [...BARCODE_GROUPS, ...BARCODE_FORMATS.flatMap((f) => [f.label, f.hint])]
    expect(strings.filter((s) => !(s in en))).toEqual([])
  })
})
