// What a scanned code is, worded for people, as b0r3d QR for PC says it: "Link" to b0r3d.org, a
// "Wi-Fi network" called home... The detail line never shows a password or a sign-in secret, and
// product numbers are never taken for phone numbers. Formats go by zxing-wasm's names.

import { trimmedText, unescapeData } from './checks'

const PRODUCTS = new Set(['EAN13', 'ISBN', 'EAN8', 'UPCA', 'UPCE', 'DataBar', 'DataBarOmni', 'DataBarStk', 'DataBarStkOmni', 'EAN2', 'EAN5', 'EANUPC'])

export function describeCode(text: string, format: string): { kind: string; detail: string } {
  const t = trimmedText(text ?? '')
  if (PRODUCTS.has(format)) {
    const isbn = (format === 'EAN13' || format === 'ISBN') && (t.startsWith('978') || t.startsWith('979'))
    return { kind: isbn ? 'Book number (ISBN)' : 'Product number', detail: '' }
  }
  const link = webLink(t)
  if (link) {
    // the site, and its real name when it's written in other alphabets ("аpple.com" is
    // xn--pple-43d.com, not apple.com)
    const host = withoutWww(link.host)
    const real = withoutWww(link.url.hostname)
    return { kind: 'Link', detail: !link.named || real === host ? host : `${host} (${real})` }
  }
  const upper = t.toUpperCase()
  if (upper.startsWith('WIFI:')) {
    const f = fields(t.slice(5))
    const network = f.get('S')
    const security = f.get('T') ?? ''
    const how = { '': 'no password', NOPASS: 'no password', WPA: 'WPA', SAE: 'WPA3', WEP: 'WEP' }[security.toUpperCase()] ?? security
    let detail = (network ? `network ${network}` : 'a network') + ', ' + how
    if ((f.get('H') ?? '').toLowerCase() === 'true') detail += ', hidden'
    return { kind: 'Wi-Fi network', detail }
  }
  if (upper.startsWith('BEGIN:VCARD')) return { kind: 'Contact', detail: line(t, 'FN') ?? trimmedText((line(t, 'N') ?? '').replace(/;/g, ' ')) }
  if (upper.startsWith('MECARD:')) return { kind: 'Contact', detail: trimmedText((fields(t.slice(7)).get('N') ?? '').replace(/,/g, ' ')) }
  if (upper.startsWith('BEGIN:VCALENDAR') || upper.startsWith('BEGIN:VEVENT')) return { kind: 'Calendar event', detail: line(t, 'SUMMARY') ?? '' }
  if (upper.startsWith('MAILTO:')) return { kind: 'Email', detail: unescapeData(t.slice(7).split('?')[0]) }
  if (upper.startsWith('MATMSG:')) return { kind: 'Email', detail: fields(t.slice(7)).get('TO') ?? '' }
  if (upper.startsWith('TEL:')) return { kind: 'Phone number', detail: t.slice(4) }
  if (upper.startsWith('SMSTO:') || upper.startsWith('SMS:')) return { kind: 'Text message', detail: t.slice(t.indexOf(':') + 1).split(/[:?]/)[0] }
  if (upper.startsWith('GEO:')) return { kind: 'Location', detail: t.slice(4).split(/[?;]/)[0] }
  if (/^BCD\r?\n/.test(t)) {
    const lines = t.replace(/\r\n/g, '\n').split('\n')
    const name = lines.length > 5 ? trimmedText(lines[5]) : ''
    const amount = lines.length > 7 ? trimmedText(lines[7]) : ''
    return { kind: 'Payment (EPC)', detail: (name.length > 0 ? 'to ' + name : '') + (amount.length > 3 ? (name.length > 0 ? ', ' : '') + amount.slice(0, 3) + ' ' + amount.slice(3) : '') }
  }
  // every account's secret at once: nothing of it is shown
  if (upper.startsWith('OTPAUTH-MIGRATION:')) return { kind: 'Sign-in codes (two-factor export)', detail: '' }
  if (upper.startsWith('OTPAUTH:')) {
    // (with no label, "totp?issuer=A/B&secret=..." must not pass for one)
    const label = /^otpauth:\/{2}[^/?]+\/([^?]*)/i.exec(t)
    return { kind: 'Sign-in code (two-factor)', detail: label ? unescapeData(label[1]) : '' }
  }
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]{1,30}):/.exec(t)
  if (scheme && t.length > scheme[0].length + 1 && t.slice(scheme[0].length, scheme[0].length + 2) === '//') return { kind: `Address (${scheme[1].toLowerCase()})`, detail: '' }
  return { kind: 'Text', detail: '' }
}

