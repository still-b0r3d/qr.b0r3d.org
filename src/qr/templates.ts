// The data templates, as b0r3d QR for PC writes and reads them: what each template writes from its
// fields, and which template a text is, with the fields that write it again. Fields go by the
// templates' own names ("ssid", "password"...); "hidden" is "true" or "false". Times in events are
// the browser's own.

export type TemplateKind = 'text' | 'url' | 'email' | 'phone' | 'sms' | 'wifi' | 'vcard' | 'location' | 'event' | 'epc' | 'gs1dl'

export type Fields = Record<string, string>

const has = (f: Fields | null | undefined, name: string): boolean => !!f && Object.prototype.hasOwnProperty.call(f, name)

/** A field's text, or "" when it has none. */
export function field(f: Fields | null | undefined, name: string): string {
  const v = has(f, name) ? f![name] : undefined
  return typeof v === 'string' ? v : ''
}

// ---------- escaping ----------

/** vCard text (RFC 6350 3.4): a backslash before each \ , and ; */
const vCardText = (value: string): string => value.replace(/[\\,;]/g, '\\$&')

/** A Wi-Fi code's name or password: a backslash before each \ ; , : " and ' */
const wifiText = (value: string): string => value.replace(/[\\;,:"']/g, '\\$&')

/** iCalendar text (RFC 5545 3.3.11): a backslash before each \ , and ;, every line break written as \n */
const iCalText = (value: string): string => value.replace(/\r\n|[\r\n]|[\\,;]/g, (m) => (m[0] === '\r' || m[0] === '\n' ? '\\n' : '\\' + m))

/** \, \; \: \\ as the character, \n or \N as a line break */
export const unescapeText = (v: string): string => v.replace(/\\([\\,;:nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))

export const unescapeWifi = (v: string): string => v.replace(/\\([\s\S])/g, '$1')

/** The parts between every separator that isn't escaped, escapes kept. */
export function splitUnescaped(text: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' && i + 1 < text.length) {
      current += c + text[i + 1]
      i++
    } else if (c === separator) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts
}

/** A payment code's line: each line break a space, then no space at either end. */
export const epcLine = (value: string | null | undefined): string => (value ?? '').replace(/\r\n|[\r\n]/g, ' ').trim()

/** encodeURIComponent, with half an emoji as the replacement character rather than an error. */
export function encodeComponent(s: string): string {
  return encodeURIComponent(wellFormed(s))
}

function wellFormed(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) {
      out += s[i] + s[i + 1]
      i++
    } else out += c >= 0xd800 && c <= 0xdfff ? String.fromCharCode(0xfffd) : s[i]
  }
  return out
}

