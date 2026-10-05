import { describe, expect, it } from 'vitest'
import { describeScannedContent } from './scannedContent'
import {
  generateEventData,
  generateSmsData,
  generateVCardData,
  generateWifiData
} from './dataEncoding'

describe('describeScannedContent', () => {
  it("recognises the app's own SMS, event, Wi-Fi and vCard codes", () => {
    expect(
      describeScannedContent(generateSmsData({ phone: '+15550100', message: 'Hi: 5pm' }))
    ).toEqual({ kind: 'sms', label: 'SMS', href: 'sms:+15550100?body=Hi%3A%205pm' })
    expect(
      describeScannedContent(generateEventData({ title: 'Party', startTime: '2026-10-31T19:00' }))
        .kind
    ).toBe('calendar')
    expect(
      describeScannedContent(generateWifiData({ ssid: 'Net', encryption: 'WPA', password: 'x' }))
        .kind
    ).toBe('wifi')
    expect(describeScannedContent(generateVCardData({ firstName: 'Ann' }) + '\r\n').kind).toBe(
      'vcard'
    )
  })

  it('links web addresses, with or without https://', () => {
    expect(describeScannedContent('https://b0r3d.org/a?b=1')).toMatchObject({
      kind: 'url',
      href: 'https://b0r3d.org/a?b=1'
    })
    expect(describeScannedContent('b0r3d.org')).toMatchObject({
      kind: 'url',
      href: 'https://b0r3d.org'
    })
  })

  it('links emails, calls and places', () => {
    expect(describeScannedContent('mailto:a@example.com').href).toBe('mailto:a@example.com')
    expect(describeScannedContent('a@example.com').href).toBe('mailto:a@example.com')
    expect(describeScannedContent('tel:+15550100').href).toBe('tel:+15550100')
    expect(describeScannedContent('+44 20 7946 0958').href).toBe('tel:+442079460958')
    expect(describeScannedContent('geo:48.2,16.37').href).toBe('geo:48.2,16.37')
  })

  it('never calls a product number a phone number', () => {
    expect(describeScannedContent('4006381333931', 'EAN13')).toEqual({
      kind: 'product',
      label: 'Product number'
    })
    expect(describeScannedContent('4006381333931').kind).toBe('text')
    expect(describeScannedContent('12345').kind).toBe('text')
    expect(describeScannedContent('(01)09506000134352(10)A1', 'DataMatrix')).toEqual({
      kind: 'product',
      label: 'GS1 data'
    })
  })

  it('never links anything else', () => {
    expect(describeScannedContent('javascript:alert(1)')).toEqual({ kind: 'text', label: 'Text' })
    expect(
      describeScannedContent('BCD\n002\n1\nSCT\n\nJane\nDE89370400440532013000').href
    ).toBeUndefined()
  })
})
