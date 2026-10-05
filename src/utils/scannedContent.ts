import { detectDataType } from './dataEncoding'
import { isBareDomain } from './linkChecks'

/**
 * What the Scan page shows for a decoded code: a label, and a link when there
 * is something to open (a web page, an email, a call, a message, a map).
 * Uses the same parser as the Data templates editor, so a code made here is
 * always recognised when it is scanned back.
 */

export type ScannedKind =
  | 'url'
  | 'email'
  | 'tel'
  | 'sms'
  | 'wifi'
  | 'vcard'
  | 'calendar'
  | 'geo'
  | 'epc'
  | 'product'
  | 'text'

export interface ScannedContent {
  kind: ScannedKind
  label: string
  /** A link that acts on the content; only http(s), mailto, tel, sms and geo. */
  href?: string
}

// Barcodes on retail products carry an item number, never a phone number.
const PRODUCT_FORMATS = /^(EAN|UPC|ISBN|DataBar)/i
// "(01)09506000134352(10)ABC": GS1 element strings in human-readable form.
const GS1_ELEMENT_STRING = /^\(\d{2,4}\)\S/
const BARE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
// Only numbers written in international form: "+44 20 7946 0958".
const INTERNATIONAL_PHONE = /^\+[\d\s().-]+$/

const LABELS: Record<ScannedKind, string> = {
  url: 'URL',
  email: 'Email',
  tel: 'Phone Number',
  sms: 'SMS',
  wifi: 'WiFi',
  vcard: 'Contact Card',
  calendar: 'Calendar Event',
  geo: 'Location',
  epc: 'SEPA Payment',
  product: 'Product number',
  text: 'Text'
}

const content = (kind: ScannedKind, href?: string, label = LABELS[kind]): ScannedContent =>
  href ? { kind, label, href } : { kind, label }

/**
 * @param text the decoded text
 * @param format the symbology it came from, as the scanner names it
 *   (e.g. "QRCode", "EAN13"); optional
 */
export function describeScannedContent(text: string, format?: string): ScannedContent {
  const value = text.trim()
  if (format && PRODUCT_FORMATS.test(format)) return content('product')
  if (GS1_ELEMENT_STRING.test(value)) return content('product', undefined, 'GS1 data')

  const { type, parsedData } = detectDataType(text)
  switch (type) {
    case 'url':
      return content('url', text)
    case 'email':
      return content('email', text)
    case 'phone':
      return content('tel', text)
    case 'sms': {
      const phone = String(parsedData.phone ?? '')
      const message = String(parsedData.message ?? '')
      if (!phone) return content('sms')
      return content(
        'sms',
        `sms:${encodeURIComponent(phone).replace(/%2B/g, '+')}` +
          (message ? `?body=${encodeURIComponent(message)}` : '')
      )
    }
    case 'wifi':
      return content('wifi')
    case 'vcard':
      return content('vcard')
    case 'event':
      return content('calendar')
    case 'location':
      return content('geo', parsedData.latitude ? text : undefined)
    case 'epc':
      return content('epc')
  }

  if (isBareDomain(value)) return content('url', `https://${value}`)
  if (BARE_EMAIL.test(value)) return content('email', `mailto:${value}`)
  const digits = value.replace(/\D/g, '')
  if (INTERNATIONAL_PHONE.test(value) && digits.length >= 7 && digits.length <= 15) {
    return content('tel', `tel:+${digits}`)
  }
  return content('text')
}