/** decodeURIComponent, or null where it would throw (a stray %, broken UTF-8). */
function decodeComponent(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

// ---------- writing ----------

/**
 * The text a template writes from its fields; "" when what it needs is missing. An event also gets
 * the time it was made (DTSTAMP) and an id of its own (UID), so those two lines differ every time.
 */
export function makeText(kind: TemplateKind, f: Fields, now: Date = new Date(), uid: string = newUid()): string {
  switch (kind) {
    case 'url':
      return link(field(f, 'url'))
    case 'email':
      return mail(f)
    case 'phone':
      return field(f, 'phone').length === 0 ? '' : 'tel:' + field(f, 'phone')
    case 'sms':
      return field(f, 'phone').length === 0 ? '' : 'SMSTO:' + field(f, 'phone') + ':' + field(f, 'message')
    case 'wifi':
      return wifi(f)
    case 'vcard':
      return vCard(f)
    case 'location':
      return geo(field(f, 'latitude'), field(f, 'longitude'))
    case 'event':
      return event(f, now, uid)
    case 'epc':
      return epc(f)
    case 'gs1dl':
      return gs1DigitalLink(f)
    default:
      return field(f, 'text')
  }
}

/** A web address, made a secure one when it doesn't say http:// or https:// (in small letters). */
const link = (url: string): string => (url.length === 0 ? '' : /^https?:\/\//.test(url) ? url : 'https://' + url)

/** mailto:<address> (RFC 6068), with the subject, body, cc and bcc filled in, in that order. */
function mail(f: Fields): string {
  const address = field(f, 'address')
  if (address.length === 0) return ''
  const query = ['subject', 'body', 'cc', 'bcc']
    .filter((name) => field(f, name).length > 0)
    .map((name) => name + '=' + encodeComponent(field(f, name)))
    .join('&')
  return 'mailto:' + address + (query.length === 0 ? '' : '?' + query)
}

/**
 * The Wi-Fi code phones join from: WIFI:, then T:<security>, S:<name>, P:<password> (not for an
 * open network) and H:true for a hidden one, each ended by a semicolon, and one more to close it.
 */
function wifi(f: Fields): string {
  if (field(f, 'ssid').length === 0) return ''
  const security = field(f, 'encryption')
  const parts = ['T:' + security, 'S:' + wifiText(field(f, 'ssid'))]
  if (security !== 'nopass') parts.push('P:' + wifiText(field(f, 'password')))
  if (field(f, 'hidden') === 'true') parts.push('H:true')
  return 'WIFI:' + parts.join(';') + ';;'
}

/** geo:<latitude>,<longitude> (RFC 5870), as typed; nothing unless both read as numbers. */
const geo = (latitude: string, longitude: string): string =>
  Number.isNaN(parseFloat(latitude)) || Number.isNaN(parseFloat(longitude)) ? '' : 'geo:' + latitude + ',' + longitude

/** vCard 2.1, 3.0 (the default) or 4.0, from "2", "3" or "4" or any way of writing them. */
export function vCardVersion(version: string | null | undefined): string {
  const v = (version ?? '').trim()
  return v === '2' || v === '2.1' ? '2' : v === '4' || v === '4.0' ? '4' : '3'
}

/** How each of a contact's properties is spelled in vCard 2.1, 3.0 and 4.0, in the order written. */
const CONTACT_LINES: [string, string[]][] = [
  ['phoneWork', ['TEL;WORK;VOICE', 'TEL;TYPE=WORK,VOICE', 'TEL;TYPE=work,voice;VALUE=uri']],
  ['phonePrivate', ['TEL;HOME;VOICE', 'TEL;TYPE=HOME,VOICE', 'TEL;TYPE=home,voice;VALUE=uri']],
  ['phoneMobile', ['TEL;CELL;VOICE', 'TEL;TYPE=CELL,VOICE', 'TEL;TYPE=cell,voice;VALUE=uri']],
  ['email', ['EMAIL;INTERNET', 'EMAIL', 'EMAIL;TYPE=work']],
  ['website', ['URL', 'URL', 'URL;TYPE=work']]
]
const ADR_SPELLED = ['ADR;WORK', 'ADR;TYPE=WORK', 'ADR;TYPE=work']

/**
 * A contact card (vCard 2.1, 3.0 or 4.0), its lines joined by LF: the name (N, and FN as first and
 * last name; a card with only a company has FN from that), ORG, TITLE, the phones, EMAIL, URL and
 * ADR, each only when it has something in it. A 2.1 line whose value isn't all printable ASCII says
 * it's UTF-8; a 4.0 phone's value is a tel: URI.
 */
function vCard(f: Fields): string {
  const version = vCardVersion(field(f, 'version'))
  const spelling = version === '2' ? 0 : version === '3' ? 1 : 2
  let card = 'BEGIN:VCARD\nVERSION:' + ['2.1', '3.0', '4.0'][spelling]
  const line = (property: string, value: string): void => {
    card += '\n' + property
    if (spelling === 0 && /[^\x20-\x7e]/.test(value)) card += ';CHARSET=UTF-8'
    card += ':' + value
  }
  const first = vCardText(field(f, 'firstName'))
  const last = vCardText(field(f, 'lastName'))
  const company = field(f, 'org')
  if (first.length > 0 || last.length > 0) {
    line('N', last + ';' + first + ';;;')
    line('FN', (first + ' ' + last).trim())
  } else if (company.length > 0) line('FN', vCardText(company))
  if (company.length > 0) line('ORG', vCardText(company))
  if (field(f, 'position').length > 0) line('TITLE', vCardText(field(f, 'position')))
  for (const [name, spelled] of CONTACT_LINES) {
    const value = field(f, name)
    if (value.length === 0) continue
    const uri = spelling === 2 && name.startsWith('phone')
    line(spelled[spelling], (uri ? 'tel:' : '') + vCardText(value))
  }
  const address = ['street', 'city', 'state', 'zipcode', 'country'].map((name) => vCardText(field(f, name)))
  if (address.some((part) => part.length > 0)) line(ADR_SPELLED[spelling], ';;' + address.join(';'))
  return card + '\nEND:VCARD'
}

/**
 * A calendar event (RFC 5545): one VEVENT in a VCALENDAR, with its title and place as iCalendar
 * text, its start and end in UTC (each only when it's a time), then the time it was made and an id
 * of its own, which calendars want in every event.
 */
function event(f: Fields, now: Date, uid: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT']
  for (const [property, name] of [
    ['SUMMARY', 'title'],
    ['LOCATION', 'location']
  ])
    if (field(f, name).length > 0) lines.push(property + ':' + iCalText(field(f, name)))
  for (const [property, name] of [
    ['DTSTART', 'startTime'],
    ['DTEND', 'endTime']
  ]) {
    const when = iCalTime(field(f, name))
    if (when.length > 0) lines.push(property + ':' + when)
  }
  lines.push('DTSTAMP:' + utcStamp(now.getTime()))
  lines.push('UID:' + uid + '@qr.b0r3d.org')
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\n')
}

/** 18 characters: nine random bytes, each in base 36 and two long. */
export function newUid(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

function utcStamp(ms: number): string {
  const t = new Date(ms)
  return (
    pad(t.getUTCFullYear(), 4) + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + 'T' + pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + pad(t.getUTCSeconds()) + 'Z'
  )
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

/** A wall time read as UTC (years under 100 as they are, not 1900 onwards). */
function wallUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number): number {
  const t = new Date(0)
  t.setUTCFullYear(year, month - 1, day)
  t.setUTCHours(hour, minute, second, ms)
  return t.getTime()
}

/**
 * A local time in UTC, as the browser has it: a time skipped when the clocks go forward takes the
 * offset from before; one that happens twice when they go back, the first.
 */
function localToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number): number {
  const t = new Date(1970, 0, 1)
  t.setFullYear(year, month - 1, day)
  t.setHours(hour, minute, second, ms)
  return t.getTime()
}

const TIME = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,3})[0-9]*)?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$/

