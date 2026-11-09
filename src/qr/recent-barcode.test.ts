import { describe, expect, it } from 'vitest'
import { writeBarcode } from '../test/zint'
import { askFor, madeFrom } from './barcode-make'
import { defaultLook, type BarcodeSvg } from './barcode-svg'
import type { BarcodeType } from './barcodes'
import { barcodeSettings, keptBarcode, newRecentBarcode, recentName } from './recent'

// A barcode in Recent codes, as today's site keeps one (seen by running it: an EAN-13 saved as a
// PNG, its record read out of the browser's storage), and its settings taken back.

async function madeAny(type: BarcodeType, text: string): Promise<BarcodeSvg> {
  const look = defaultLook()
  const asked = askFor(type, text, look)
  if ('error' in asked) throw new Error(asked.error)
  const w = await writeBarcode(asked.ask.text, { format: asked.ask.format as never, options: asked.ask.options, scale: 1, addHRT: asked.ask.addHRT, addQuietZones: asked.ask.addQuietZones })
  const m = madeFrom(type, w.error ? null : w.svg, w.error || null, look.barHeight)
  if ('error' in m) throw new Error(m.error)
  return m.barcode
}
const made = (text: string) => madeAny('ean13', text)

describe('a barcode kept in Recent codes', () => {
  it('as today’s site keeps it: its record, picture and size, and what opens it', async () => {
    const kept = newRecentBarcode('ean13', '9506000134352', defaultLook(), await made('9506000134352'), 1794119218306)
    expect({ ...kept.record, thumbnail: undefined }).toEqual({
      v: 1,
      kind: 'barcode',
      key: 'barcode:ean13:9506000134352',
      label: 'EAN-13',
      title: '9506000134352',
      sensitive: false,
      thumbnail: undefined,
      omitted: [],
      savedAt: 1794119218306,
      size: 1698
    })
    // the picture: the barcode as an SVG drawing, one pixel a module, in a data: URL (as long as today's)
    expect(kept.record.thumbnail?.length).toBe(1484)
    expect(kept.record.thumbnail).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww\.w3\.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20113%2059%22%20width%3D%22113%22%20height%3D%2259%22%20shape-rendering%3D%22crispEdges%22%3E%0A%20%3Cg%20id%3D%22barcode%22%20fill%3D%22%23000000%22%3E%0A%20%20%3Crect%20x%3D%220%22%20y%3D%220%22%20width%3D%22113%22%20height%3D%2259%22%20fill%3D%22%23ffffff%22%2F%3E%0A%20%20%3Cpath%20/
    )
    expect(kept.details).toEqual({
      kind: 'barcode',
      type: 'ean13',
      data: '9506000134352',
      settings: { color: '#000000', background: '#ffffff', transparent: false, scale: 4, showText: true, allowRectangular: false, barHeight: 50, quietZones: true }
    })
    expect(keptBarcode(kept.details)).toEqual({ type: 'ean13', text: '9506000134352' })
  })

  it('the text exactly as typed, its line breaks too; no picture when there is none', () => {
    const kept = newRecentBarcode('datamatrix', 'a\r\nb', defaultLook(), null, 5)
    expect([kept.record.key, kept.record.title, kept.record.thumbnail, kept.record.size]).toEqual(['barcode:datamatrix:a\r\nb', 'a b', undefined, JSON.stringify(kept.details).length])
    expect(keptBarcode(kept.details)).toEqual({ type: 'datamatrix', text: 'a\r\nb' })
  })

  it('a Wi-Fi network in a Data Matrix: its name, the padlock and no picture, never its password', async () => {
    const text = 'WIFI:T:WPA;S:home;P:naps-all-day;;'
    const kept = newRecentBarcode('datamatrix', text, defaultLook(), await madeAny('datamatrix', text), 9)
    expect([kept.record.label, kept.record.title, kept.record.sensitive, kept.record.thumbnail]).toEqual(['Data Matrix', 'home', true, undefined])
    // (what opens it again keeps the text, as a QR code's record does, but the list never shows it)
    expect(recentName(kept.record)).toBe('Data Matrix: home')
    // a contact is listed by its name, as a QR code's is
    const card = 'BEGIN:VCARD\nVERSION:3.0\nN:Cat;Rukus;;;\nFN:Rukus Cat\nEND:VCARD'
    expect(newRecentBarcode('pdf417', card, defaultLook(), null, 9).record.title).toBe('Rukus Cat')
  })

  it('a kind this site doesn’t make, or no text, isn’t opened', () => {
    expect(keptBarcode({ kind: 'barcode', type: 'maxicode', data: 'x' })).toBeNull()
    expect(keptBarcode({ kind: 'barcode', type: 'ean13', data: 5 as unknown as string })).toBeNull()
    expect(keptBarcode({ kind: 'qr', config: {} })).toBeNull()
  })

  it('its settings taken back: only known ones of the right kind, sizes kept in range, the rest as they are now', () => {
    const now = { ...defaultLook(), color: '#112233', scale: 7 }
    expect(barcodeSettings(undefined, now)).toEqual(now)
    expect(barcodeSettings({ color: 'not a colour', background: 'rgb(0 0 255)', transparent: 'yes', scale: 99, barHeight: 2.5, showText: false, quietZones: false, allowRectangular: true }, now)).toEqual({
      ...now,
      background: 'rgb(0 0 255)',
      scale: 20,
      barHeight: 20,
      showText: false,
      quietZones: false,
      allowRectangular: true
    })
    expect(barcodeSettings({ scale: 0, barHeight: 77.5 }, now)).toEqual({ ...now, scale: 1, barHeight: 78 })
    expect(barcodeSettings({ scale: Number.NaN, color: '#abcdef' }, now)).toEqual({ ...now, color: '#abcdef' })
  })
})