/** The code's type as people call it; the symbology identifier tells GS1 codes and QR codes with an ECI marker apart. */
export function formatName(format: string, text: string | null, symbology: string | null): string {
  const isbn = text !== null && (text.startsWith('978') || text.startsWith('979'))
  switch (format) {
    case 'QRCode':
      return symbology === ']Q3' || symbology === ']Q4' ? 'GS1 QR code' : symbology === ']Q2' ? 'QR code with an ECI marker' : 'QR code'
    case 'DataMatrix':
      return symbology === ']d2' ? 'GS1 DataMatrix' : 'Data Matrix'
    case 'Aztec':
    case 'AztecCode':
      return 'Aztec'
    case 'PDF417':
      return 'PDF417'
    case 'MaxiCode':
      return 'MaxiCode'
    case 'EAN13':
    case 'ISBN':
      return isbn ? 'EAN-13 (ISBN)' : 'EAN-13'
    case 'EAN8':
      return 'EAN-8'
    case 'UPCA':
      return 'UPC-A'
    case 'UPCE':
      return 'UPC-E'
    case 'Code128':
      return symbology === ']C1' ? 'GS1-128' : 'Code 128'
    case 'Code39':
      return 'Code 39'
    case 'Code93':
      return 'Code 93'
    case 'ITF':
    case 'ITF14':
      return text !== null && text.length === 14 ? 'ITF-14' : 'ITF'
    case 'Codabar':
      return 'Codabar'
    case 'DataBar':
    case 'DataBarOmni':
    case 'DataBarStk':
    case 'DataBarStkOmni':
      return 'GS1 DataBar'
    case 'DataBarExp':
    case 'DataBarExpStk':
      return 'GS1 DataBar Expanded'
    case 'EAN2':
    case 'EAN5':
      return 'EAN add-on'
    default:
      return format
  }
}

/** An http or https link with a site, read as browsers read it, and its site as it's written. */
export interface WebLink {
  readonly url: URL
  /** the site's name as written (in its own letters, small ones), or its address */
  readonly host: string
  /** a named site, not a numbered address */
  readonly named: boolean
}

export function webLink(text: string): WebLink | null {
  const t = trimmedText(text ?? '')
  // (a link says // after its scheme, as the PC app's reading of links has it)
  if (!/^https?:\/\//i.test(t)) return null
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return null
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname.length === 0) return null
  const named = !(url.hostname.startsWith('[') || /^[0-9]+(\.[0-9]+){3}$/.test(url.hostname))
  // the site as written: its own letters, when it has any that aren't ASCII
  const written = /^https?:\/\/(?:[^/?#@]*@)?(\[[^\]]*\]|[^/?#:]*)/i.exec(t)?.[1] ?? url.hostname
  const host = named && [...written].some((c) => c.charCodeAt(0) > 127) ? written.toLowerCase() : url.hostname
  return { url, host, named }
}

/** The things worth knowing before opening a link: none for an ordinary https link. */
export function linkWarnings(link: WebLink): string[] {
  const warnings: string[] = []
  const { url } = link
  if (url.protocol === 'http:') warnings.push("It isn't encrypted (http, not https).")
  if (!link.named) warnings.push('It goes to a numbered address, not a named site.')
  if (link.named && url.hostname.split('.').some((part) => part.toLowerCase().startsWith('xn--')))
    warnings.push(`Its address uses letters from other alphabets, which can look like another site's (${url.hostname}).`)
  if (url.username.length > 0 || url.password.length > 0) warnings.push(`The part before the @ is a user name, not the site: it goes to ${link.host}.`)
  if (url.port.length > 0) warnings.push(`It uses an unusual port (${url.port}).`)
  return warnings
}

const withoutWww = (host: string): string => (host.toLowerCase().startsWith('www.') ? host.slice(4) : host)

/** "S:home;T:WPA;P:pass" (with \; \: \\ escapes) into fields by name (any case), the first of each. */
function fields(text: string): Map<string, string> {
  const found = new Map<string, string>()
  let i = 0
  while (i < text.length) {
    let f = ''
    for (; i < text.length && text[i] !== ';'; i++) {
      if (text[i] === '\\' && i + 1 < text.length) i++
      f += text[i]
    }
    i++
    const at = f.indexOf(':')
    if (at > 0 && !found.has(f.slice(0, at).toUpperCase())) found.set(f.slice(0, at).toUpperCase(), f.slice(at + 1))
  }
  return found
}

/** the value of a vCard or iCalendar line ("FN:Rukus", "SUMMARY;LANGUAGE=en:Party") */
function line(text: string, name: string): string | null {
  const m = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'im').exec(text)
  return m ? trimmedText(m[1]) : null
}