/**
 * A time as the browser reads one ("2026-11-08T14:30"), written in UTC: a date with a time and no
 * zone is local, a date alone is midnight UTC; "" when it isn't one.
 */
function iCalTime(text: string): string {
  const m = TIME.exec(text)
  if (!m) return ''
  const part = (g: number): number => (m[g] !== undefined ? parseInt(m[g], 10) : 0)
  const [year, month, day, hour, minute, second] = [part(1), part(2), part(3), part(4), part(5), part(6)]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(Math.max(1, year), month) || hour > 23 || minute > 59 || second > 59 || year < 1) return ''
  const ms = m[7] !== undefined ? parseInt(m[7].padEnd(3, '0'), 10) : 0
  let utc: number
  if (m[4] === undefined) utc = wallUtc(year, month, day, 0, 0, 0, 0)
  else if (m[8] === 'Z') utc = wallUtc(year, month, day, hour, minute, second, ms)
  else if (m[8] !== undefined) {
    const o = m[8]
    const offset = (parseInt(o.slice(1, 3), 10) * 60 + parseInt(o.slice(4, 6), 10)) * 60000
    utc = wallUtc(year, month, day, hour, minute, second, ms) + (o[0] === '+' ? -offset : offset)
  } else utc = localToUtc(year, month, day, hour, minute, second, ms)
  return utcStamp(utc)
}

/**
 * A SEPA credit transfer as banks' apps read it (EPC069-12), one field a line: BCD, the version
 * (001, or 002 which may leave out the BIC), 1 for UTF-8, SCT, the BIC, the payee, the IBAN, the
 * amount, the purpose, then either the structured reference or the text, then a note. The BIC and
 * IBAN go without spaces and in capitals; the payee, purpose (also in capitals), reference, text and
 * note are each one line, cut to the length the standard allows. Empty lines after the IBAN that
 * nothing follows are left off. Nothing is written without a payee and an IBAN, or for version 001
 * without a BIC.
 */
