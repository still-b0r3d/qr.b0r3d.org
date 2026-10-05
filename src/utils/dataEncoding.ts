import { gs1CheckDigit } from '../lib/barcode/formats'

/** Generic function to escape special characters in a string */
const escapeSpecialChars = (val: string, charsToEscape: string): string => {
  if (!val) return ''
  const regex = new RegExp(`([${charsToEscape.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}])`, 'g')
  return val.replace(regex, '\\$1')
}

/**
 * Escapes special characters for vCard format: \ , ;
 * Based on RFC 6350 (vCard 4.0) and RFC 2426 (vCard 3.0)
 * @see https://datatracker.ietf.org/doc/html/rfc6350
 * @see https://datatracker.ietf.org/doc/html/rfc2426
 */
export const escapeVCard = (val: string): string => escapeSpecialChars(val, '\\,;')

/**
 * Escapes special characters for WiFi format: \ ; , : " '
 * Based on WPA/WPA2 Enterprise Configuration Specification
 * @see https://github.com/zxing/zxing/wiki/Barcode-Contents#wi-fi-network-config-android-ios-11
 */
export const escapeWiFi = (val: string): string => escapeSpecialChars(val, '\\;,:"\'')

/**
 * Escapes special characters for iCalendar format: \ , ; and line breaks
 * Based on RFC 5545 (iCalendar)
 * @see https://datatracker.ietf.org/doc/html/rfc5545
 */
export const escapeICal = (val: string): string =>
  escapeSpecialChars(val, '\\,;').replace(/\r\n|\r|\n/g, '\\n')

/**
 * Undoes escapeVCard / escapeICal: `\,` `\;` `\:` `\\` become the character
 * itself and `\n` (or `\N`) a line break.
 */
