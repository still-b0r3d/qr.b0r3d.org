import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import {
  MAX_KEPT_IMAGE_LENGTH,
  describeQrData,
  newRecentBarcode,
  newRecentQrCode,
  qrConfigToKeep,
  readRecentDetails,
  recentCodeKey
} from './recentCodes'
import type { QRCodeConfig } from './useQRCodeStorage'

const LOGO = 'data:image/png;base64,iVBORw0KGgo='

function config(data: string, overrides: Partial<QRCodeConfig['props']> = {}): QRCodeConfig {
  return {
    props: {
      data,
      image: LOGO,
      width: 200,
      height: 200,
      margin: 4,
      dotsOptions: { color: '#000000', type: 'square' },
      imageOptions: { padding: 1, imageSize: 0.4 },
      ...overrides
    },
    style: { borderRadius: '0px', background: '#ffffff' },
    frame: null
  }
}

describe('describeQrData', () => {
  it('labels a web address with the address', () => {
    expect(describeQrData('https://example.com/menu')).toEqual({
      label: 'URL',
      title: 'https://example.com/menu',
      sensitive: false
    })
  })

  it('names a Wi-Fi network but never shows its password', () => {
    const described = describeQrData('WIFI:T:WPA;S:Office;P:hunter2;;')
    expect(described).toEqual({ label: 'WiFi', title: 'Office', sensitive: true })
    expect(JSON.stringify(described)).not.toContain('hunter2')
  })

  it('treats an open Wi-Fi network as nothing secret', () => {
    expect(describeQrData('WIFI:T:nopass;S:Cafe;;').sensitive).toBe(false)
  })

  it('names a contact card by the person', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nN:Doe;Jane;;;\nFN:Jane Doe\nEND:VCARD'
    expect(describeQrData(vcard)).toMatchObject({ label: 'Contact Card', title: 'Jane Doe' })
  })

  it('shortens long text to one line', () => {
    const { title } = describeQrData(`line one\nline two ${'x'.repeat(200)}`)
    expect(title.startsWith('line one line two')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(80)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('newRecentQrCode', () => {
  it('keeps the config with its data, a picture and a key per data', () => {
    const code = newRecentQrCode(config('https://example.com'), 'data:image/png;base64,AA', 5)
    expect(code.summary).toMatchObject({
      v: 1,
      kind: 'qr',
      key: recentCodeKey('qr', 'qr', 'https://example.com'),
      label: 'URL',
      title: 'https://example.com',
      sensitive: false,
      thumbnail: 'data:image/png;base64,AA',
      omitted: [],
      savedAt: 5
    })
    expect(code.details).toEqual({ kind: 'qr', config: config('https://example.com') })
    expect(code.summary.size).toBeGreaterThan(JSON.stringify(code.details).length)
  })

  it('keeps no picture of a code with a Wi-Fi password', () => {
    const code = newRecentQrCode(
      config('WIFI:T:WPA;S:Office;P:hunter2;;'),
      'data:image/png;base64,AA',
      5
    )
    expect(code.summary.sensitive).toBe(true)
    expect(code.summary).not.toHaveProperty('thumbnail')
    expect(JSON.stringify(code.summary)).not.toContain('data:image/png;base64,AA')
  })

  it('stores plain objects, so Vue state can go straight into IndexedDB', () => {
    const live = reactive(config('https://example.com'))
    const code = newRecentQrCode(live as QRCodeConfig, undefined, 1)
    expect(() => structuredClone(code)).not.toThrow()
  })
})

describe('qrConfigToKeep', () => {
  it('leaves out images too large to keep and says which', () => {
    const huge = `data:image/svg+xml;base64,${'A'.repeat(MAX_KEPT_IMAGE_LENGTH)}`
    const original: QRCodeConfig = {
      ...config('x', { image: huge }),
      frame: {
        text: 'Scan me',
        position: 'bottom',
        style: {
          textColor: '#000000',
          backgroundColor: '#ffffff',
          borderColor: '#000000',
          borderWidth: '1px',
          borderRadius: '8px',
          padding: '16px',
          backgroundImage: huge
        }
      }
    }
    const kept = qrConfigToKeep(original)
    expect(kept.omitted).toEqual(['logo', 'background'])
    expect(kept.config.props.image).toBe('')
    expect(kept.config.frame?.style).not.toHaveProperty('backgroundImage')
    // The editor's own config is untouched.
    expect(original.props.image).toBe(huge)
    expect(original.frame?.style.backgroundImage).toBe(huge)
  })

  it('keeps images under the limit and web addresses as they are', () => {
    expect(qrConfigToKeep(config('x')).omitted).toEqual([])
    const remote = qrConfigToKeep(config('x', { image: 'https://example.com/logo.png' }))
    expect(remote.config.props.image).toBe('https://example.com/logo.png')
  })
})

describe('newRecentBarcode', () => {
  it('labels it with the format and keys it by type and data', () => {
    const code = newRecentBarcode('ean13', '950600013435', { color: '#ff0000' }, undefined, 2)
    expect(code.summary).toMatchObject({
      kind: 'barcode',
      key: recentCodeKey('barcode', 'ean13', '950600013435'),
      label: 'EAN-13',
      title: '950600013435'
    })
    expect(code.details).toEqual({
      kind: 'barcode',
      type: 'ean13',
      data: '950600013435',
      settings: { color: '#ff0000' }
    })
  })

  it('gives the same data in two barcode types two entries', () => {
    expect(recentCodeKey('barcode', 'code128', '123')).not.toBe(
      recentCodeKey('barcode', 'datamatrix', '123')
    )
    expect(recentCodeKey('qr', 'qr', '123')).not.toBe(recentCodeKey('barcode', 'code128', '123'))
  })
})

describe('readRecentDetails', () => {
  it('accepts a stored QR code and barcode', () => {
    expect(readRecentDetails({ kind: 'qr', config: config('x') })).toEqual({
      kind: 'qr',
      config: config('x')
    })
    expect(
      readRecentDetails({ kind: 'barcode', type: 'code128', data: 'A1', settings: {} })
    ).toEqual({ kind: 'barcode', type: 'code128', data: 'A1', settings: {} })
  })

  it('refuses what a loaded config file would refuse', () => {
    expect(
      readRecentDetails({ kind: 'qr', config: config('x', { image: 'javascript:alert(1)' }) })
    ).toBeNull()
    expect(readRecentDetails({ kind: 'qr', config: { props: {} } })).toBeNull()
  })

  it('refuses unknown kinds and barcode types', () => {
    expect(readRecentDetails(undefined)).toBeNull()
    expect(readRecentDetails({ kind: 'pdf' })).toBeNull()
    expect(readRecentDetails({ kind: 'barcode', type: 'nope', data: '1' })).toBeNull()
    expect(readRecentDetails({ kind: 'barcode', type: 'code128', data: 5 })).toBeNull()
  })
})