function epc(f: Fields): string {
  const versionOne = field(f, 'version') === '001'
  const bic = unspaced(field(f, 'bic')).toUpperCase()
  if (field(f, 'name').length === 0 || field(f, 'iban').length === 0 || (versionOne && bic.length === 0)) return ''
  const part = (name: string, most: number): string => upTo(epcLine(field(f, name)), most)
  const reference = part('remittanceReference', 35)
  const lines = [
    'BCD',
    versionOne ? '001' : '002',
    '1',
    'SCT',
    bic,
    part('name', 70),
    unspaced(field(f, 'iban')).toUpperCase(),
    euroAmount(field(f, 'amount')),
    part('purpose', 4).toUpperCase(),
    reference,
    reference.length > 0 ? '' : part('remittanceText', 140),
    part('originatorInfo', 70)
  ]
  let count = lines.length
  while (count > 7 && lines[count - 1].length === 0) count--
  return lines.slice(0, count).join('\n')
}

/** "EUR" and an amount above zero with two decimals, read with a point or a comma (the first comma is one). */
function euroAmount(typed: string): string {
  const comma = typed.indexOf(',')
  const value = parseFloat(comma < 0 ? typed : typed.slice(0, comma) + '.' + typed.slice(comma + 1))
  return !Number.isNaN(value) && value > 0 ? 'EUR' + value.toFixed(2) : ''
}

const unspaced = (value: string): string => value.replace(/\s+/g, '')

const upTo = (s: string, most: number): string => (s.length <= most ? s : s.slice(0, most))

/** An IBAN with the right check digits (ISO 13616, mod 97); spaces and case don't matter. */
export function validIban(value: string | null | undefined): boolean {
  const iban = (value ?? '').replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const c of rearranged) {
    const digits = c >= 'A' ? String(c.charCodeAt(0) - 55) : c
    for (const d of digits) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97
  }
  return remainder === 1
}

export const GS1_DOMAIN = 'https://id.gs1.org'

/** What's wrong with a GTIN (8, 12, 13 or 14 digits, check digit included), or null. */
export function gtinProblem(value: string | null | undefined): string | null {
  const gtin = (value ?? '').replace(/(\s|-)/g, '')
  if (gtin.length === 0) return 'Enter the product number (GTIN).'
  if (!/^[0-9]+$/.test(gtin)) return 'A GTIN has digits only.'
  if (![8, 12, 13, 14].includes(gtin.length)) return 'A GTIN has 8, 12, 13 or 14 digits, check digit included.'
  const expected = gs1CheckDigit(gtin.slice(0, -1))
  return gtin.charCodeAt(gtin.length - 1) - 48 !== expected ? 'The check digit (the last digit) should be ' + expected + '.' : null
}

/** GS1's check digit: weights 3 and 1 from the right. */
export function gs1CheckDigit(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) sum += (body.charCodeAt(body.length - 1 - i) - 48) * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}

function gs1DigitalLink(f: Fields): string {
  const gtin = field(f, 'gtin').replace(/(\s|-)/g, '')
  if (gtinProblem(gtin) !== null) return ''
  let domain = field(f, 'domain').trim()
  domain = (domain.length > 0 ? domain : GS1_DOMAIN).replace(/\/+$/, '')
  let address = /^https?:\/{2}/i.test(domain) ? domain : 'https://' + domain
  address += '/01/' + gtin.padStart(14, '0') // the key, then its qualifiers, in this order
  if (field(f, 'lot').length > 0) address += '/10/' + encodeComponent(field(f, 'lot'))
  if (field(f, 'serial').length > 0) address += '/21/' + encodeComponent(field(f, 'serial'))
  const expiry = /^[0-9]{2}([0-9]{2})-([0-9]{2})-([0-9]{2})$/.exec(field(f, 'expiry'))
  if (expiry) address += '?17=' + expiry[1] + expiry[2] + expiry[3]
  return address
}

/**
 * Only links this template can write back unchanged count as GS1 Digital Links; anything with
 * other qualifiers or attributes stays a plain web address.
 */