export const unescapeText = (val: string): string =>
  val.replace(/\\([\\,;:nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch))

/** Undoes escapeWiFi: a backslash makes the next character literal. */
export const unescapeWiFi = (val: string): string => val.replace(/\\([\s\S])/g, '$1')

/**
 * Splits `text` at every `separator` that isn't escaped with a backslash.
 * Escapes are kept in the parts, so each part can be unescaped on its own.
 */
export const splitUnescaped = (text: string, separator: string): string[] => {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length) {
      current += ch + text[i + 1]
      i++
    } else if (ch === separator) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/**
 * Normalizes a string to a single line for use in a line-delimited format
 * (e.g. EPC QR). Any run of CRLF/CR/LF is collapsed to a single space so
 * words don't get glued together, and the result is trimmed.
 */
export const sanitizeEpcLine = (val: string): string => {
  if (!val) return ''
  return val.replace(/\r\n|\r|\n/g, ' ').trim()
}

/** Formats a Date object or date string into YYYYMMDDTHHMMSSZ format for iCalendar */
const formatICalDateTime = (dateTime: string | Date): string => {
  try {
    const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime
    if (isNaN(date.getTime())) return '' // Invalid date
    return (
      date.getUTCFullYear() +
      ('0' + (date.getUTCMonth() + 1)).slice(-2) +
      ('0' + date.getUTCDate()).slice(-2) +
      'T' +
      ('0' + date.getUTCHours()).slice(-2) +
      ('0' + date.getUTCMinutes()).slice(-2) +
      ('0' + date.getUTCSeconds()).slice(-2) +
      'Z'
    )
  } catch (e) {
    console.error('Error formatting iCal date:', e)
    return ''
  }
}

/** A short random id for an event's UID, so calendars can tell events apart. */
const randomId = (): string => {
  const bytes = new Uint8Array(9)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')
}

// --- Data Type Generators ---

/**
 * Generates plain text data for QR code
 * @param {object} data - Text data to encode
 * @param {string} data.text - The text content to encode
 * @returns {string} - Formatted text string
 */
export const generateTextData = (data: { text: string }): string => {
  return data.text || ''
}

/**
 * Generates a URL string for QR code, ensuring proper http/https prefix
 * @param {object} data - URL data to encode
 * @param {string} data.url - The URL to encode, with or without protocol
 * @returns {string} - Formatted URL string with protocol
 */
export const generateUrlData = (data: { url: string }): string => {
  if (!data.url) return ''
  return data.url.startsWith('http://') || data.url.startsWith('https://')
    ? data.url
    : `https://${data.url}`
}

/**
 * Generates a mailto URI string for email QR codes
 * @param {object} data - Email data to encode
 * @param {string} data.address - Email address of the recipient
 * @param {string} [data.subject] - Optional email subject
 * @param {string} [data.body] - Optional email body text
 * @param {string} [data.cc] - Optional CC recipients
 * @param {string} [data.bcc] - Optional BCC recipients
 * @returns {string} - Formatted mailto URI string
 */
export const generateEmailData = (data: {
  address: string
  subject?: string
  body?: string
  cc?: string
  bcc?: string
}): string => {
  if (!data.address) return ''
  const parts: string[] = []
  if (data.subject) parts.push(`subject=${encodeURIComponent(data.subject)}`)
  if (data.body) parts.push(`body=${encodeURIComponent(data.body)}`)
  if (data.cc) parts.push(`cc=${encodeURIComponent(data.cc)}`)
  if (data.bcc) parts.push(`bcc=${encodeURIComponent(data.bcc)}`)
  return `mailto:${data.address}${parts.length > 0 ? '?' + parts.join('&') : ''}`
}

/**
 * Generates a tel URI string for phone number QR codes
 * @param {object} data - Phone data to encode
 * @param {string} data.phone - Phone number to call
 * @returns {string} - Formatted tel URI string
 */
export const generatePhoneData = (data: { phone: string }): string => {
  return data.phone ? `tel:${data.phone}` : ''
}

/**
 * Generates an SMS string for SMS QR codes
 * @param {object} data - SMS data to encode
 * @param {string} data.phone - Phone number to text
 * @param {string} [data.message] - Optional message content
 * @returns {string} - Formatted SMS URI string
 */
export const generateSmsData = (data: { phone: string; message?: string }): string => {
  return data.phone ? `SMSTO:${data.phone}:${data.message || ''}` : ''
}

/**
 * Wi-Fi security types. 'WPA' covers WPA, WPA2 and WPA2/WPA3 mixed networks
 * and is what nearly every network needs; 'SAE' is for WPA3-only networks.
 */
export type WifiEncryption = 'nopass' | 'WEP' | 'WPA' | 'SAE'

/**
 * Generates a WiFi network string for WiFi QR codes
 * @param {object} data - WiFi data to encode
 * @param {string} data.ssid - Network name (SSID)
 * @param {string} [data.password] - Network password
 * @param {WifiEncryption} data.encryption - Security type (nopass, WEP, WPA/WPA2 or SAE for WPA3 only)
 * @param {boolean} [data.hidden] - Whether the network is hidden (not broadcasting SSID)
 * @returns {string} - Formatted WiFi string
 */
export const generateWifiData = (data: {
  ssid: string
  encryption: WifiEncryption
  password?: string
  hidden?: boolean
}): string => {
  if (!data.ssid) return ''
  const ssid = escapeWiFi(data.ssid)
  const encryption = data.encryption
  const hidden = data.hidden ? 'H:true;' : ''

  if (encryption === 'nopass') {
    return `WIFI:T:nopass;S:${ssid};${hidden};`
  } else {
    const password = escapeWiFi(data.password || '')
    return `WIFI:T:${encryption};S:${ssid};P:${password};${hidden};`
  }
}

/** Maps a vCard version as written anywhere ('2.1', '4.0', '3', …) to '2', '3' or '4'. */
export const normalizeVCardVersion = (version?: string): '2' | '3' | '4' => {
  const v = (version ?? '').trim()
  if (v === '2' || v === '2.1') return '2'
  if (v === '4' || v === '4.0') return '4'
  return '3'
}

/**
 * Generates a vCard format string from contact information
 * @param {object} data - Contact information to encode in vCard format
 * @param {string} [data.firstName] - First name of the contact
 * @param {string} [data.lastName] - Last name of the contact
 * @param {string} [data.org] - Organization name
 * @param {string} [data.position] - Job title or position
 * @param {string} [data.phoneWork] - Work phone number
 * @param {string} [data.phonePrivate] - Home/private phone number
 * @param {string} [data.phoneMobile] - Mobile phone number
 * @param {string} [data.email] - Email address
 * @param {string} [data.website] - Website URL
 * @param {string} [data.street] - Street address
 * @param {string} [data.zipcode] - Postal/ZIP code
 * @param {string} [data.city] - City
 * @param {string} [data.state] - State/province
 * @param {string} [data.country] - Country
 * @param {string} [data.version] - vCard version to generate ('2' or '2.1', '3' or '3.0',
 *   '4' or '4.0'). 3.0 is the default and the most widely understood.
 * @returns {string} - Formatted vCard string
 */
export const generateVCardData = (data: {
  firstName?: string
  lastName?: string
  org?: string
  position?: string
  phoneWork?: string
  phonePrivate?: string
  phoneMobile?: string
  email?: string
  website?: string
  street?: string
  zipcode?: string
  city?: string
  state?: string
  country?: string
  version?: string
}): string => {
  const lines: string[] = []
  lines.push('BEGIN:VCARD')

  const version = normalizeVCardVersion(data.version)
  lines.push(`VERSION:${version === '2' ? '2.1' : version === '4' ? '4.0' : '3.0'}`)

  // vCard 2.1 assumes ASCII unless a property says otherwise, so readers
  // that follow it garble accented and non-Latin names without this.
  const push = (property: string, value: string) => {
    const charset = version === '2' && /[^\x20-\x7e]/.test(value) ? ';CHARSET=UTF-8' : ''
    lines.push(`${property}${charset}:${value}`)
  }

  const firstName = escapeVCard(data.firstName || '')
  const lastName = escapeVCard(data.lastName || '')
  if (firstName || lastName) {
    push('N', `${lastName};${firstName};;;`)
    push('FN', `${firstName} ${lastName}`.trim())
  } else if (data.org) {
    // FN is required from vCard 3.0 on; a company card is named after the company.
    push('FN', escapeVCard(data.org))
  }

  if (data.org) push('ORG', escapeVCard(data.org))
  if (data.position) push('TITLE', escapeVCard(data.position))

  // Format telephone entries based on vCard version
  if (data.phoneWork) {
    if (version === '2') {
      push('TEL;WORK;VOICE', escapeVCard(data.phoneWork))
    } else if (version === '4') {
      lines.push(`TEL;TYPE=work,voice;VALUE=uri:tel:${escapeVCard(data.phoneWork)}`)
    } else {
      lines.push(`TEL;TYPE=WORK,VOICE:${escapeVCard(data.phoneWork)}`)
    }
  }

  if (data.phonePrivate) {
    if (version === '2') {
      push('TEL;HOME;VOICE', escapeVCard(data.phonePrivate))
    } else if (version === '4') {
      lines.push(`TEL;TYPE=home,voice;VALUE=uri:tel:${escapeVCard(data.phonePrivate)}`)
    } else {
      lines.push(`TEL;TYPE=HOME,VOICE:${escapeVCard(data.phonePrivate)}`)
    }
  }

  if (data.phoneMobile) {
    if (version === '2') {
      push('TEL;CELL;VOICE', escapeVCard(data.phoneMobile))
    } else if (version === '4') {
      lines.push(`TEL;TYPE=cell,voice;VALUE=uri:tel:${escapeVCard(data.phoneMobile)}`)
    } else {
      lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCard(data.phoneMobile)}`)
    }
  }

  // Email format differs by version
  if (data.email) {
    if (version === '2') {
      push('EMAIL;INTERNET', escapeVCard(data.email))
    } else if (version === '4') {
      lines.push(`EMAIL;TYPE=work:${escapeVCard(data.email)}`)
    } else {
      lines.push(`EMAIL:${escapeVCard(data.email)}`)
    }
  }

  // URL format
  if (data.website) {
    if (version === '4') {
      lines.push(`URL;TYPE=work:${escapeVCard(data.website)}`)
    } else {
      push('URL', escapeVCard(data.website))
    }
  }

  const street = escapeVCard(data.street || '')
  const city = escapeVCard(data.city || '')
  const state = escapeVCard(data.state || '')
  const zipcode = escapeVCard(data.zipcode || '')
  const country = escapeVCard(data.country || '')
  const addressComponents = [street, city, state, zipcode, country]

  // Only add ADR if at least one address component is present
  if (addressComponents.some((part) => part !== '')) {
    const adrString = `${street};${city};${state};${zipcode};${country}` // Construct the address parts string
    if (version === '2') {
      push('ADR;WORK', `;;${adrString}`)
    } else if (version === '4') {
      lines.push(`ADR;TYPE=work:;;${adrString}`)
    } else {
      lines.push(`ADR;TYPE=WORK:;;${adrString}`)
    }
  }

  lines.push('END:VCARD')
  return lines.join('\n')
}

/**
 * Generates a geographic location URI string for location QR codes
 * @param {object} data - Location data to encode
 * @param {number|string} data.latitude - Latitude coordinate
 * @param {number|string} data.longitude - Longitude coordinate
 * @returns {string} - Formatted geo URI string
 */
export const generateLocationData = (data: {
  latitude: number | string
  longitude: number | string
}): string => {
  // Convert to string to preserve formatting, then validate if needed
  const latStr = String(data.latitude)
  const lonStr = String(data.longitude)

  // Basic validation (optional, could be more robust)
  if (isNaN(parseFloat(latStr)) || isNaN(parseFloat(lonStr))) {
    return ''
  }
  return `geo:${latStr},${lonStr}`
}

/**
 * Generates a calendar event string in iCalendar format for event QR codes
 * @param {object} data - Calendar event data to encode
 * @param {string} [data.title] - Event title/summary
 * @param {string} [data.location] - Event location
 * @param {string|Date} [data.startTime] - Event start time
 * @param {string|Date} [data.endTime] - Event end time
 * @returns {string} - Formatted iCalendar string
 */
export const generateEventData = (data: {
  title?: string
  location?: string
  startTime?: string | Date
  endTime?: string | Date
}): string => {
  const lines: string[] = []
  lines.push('BEGIN:VEVENT')

  if (data.title) lines.push(`SUMMARY:${escapeICal(data.title)}`)
  if (data.location) lines.push(`LOCATION:${escapeICal(data.location)}`)

  const dtStart = data.startTime ? formatICalDateTime(data.startTime) : ''
  const dtEnd = data.endTime ? formatICalDateTime(data.endTime) : ''

  if (dtStart) lines.push(`DTSTART:${dtStart}`)
  if (dtEnd) lines.push(`DTEND:${dtEnd}`)
  // RFC 5545 requires both of these in every event.
  lines.push(`DTSTAMP:${formatICalDateTime(new Date())}`)
  lines.push(`UID:${randomId()}@qr.b0r3d.org`)

  lines.push('END:VEVENT')

  // Wrap in VCALENDAR
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${lines.join('\n')}\nEND:VCALENDAR`
}

/**
 * Generates an EPC QR Code (EPC069-12) payload, used for SEPA Credit Transfers
 * and commonly known as "GiroCode" in electronic banking apps.
 * @param {object} data - SEPA credit transfer data to encode
 * @param {string} data.name - Beneficiary name (max 70 chars)
 * @param {string} data.iban - Beneficiary IBAN (max 34 chars, spaces are stripped)
 * @param {string} [data.bic] - Beneficiary BIC (required for version '001', optional for '002' within the EEA)
 * @param {string|number} [data.amount] - Amount in EUR, e.g. 12.30 (optional)
 * @param {string} [data.purpose] - Purpose code, max 4 chars (optional)
 * @param {string} [data.remittanceReference] - Structured remittance reference, e.g. a creditor reference (optional)
 * @param {string} [data.remittanceText] - Unstructured remittance text (optional, ignored if remittanceReference is set)
 * @param {string} [data.originatorInfo] - Beneficiary to originator information, max 70 chars (optional)
 * @param {'001' | '002'} [data.version] - EPC QR version, defaults to '002'
 * @returns {string} - Formatted EPC QR payload string, or empty string if required fields are missing
 * @see https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
 */
export const generateEpcData = (data: {
  name: string
  iban: string
  bic?: string
  amount?: string | number
  purpose?: string
  remittanceReference?: string
  remittanceText?: string
  originatorInfo?: string
  version?: '001' | '002'
}): string => {
  if (!data.name || !data.iban) return ''

  const version = data.version === '001' ? '001' : '002'
  const bic = (data.bic || '').replace(/\s+/g, '').toUpperCase()

  // BIC is mandatory for version '001'; only optional for '002' (SEPA/EEA-only transfers).
  if (version === '001' && !bic) return ''

  const name = sanitizeEpcLine(data.name).slice(0, 70)
  const iban = data.iban.replace(/\s+/g, '').toUpperCase()

  let amount = ''
  if (data.amount !== undefined && data.amount !== '') {
    const numericAmount =
      typeof data.amount === 'number' ? data.amount : parseFloat(data.amount.replace(',', '.'))
    if (!isNaN(numericAmount) && numericAmount > 0) {
      amount = `EUR${numericAmount.toFixed(2)}`
    }
  }

  const purpose = sanitizeEpcLine(data.purpose || '')
    .slice(0, 4)
    .toUpperCase()
  const remittanceReference = sanitizeEpcLine(data.remittanceReference || '').slice(0, 35)
  // Structured and unstructured remittance information are mutually exclusive.
  const remittanceText = remittanceReference
    ? ''
    : sanitizeEpcLine(data.remittanceText || '').slice(0, 140)
  const originatorInfo = sanitizeEpcLine(data.originatorInfo || '').slice(0, 70)

  const lines = [
    'BCD',
    version,
    '1',
    'SCT',
    bic,
    name,
    iban,
    amount,
    purpose,
    remittanceReference,
    remittanceText,
    originatorInfo
  ]

  // Trailing empty fields may be omitted, but IBAN (index 6) is mandatory.
  while (lines.length > 7 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines.join('\n')
}

/**
 * Whether an IBAN's check digits are right (ISO 13616 mod-97). Catches nearly
 * every typo, so a payment code can't silently point at the wrong account.
 * Spaces and letter case don't matter.
 */
export const isValidIban = (value: string): boolean => {
  const iban = value.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const digits = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97
  }
  return remainder === 1
}

/** GS1's own resolver, for brands that don't run one on their own domain. */
export const GS1_DIGITAL_LINK_DEFAULT_DOMAIN = 'https://id.gs1.org'

/**
 * A problem with a GTIN (the product number in a barcode: 8, 12, 13 or 14
 * digits, check digit included), or null when it is valid.
 */
export const checkGtin = (value: string): string | null => {
  const gtin = value.replace(/[\s-]/g, '')
  if (!gtin) return 'Enter the product number (GTIN).'
  if (!/^\d+$/.test(gtin)) return 'A GTIN has digits only.'
  if (![8, 12, 13, 14].includes(gtin.length)) {
    return 'A GTIN has 8, 12, 13 or 14 digits, check digit included.'
  }
  const expected = gs1CheckDigit(gtin.slice(0, -1))
  if (Number(gtin[gtin.length - 1]) !== expected) {
    return `The check digit (the last digit) should be ${expected}.`
  }
  return null
}

/**
 * Generates a GS1 Digital Link: a web address carrying a product's GTIN (and
 * optionally its batch, serial number and expiry date) that phones open as a
 * link and shop checkouts read as the product. QR codes like this are what
 * retail is moving to from EAN/UPC barcodes ("Sunrise 2027").
 * @see https://ref.gs1.org/standards/digital-link/
 * @param {object} data
 * @param {string} [data.domain] - The brand's resolver, e.g. https://id.example.com; GS1's by default
 * @param {string} data.gtin - 8, 12, 13 or 14 digits, check digit included
 * @param {string} [data.lot] - Batch or lot (AI 10)
 * @param {string} [data.serial] - Serial number (AI 21)
 * @param {string} [data.expiry] - Expiry date as YYYY-MM-DD (AI 17)
 * @returns {string} - The link, or an empty string if the GTIN is invalid
 */
export const generateGs1DigitalLinkData = (data: {
  domain?: string
  gtin: string
  lot?: string
  serial?: string
  expiry?: string
}): string => {
  const gtin = data.gtin.replace(/[\s-]/g, '')
  if (checkGtin(gtin)) return ''
  const domain = (data.domain?.trim() || GS1_DIGITAL_LINK_DEFAULT_DOMAIN).replace(/\/+$/, '')
  let link = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  // Key qualifiers go in the path in this order; GTINs are always 14 digits.
  link += `/01/${gtin.padStart(14, '0')}`
  if (data.lot) link += `/10/${encodeURIComponent(data.lot)}`
  if (data.serial) link += `/21/${encodeURIComponent(data.serial)}`
  const expiry = /^\d{2}(\d{2})-(\d{2})-(\d{2})$/.exec(data.expiry ?? '')
  if (expiry) link += `?17=${expiry[1]}${expiry[2]}${expiry[3]}`
  return link
}

// Only links this form can write back unchanged count as GS1 Digital Links
// here; anything else (other qualifiers or attributes) stays a plain URL.
const GS1_DIGITAL_LINK =
  /^(https?:\/\/[^?#]*?)\/01\/(\d{14})(?:\/10\/([^/?#]+))?(?:\/21\/([^/?#]+))?\/?(?:\?17=(\d{6}))?$/i

// --- Data Detection ---

export type DetectedDataType =
  | 'text'
  | 'url'
  | 'email'
  | 'phone'
  | 'sms'
  | 'wifi'
  | 'vcard'
  | 'location'
  | 'event'
  | 'epc'
  | 'gs1dl'

interface ContentLine {
  /** Property name, upper case, without any group prefix ("item1."). */
  name: string
  /** Everything between the name and the colon, upper case (e.g. "TYPE=WORK,VOICE"). */
  params: string
  /** The raw (still escaped) value. */
  value: string
}

/**
 * Splits vCard / iCalendar text into content lines: unfolds continuation
 * lines and separates each line's name, parameters and value.
 */
function parseContentLines(data: string): ContentLine[] {
  const rawLines = data
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
  const result: ContentLine[] = []
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i]
    // vCard 2.1 quoted-printable values continue on the next line after a
    // trailing "=" (a soft line break), without the usual leading space.
    if (/^[^:]*QUOTED-PRINTABLE[^:]*:/i.test(line)) {
      while (line.endsWith('=') && i + 1 < rawLines.length) line = line.slice(0, -1) + rawLines[++i]
    }
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const head = line.slice(0, colon)
    const [rawName, ...params] = head.split(';')
    result.push({
      name: rawName.split('.').pop()!.trim().toUpperCase(),
      params: params.join(';').toUpperCase(),
      value: line.slice(colon + 1)
    })
  }
  return result
}

/** Decodes vCard 2.1 quoted-printable text (`=C3=BC` → `ü`) as UTF-8. */
function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = []
  const text = value
  for (let i = 0; i < text.length; i++) {
    const hex = text[i] === '=' ? text.slice(i + 1, i + 3) : ''
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(...new TextEncoder().encode(text[i]))
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

/** A content line's value with escapes (and any quoted-printable encoding) undone. */
function textValue(line: ContentLine): string {
  const raw = /QUOTED-PRINTABLE/.test(line.params) ? decodeQuotedPrintable(line.value) : line.value
  return unescapeText(raw).trim()
}

/** A structured value (N, ADR) split into its unescaped components. */
function componentValues(line: ContentLine): string[] {
  const raw = /QUOTED-PRINTABLE/.test(line.params) ? decodeQuotedPrintable(line.value) : line.value
  return splitUnescaped(raw, ';').map((part) => unescapeText(part).trim())
}

function parseWifi(data: string): Record<string, string | boolean> {
  const fields: Record<string, string> = {}
  for (const field of splitUnescaped(data.replace(/^WIFI:/i, ''), ';')) {
    const colon = field.indexOf(':')
    if (colon <= 0) continue
    const key = field.slice(0, colon).trim().toUpperCase()
    let value = field.slice(colon + 1)
    // Values that could be mistaken for hex may be wrapped in double quotes.
    if (
      value.length >= 2 &&
      value.startsWith('"') &&
      value.endsWith('"') &&
      !value.endsWith('\\"')
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in fields)) fields[key] = unescapeWiFi(value)
  }
  const type = (fields.T ?? '').toUpperCase()
  const encryption: WifiEncryption =
    type === 'WEP' ? 'WEP' : type === 'SAE' ? 'SAE' : type.startsWith('WPA') ? 'WPA' : 'nopass'
  return {
    ssid: fields.S ?? '',
    encryption,
    password: fields.P ?? '',
    hidden: (fields.H ?? '').toLowerCase() === 'true'
  }
}

function parseSms(data: string): Record<string, string> {
  const smsto = /^SMSTO:([^:]*)(?::([\s\S]*))?$/i.exec(data)
  if (smsto) return { phone: smsto[1].trim(), message: smsto[2] ?? '' }
  // sms:+123?body=Hello (RFC 5724)
  const uri = /^sms:([^?]*)(?:\?([\s\S]*))?$/i.exec(data)
  if (!uri) return { phone: '', message: '' }
  const params = new URLSearchParams(uri[2] ?? '')
  let phone = uri[1]
  try {
    phone = decodeURIComponent(phone)
  } catch {
    // keep it as written
  }
  return { phone: phone.trim(), message: params.get('body') ?? '' }
}

function parseVCard(data: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  const lines = parseContentLines(data)
  const first = (name: string) => lines.find((l) => l.name === name)

  const versionLine = first('VERSION')
  parsed.version = versionLine ? normalizeVCardVersion(versionLine.value) : '3'

  const n = first('N')
  if (n) {
    const [lastName = '', firstName = ''] = componentValues(n)
    if (lastName || firstName) {
      parsed.lastName = lastName
      parsed.firstName = firstName
    }
  }
  const fn = first('FN')
  if (!parsed.firstName && !parsed.lastName && fn) {
    const fnValue = textValue(fn)
    const org = first('ORG')
    // A company card's FN is the company name; don't turn it into a person.
    if (!org || componentValues(org).join(', ') !== fnValue) {
      const parts = fnValue.split(' ')
      parsed.firstName = parts[0]
      if (parts.length > 1) parsed.lastName = parts.slice(1).join(' ')
    }
  }

  const org = first('ORG')
  if (org) parsed.org = componentValues(org).filter(Boolean).join(', ')
  const title = first('TITLE')
  if (title) parsed.position = textValue(title)

  for (const line of lines.filter((l) => l.name === 'TEL')) {
    const phone = textValue(line).replace(/^tel:/i, '')
    const key = /\bWORK\b/.test(line.params)
      ? 'phoneWork'
      : /\bHOME\b/.test(line.params)
        ? 'phonePrivate'
        : /\b(CELL|MOBILE)\b/.test(line.params)
          ? 'phoneMobile'
          : !parsed.phoneWork && !parsed.phonePrivate && !parsed.phoneMobile
            ? 'phoneMobile'
            : null
    if (key && !parsed[key]) parsed[key] = phone
  }

  const email = first('EMAIL')
  if (email) parsed.email = textValue(email)
  const url = first('URL')
  if (url) parsed.website = textValue(url)

  const adr = first('ADR')
  if (adr) {
    const [, , street = '', city = '', state = '', zipcode = '', country = ''] =
      componentValues(adr)
    Object.assign(parsed, { street, city, state, zipcode, country })
  }
  return parsed
}

/**
 * Converts an iCalendar date or date-time to the `YYYY-MM-DDTHH:MM` form a
 * datetime-local field shows. UTC times (ending in Z) become local time, the
 * same way generateEventData turned local time into UTC; floating times and
 * dates are kept as written.
 */
export function iCalDateToLocalInput(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return ''
  const [, year, month, day, hour = '00', minute = '00', second = '00', utc] = m
  if (!utc) return `${year}-${month}-${day}T${hour}:${minute}`
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second))
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function parseEvent(data: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  const lines = parseContentLines(data)
  const first = (name: string) => lines.find((l) => l.name === name)
  const summary = first('SUMMARY')
  if (summary) parsed.title = textValue(summary)
  const location = first('LOCATION')
  if (location) parsed.location = textValue(location)
  const start = first('DTSTART')
  if (start) parsed.startTime = iCalDateToLocalInput(start.value)
  const end = first('DTEND')
  if (end) parsed.endTime = iCalDateToLocalInput(end.value)
  return parsed
}

/**
 * Detect data type from a string and parse it into structured data
 * @param {string} data - The input string to detect and parse
 * @returns {object} Object containing detected type and parsed data fields
 *   with the following properties:
 *   - type: One of 'text', 'url', 'email', 'phone', 'sms', 'wifi', 'vcard', 'location', 'event', 'epc'
 *   - parsedData: An object with fields appropriate for the detected type, ready
 *     to fill the matching form and give back the same data when regenerated
 *     (escaping is undone and dates are in the form's local time)
 *
 * For vCard detection, the function detects the vCard version (2.1, 3.0, or 4.0)
 * and extracts personal information fields into parsedData, including:
 *   - firstName, lastName: Name components
 *   - org: Organization name
 *   - position: Job title or position
 *   - phoneWork, phonePrivate, phoneMobile: Contact numbers
 *   - email: Email address
 *   - website: URL
 *   - street, city, state, zipcode, country: Address components
 *   - version: Detected vCard version mapped to '2', '3', or '4'
 */
export const detectDataType = (
  data: string
): {
  type: DetectedDataType
  parsedData: Record<string, string | boolean>
} => {
  const detected = (parsedData: Record<string, string | boolean>, type: DetectedDataType) => ({
    type,
    parsedData
  })

  if (!data) return detected({ text: data }, 'text')

  // EPC QR (SEPA Credit Transfer / GiroCode) detection
  if (/^BCD\r?\n/.test(data)) {
    const lines = data.replace(/\r/g, '').split('\n')
    const amountField = lines[7] || ''
    return detected(
      {
        version: lines[1] === '001' ? '001' : '002',
        bic: lines[4] || '',
        name: lines[5] || '',
        iban: lines[6] || '',
        amount: amountField.startsWith('EUR') ? amountField.slice(3) : '',
        purpose: lines[8] || '',
        remittanceReference: lines[9] || '',
        remittanceText: lines[10] || '',
        originatorInfo: lines[11] || ''
      },
      'epc'
    )
  }

  // vCard
  if (/^\s*BEGIN:VCARD/i.test(data)) return detected(parseVCard(data), 'vcard')

  // GS1 Digital Link (a product web address)
  const gs1 = GS1_DIGITAL_LINK.exec(data)
  if (gs1 && !checkGtin(gs1[2])) {
    const decode = (part?: string) => {
      try {
        return part ? decodeURIComponent(part) : ''
      } catch {
        return part ?? ''
      }
    }
    const yymmdd = gs1[5]
    return detected(
      {
        domain: gs1[1],
        gtin: gs1[2],
        lot: decode(gs1[3]),
        serial: decode(gs1[4]),
        expiry: yymmdd ? `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4)}` : ''
      },
      'gs1dl'
    )
  }

  // URL
  if (/^https?:\/\//i.test(data)) return detected({ url: data }, 'url')

  // Email
  if (/^mailto:/i.test(data)) {
    const parsedData: Record<string, string> = {}
    const emailParts = data.replace(/^mailto:/i, '').split('?')
    parsedData.address = emailParts[0] || ''
    if (emailParts[1]) {
      const params = new URLSearchParams(emailParts.slice(1).join('?'))
      parsedData.subject = params.get('subject') || ''
      parsedData.body = params.get('body') || ''
      parsedData.cc = params.get('cc') || ''
      parsedData.bcc = params.get('bcc') || ''
    }
    return detected(parsedData, 'email')
  }

  // Phone
  if (/^tel:/i.test(data)) return detected({ phone: data.replace(/^tel:/i, '') }, 'phone')

  // SMS (SMSTO:number:message or sms:number?body=message)
  if (/^(SMSTO|sms):/i.test(data)) return detected(parseSms(data), 'sms')

  // WiFi
  if (/^WIFI:/i.test(data)) return detected(parseWifi(data), 'wifi')

  // Location (geo:lat,lon[,alt][;params][?query])
  if (/^geo:/i.test(data)) {
    const coords = data.replace(/^geo:/i, '').split(/[;?]/)[0].split(',')
    return detected(
      coords.length >= 2 ? { latitude: coords[0].trim(), longitude: coords[1].trim() } : {},
      'location'
    )
  }

  // Calendar event
  if (/^\s*BEGIN:(VCALENDAR|VEVENT)/i.test(data)) return detected(parseEvent(data), 'event')

  return detected({ text: data }, 'text')
}