const GS1_LINK = /^(https?:\/{2}[^?#]*?)\/01\/([0-9]{14})(?:\/10\/([^/?#]+))?(?:\/21\/([^/?#]+))?\/?(?:\?17=([0-9]{6}))?$/i

// ---------- reading ----------

/** Which template a text is, and its fields ("text" for anything else). Writing them again gives the same text. */
export function detect(data: string | null | undefined): { kind: TemplateKind; fields: Fields } {
  const text = data ?? ''
  const kind = kindOf(text)
  const fields: Fields = {}
  switch (kind) {
    case 'epc':
      readPayment(text, fields)
      break
    case 'vcard':
      return { kind, fields: readVCard(text) }
    case 'gs1dl':
      readGs1(text, fields)
      break
    case 'url':
      fields.url = text
      break
    case 'email':
      readMail(text, fields)
      break
    case 'phone':
      fields.phone = text.slice('tel:'.length)
      break
    case 'sms':
      readSms(text, fields)
      break
    case 'wifi':
      readWifi(text, fields)
      break
    case 'location':
      readGeo(text, fields)
      break
    case 'event':
      readEvent(text, fields)
      break
    default:
      fields.text = text
  }
  return { kind, fields }
}

/** How a text starts, in capitals or small letters, for each kind it can be, tried in this order. */
const STARTS: [RegExp, TemplateKind][] = [
  [/^https?:\/{2}/i, 'url'],
  [/^mailto:/i, 'email'],
  [/^tel:/i, 'phone'],
  [/^(SMSTO|sms):/i, 'sms'],
  [/^WIFI:/i, 'wifi'],
  [/^geo:/i, 'location'],
  [/^\s*BEGIN:(VCALENDAR|VEVENT)/i, 'event']
]

/**
 * Which kind a text is: a payment when it starts BCD and a line break (in capitals), a contact card
 * when it starts BEGIN:VCARD (after any white space), a GS1 Digital Link when it's one this template
 * writes with a right check digit, then by how it starts; anything else, and nothing at all, is text.
 */
function kindOf(text: string): TemplateKind {
  if (text.length === 0) return 'text'
  if (/^BCD\r?\n/.test(text)) return 'epc'
  if (/^\s*BEGIN:VCARD/i.test(text)) return 'vcard'
  const gs1 = GS1_LINK.exec(text)
  if (gs1 && gtinProblem(gs1[2]) === null) return 'gs1dl'
  for (const [start, kind] of STARTS) if (start.test(text)) return kind
  return 'text'
}

/** A payment's fields from its lines (CRs left out): the version, then from the fifth line on. */
const PAYMENT_FIELDS = ['bic', 'name', 'iban', 'amount', 'purpose', 'remittanceReference', 'remittanceText', 'originatorInfo']

function readPayment(text: string, fields: Fields): void {
  const lines = text.replace(/\r/g, '').split('\n')
  const lineAt = (n: number): string => (n < lines.length ? lines[n] : '')
  fields.version = lineAt(1) === '001' ? '001' : '002'
  PAYMENT_FIELDS.forEach((name, i) => (fields[name] = lineAt(4 + i)))
  const amount = fields.amount
  fields.amount = amount.startsWith('EUR') ? amount.slice(3) : ''
}

function readGs1(text: string, fields: Fields): void {
  const m = GS1_LINK.exec(text)!
  const decode = (v: string | undefined): string => (v === undefined ? '' : (decodeComponent(v) ?? v))
  const date = m[5] ?? ''
  fields.domain = m[1]
  fields.gtin = m[2]
  fields.lot = decode(m[3])
  fields.serial = decode(m[4])
  fields.expiry = date.length > 0 ? '20' + date.slice(0, 2) + '-' + date.slice(2, 4) + '-' + date.slice(4) : ''
}

/**
 * mailto:<address>?<query>: the address is everything up to the first ?. The subject, body, cc and
 * bcc are read from what follows it, unless that's nothing or starts with another ?.
 */
function readMail(text: string, fields: Fields): void {
  const rest = text.slice('mailto:'.length)
  const question = rest.indexOf('?')
  fields.address = question < 0 ? rest : rest.slice(0, question)
  const query = question < 0 ? '' : rest.slice(question + 1)
  if (query.length === 0 || query[0] === '?') return
  const params = new URLSearchParams(query)
  for (const name of ['subject', 'body', 'cc', 'bcc']) fields[name] = params.get(name) ?? ''
}

/** geo:<latitude>,<longitude>, anything from a ; or ? on left off; with fewer than two, no fields. */
function readGeo(text: string, fields: Fields): void {
  const place = text.slice('geo:'.length)
  const end = place.search(/[;?]/)
  const coordinates = (end < 0 ? place : place.slice(0, end)).split(',')
  if (coordinates.length < 2) return
  fields.latitude = coordinates[0].trim()
  fields.longitude = coordinates[1].trim()
}

function readSms(data: string, fields: Fields): void {
  const smsto = /^SMSTO:([^:]*)(?::([\s\S]*))?$/i.exec(data)
  if (smsto) {
    fields.phone = smsto[1].trim()
    fields.message = smsto[2] ?? ''
    return
  }
  const uri = /^sms:([^?]*)(?:\?([\s\S]*))?$/i.exec(data) // sms:+123?body=Hello (RFC 5724)
  if (!uri) {
    fields.phone = ''
    fields.message = ''
    return
  }
  fields.phone = (decodeComponent(uri[1]) ?? uri[1]).trim()
  fields.message = new URLSearchParams(uri[2] ?? '').get('body') ?? ''
}

function readWifi(data: string, fields: Fields): void {
  const found = new Map<string, string>()
  for (const part of splitUnescaped(data.replace(/^WIFI:/i, ''), ';')) {
    const colon = part.indexOf(':')
    if (colon <= 0) continue
    const key = part.slice(0, colon).trim().toUpperCase()
    let value = part.slice(colon + 1)
    // a value that could pass for hex may be in double quotes
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"') && !value.endsWith('\\"')) value = value.slice(1, -1)
    if (!found.has(key)) found.set(key, unescapeWifi(value))
  }
  const get = (key: string): string => found.get(key) ?? ''
  const type = get('T').toUpperCase()
  fields.ssid = get('S')
  fields.encryption = type === 'WEP' ? 'WEP' : type === 'SAE' ? 'SAE' : type.startsWith('WPA') ? 'WPA' : 'nopass'
  fields.password = get('P')
  fields.hidden = get('H').toLowerCase() === 'true' ? 'true' : 'false'
}

// ---------- vCard and iCalendar lines ----------

interface ContentLine {
  /** in capitals, a group prefix ("item1.") left off */
  name: string
  /** in capitals */
  params: string
  /** still escaped */
  value: string
}

/** The lines of a vCard or iCalendar text: folded lines joined, each split into name, parameters and value. */
function contentLines(data: string): ContentLine[] {
  const raw = data.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const result: ContentLine[] = []
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i]
    // vCard 2.1's quoted-printable values go on after a trailing "=" without a leading space
    if (/^[^:]*QUOTED-PRINTABLE[^:]*:/i.test(line)) while (line.endsWith('=') && i + 1 < raw.length) line = line.slice(0, -1) + raw[++i]
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const head = line.slice(0, colon).split(';')
    result.push({ name: head[0].split('.').at(-1)!.trim().toUpperCase(), params: head.slice(1).join(';').toUpperCase(), value: line.slice(colon + 1) })
  }
  return result
}

/** vCard 2.1's quoted-printable ("=C3=BC" for ü) as UTF-8, each letter that isn't a "=XX" as its own bytes. */
function quotedPrintable(value: string): string {
  const bytes: number[] = []
  const encoder = new TextEncoder()
  for (let i = 0; i < value.length; i++) {
    const hex = value[i] === '=' ? value.slice(i + 1, i + 3) : ''
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      const c = value.charCodeAt(i)
      if (c >= 0xd800 && c <= 0xdfff) bytes.push(0xef, 0xbf, 0xbd)
      else bytes.push(...encoder.encode(value[i]))
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

const rawValue = (line: ContentLine): string => (line.params.includes('QUOTED-PRINTABLE') ? quotedPrintable(line.value) : line.value)

const textValue = (line: ContentLine): string => unescapeText(rawValue(line)).trim()

const components = (line: ContentLine): string[] => splitUnescaped(rawValue(line), ';').map((p) => unescapeText(p).trim())

function readVCard(data: string): Fields {
  const parsed: Fields = {}
  const lines = contentLines(data)
  const first = (name: string): ContentLine | undefined => lines.find((l) => l.name === name)
  const filled = (key: string): boolean => (parsed[key] ?? '').length > 0

  const version = first('VERSION')
  parsed.version = version ? vCardVersion(version.value) : '3'
  const n = first('N')
  if (n) {
    const parts = components(n)
    const last = parts[0] ?? ''
    const given = parts[1] ?? ''
    if (last.length > 0 || given.length > 0) {
      parsed.lastName = last
      parsed.firstName = given
    }
  }
  const fn = first('FN')
  const org = first('ORG')
  if (!filled('firstName') && !filled('lastName') && fn) {
    const name = textValue(fn)
    // a company's card is named after the company: it isn't a person. A person's name alone gives
    // its first word as the first name and the rest, if any, as the last.
    if (!org || components(org).join(', ') !== name) {
      const space = name.indexOf(' ')
      parsed.firstName = space < 0 ? name : name.slice(0, space)
      if (space >= 0) parsed.lastName = name.slice(space + 1)
    }
  }
  if (org) parsed.org = components(org).filter((p) => p.length > 0).join(', ')
  const title = first('TITLE')
  if (title) parsed.position = textValue(title)
  // each phone goes in by its type (work, home, cell or mobile), the first of each; one with no
  // type is the mobile, but only when no phone has gone in before it
  const phones = ['phoneWork', 'phonePrivate', 'phoneMobile']
  for (const line of lines.filter((l) => l.name === 'TEL')) {
    const phone = textValue(line).replace(/^tel:/i, '')
    const key = /\bWORK\b/.test(line.params)
      ? 'phoneWork'
      : /\bHOME\b/.test(line.params)
        ? 'phonePrivate'
        : /\b(CELL|MOBILE)\b/.test(line.params)
          ? 'phoneMobile'
          : phones.some(filled)
            ? null
            : 'phoneMobile'
    if (key !== null && !filled(key)) parsed[key] = phone
  }
  const email = first('EMAIL')
  const url = first('URL')
  const adr = first('ADR')
  if (email) parsed.email = textValue(email)
  if (url) parsed.website = textValue(url)
  if (adr) {
    const parts = components(adr)
    const part = (i: number): string => parts[i] ?? ''
    parsed.street = part(2)
    parsed.city = part(3)
    parsed.state = part(4)
    parsed.zipcode = part(5)
    parsed.country = part(6)
  }
  return parsed
}

function readEvent(data: string, fields: Fields): void {
  const lines = contentLines(data)
  const first = (name: string): ContentLine | undefined => lines.find((l) => l.name === name)
  const summary = first('SUMMARY')
  const location = first('LOCATION')
  const start = first('DTSTART')
  const end = first('DTEND')
  if (summary) fields.title = textValue(summary)
  if (location) fields.location = textValue(location)
  if (start) fields.startTime = localInput(start.value)
  if (end) fields.endTime = localInput(end.value)
}

/**
 * An iCalendar date or time as a form's "2026-11-01T14:30": a UTC time (ending in Z) in local
 * time, a floating time or a date as written; "" when it isn't one.
 */
export function localInput(value: string): string {
  const m = /^([0-9]{4})([0-9]{2})([0-9]{2})(?:T([0-9]{2})([0-9]{2})([0-9]{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return ''
  const g = (i: number, empty: string): string => m[i] ?? empty
  if (m[7] === undefined) return g(1, '') + '-' + g(2, '') + '-' + g(3, '') + 'T' + g(4, '00') + ':' + g(5, '00')
  const n = (i: number): number => parseInt(g(i, '0'), 10)
  // as Date.UTC does: years 0-99 are 1900-1999, and a month or day past the end carries into the next
  const utc = new Date(Date.UTC(n(1), n(2) - 1, n(3), n(4), n(5), n(6)))
  if (utc.getUTCFullYear() > 9999) return ''
  return String(utc.getFullYear()) + '-' + pad(utc.getMonth() + 1) + '-' + pad(utc.getDate()) + 'T' + pad(utc.getHours()) + ':' + pad(utc.getMinutes())
}
