// The "Data to encode" form as data, as b0r3d QR for PC has it: each template's fields in order,
// what's required, the example it fills in, and the fields it fills from existing text.

import { trimmedText } from './checks'
import { epcLine, field, GS1_DOMAIN, gtinProblem, validIban, type Fields, type TemplateKind } from './templates'

export type FieldKind = 'line' | 'lines' | 'password' | 'choice' | 'check' | 'number' | 'date' | 'datetime'

/** One field of a template's form. */
export interface TemplateField {
  /** as the templates write and read it */
  name: string
  label: string
  kind: FieldKind
  placeholder: string
  /** a line under the field */
  hint: string | null
  /** 0: no limit */
  maxLength: number
  /** value and label */
  choices: [string, string][] | null
  /** across both columns of the contact form */
  wide: boolean
  /** a web or email address */
  address: boolean
}

/** The Data section's list, in its order. */
export const MENU: TemplateKind[] = ['text', 'url', 'wifi', 'vcard', 'email', 'phone', 'sms', 'location', 'event', 'epc', 'gs1dl']

/** The form's "Data type" list, in its order. */
export const TYPES: TemplateKind[] = ['text', 'url', 'email', 'phone', 'sms', 'wifi', 'vcard', 'location', 'event', 'epc', 'gs1dl']

export function templateLabel(kind: TemplateKind): string {
  switch (kind) {
    case 'url':
      return 'URL'
    case 'email':
      return 'Email'
    case 'phone':
      return 'Phone'
    case 'sms':
      return 'SMS'
    case 'wifi':
      return 'WiFi'
    case 'vcard':
      return 'vCard'
    case 'location':
      return 'Location'
    case 'event':
      return 'Event'
    case 'epc':
      return 'EPC QR (SEPA Payment)'
    case 'gs1dl':
      return 'Product (GS1 Digital Link)'
    default:
      return 'Text'
  }
}

/** The words above a template's fields, if it has any. */
export function templateIntro(kind: TemplateKind): string | null {
  switch (kind) {
    case 'gs1dl':
      return 'A web address for a product. Phones open it as a link; shop checkouts read the product number from it, the same as from an EAN or UPC barcode.'
    case 'epc':
      return 'A bank transfer in euros, as an EPC QR code (also called GiroCode): banking apps that scan it fill in the payment for you.'
    default:
      return null
  }
}

export const REQUIRED_NOTE = 'Fields with a * have to be filled in.'

const f = (name: string, label: string, placeholder = '', kind: FieldKind = 'line', maxLength = 0, hint: string | null = null): TemplateField => ({
  name,
  label,
  kind,
  placeholder,
  hint,
  maxLength,
  choices: null,
  wide: false,
  address: false
})

const address = (field: TemplateField): TemplateField => ({ ...field, address: true })

const choice = (name: string, label: string, choices: [string, string][], wide = false): TemplateField => ({ ...f(name, label, '', 'choice'), choices, wide })

export function templateFields(kind: TemplateKind): TemplateField[] {
  switch (kind) {
    case 'url':
      return [address(f('url', 'URL', 'https://b0r3d.org'))]
    case 'email':
      return [
        address(f('address', 'Email Address', 'name@example.com')),
        address(f('cc', 'CC', 'Copied in, if anyone')),
        address(f('bcc', 'BCC', 'Copied in unseen, if anyone')),
        f('subject', 'Subject', "What it's about"),
        f('body', 'Message', 'What it says', 'lines')
      ]
    case 'phone':
      return [f('phone', 'Phone Number', '+1-202-555-0100')]
    case 'sms':
      return [f('phone', 'Phone Number', '+1-202-555-0100'), f('message', 'Message', 'What it says', 'lines')]
    case 'wifi':
      return [
        choice('encryption', 'Encryption', [
          ['nopass', 'No encryption'],
          ['WEP', 'WEP'],
          ['WPA', 'WPA/WPA2/WPA3 (most networks)'],
          ['SAE', 'WPA3 only']
        ]),
        f('ssid', 'Wireless SSID', "The network's name, as phones list it"),
        f('password', 'Password', 'Capital letters count', 'password'),
        f('hidden', 'Hidden SSID', '', 'check')
      ]
    case 'vcard':
      return [
        choice(
          'version',
          'vCard Version',
          [
            ['2', 'vCard 2.1'],
            ['3', 'vCard 3.0'],
            ['4', 'vCard 4.0']
          ],
          true
        ),
        f('firstName', 'First Name', 'Rukus'),
        f('lastName', 'Last Name', 'Cat'),
        f('org', 'Organization', 'b0r3d.org'),
        f('position', 'Position', 'Chief napper'),
        f('phoneWork', 'Phone (Work)', '+1 202 555 0100'),
        f('phonePrivate', 'Phone (Private)', '+1 202 555 0142'),
        f('phoneMobile', 'Phone (Mobile)', '+1 202 555 0199'),
        address(f('email', 'Email', 'rukus@example.com')),
        address(f('website', 'Website', 'https://b0r3d.org')),
        f('street', 'Street', '1 Loaf Lane'),
        f('zipcode', 'Zipcode', '12345'),
        f('city', 'City', 'Breadville'),
        f('state', 'State', 'CA'),
        f('country', 'Country', 'USA')
      ]
    case 'location':
      // Greenwich's old observatory, on the prime meridian
      return [f('latitude', 'Latitude', '51.4769', 'number'), f('longitude', 'Longitude', '-0.0005', 'number')]
    case 'event':
      return [
        f('title', 'Event Title', 'Nap time'),
        f('location', 'Event Location', 'The sunny windowsill'),
        f('startTime', 'Start Time', '', 'datetime'),
        f('endTime', 'End Time', '', 'datetime')
      ]
    case 'gs1dl':
      return [
        f('gtin', 'Product number (GTIN)', '09506000134352', 'line', 18, 'The number under the barcode: 8, 12, 13 or 14 digits.'),
        f('lot', 'Batch or lot', '', 'line', 20),
        f('serial', 'Serial number', '', 'line', 20),
        f('expiry', 'Expiry date', '', 'date'),
        address(
          f('domain', 'Web address (resolver)', GS1_DOMAIN, 'line', 0, "Your brand's own, if it has one set up; otherwise GS1's, which sends people to whatever the brand registered.")
        )
      ]
    case 'epc':
      return [
        choice('version', 'EPC QR Version', [
          ['002', 'Version 2 (the BIC can be left out)'],
          ['001', 'Version 1 (the BIC is needed)']
        ]),
        f('name', 'Beneficiary Name', 'Rukus Cat', 'line', 70),
        // the example IBAN banks' own documents use, and the BIC of its bank
        f('iban', 'IBAN', 'DE89 3704 0044 0532 0130 00', 'line', 34),
        f('bic', 'BIC', 'COBADEFFXXX', 'line', 11),
        f('amount', 'Amount (EUR)', '12.50'),
        f('purpose', 'Purpose Code', 'GDDS', 'line', 4),
        f('remittanceText', 'Payment Reference', 'Cat food', 'line', 140),
        // an ISO 11649 reference with real check digits
        f('remittanceReference', 'Structured Creditor Reference', 'RF76B0R3D', 'line', 35, 'A code holds one reference or the other: once this one is filled in, the payment reference is left out.'),
        f('originatorInfo', 'Beneficiary Information', '', 'line', 70)
      ]
    default:
      return [f('text', 'Text', 'A note, a quote, anything', 'lines')]
  }
}

/** What a form starts with before anything is typed in it. */
export function templateDefaults(kind: TemplateKind): Fields {
  const v: Fields = {}
  for (const fl of templateFields(kind)) v[fl.name] = ''
  if (kind === 'wifi') {
    v.encryption = 'nopass'
    v.hidden = 'false'
  }
  if (kind === 'vcard') v.version = '3'
  if (kind === 'epc') v.version = '002'
  return v
}

// ---------- what each template asks of its fields ----------

interface Rule {
  kind: TemplateKind
  field: string
  starred: (v: Fields) => boolean
  off: (v: Fields) => boolean
  problem: (v: Fields) => string | null
  /** its message stays until the next Save, whatever's typed in it */
  messageStays: boolean
}

const never = (): boolean => false
const always = (): boolean => true
const secured = (v: Fields): boolean => field(v, 'encryption') !== 'nopass'
const versionOne = (v: Fields): boolean => field(v, 'version') === '001'
const unspaced = (value: string): string => value.replace(/\s+/g, '')

const rule = (kind: TemplateKind, name: string, parts: Partial<Omit<Rule, 'kind' | 'field'>>): Rule => ({
  kind,
  field: name,
  starred: never,
  off: never,
  problem: () => null,
  messageStays: false,
  ...parts
})

/** A field marked * that Save asks for when it's empty. */
const needed = (kind: TemplateKind, name: string, says: string): Rule => rule(kind, name, { starred: always, problem: (v) => (field(v, name).length === 0 ? says : null) })

export const IBAN_CHECK = "This IBAN's check digits don't match. Check it for a typo."
export const AMOUNT_CHECK = 'Enter the amount like 25.00 or 25,00, from 0.01 to 999999999.99, or leave it empty.'

/** In the order Save lists what's wrong. */
const RULES: Rule[] = [
  needed('text', 'text', 'Type the text for the code.'),
  needed('url', 'url', 'Type the web address.'),
  needed('email', 'address', 'Type the email address.'),
  needed('phone', 'phone', 'Type the phone number.'),
  needed('sms', 'phone', 'Type the phone number.'),
  needed('wifi', 'ssid', "Type the network's name."),
  rule('wifi', 'password', {
    starred: secured,
    off: (v) => !secured(v),
    messageStays: true,
    problem: (v) => (secured(v) && field(v, 'password').length === 0 ? 'Type the password, or choose No encryption.' : null)
  }),
  // a coordinate that isn't a number (read from a geo: text) would write an empty code: asked for here
  rule('location', 'latitude', { starred: always, problem: (v) => (Number.isNaN(parseFloat(field(v, 'latitude'))) ? 'Type the latitude as a number.' : null) }),
  rule('location', 'longitude', { starred: always, problem: (v) => (Number.isNaN(parseFloat(field(v, 'longitude'))) ? 'Type the longitude as a number.' : null) }),
  needed('event', 'title', 'Give the event a title.'),
  needed('event', 'startTime', 'Choose when it starts.'),
  needed('event', 'endTime', 'Choose when it ends.'),
  rule('gs1dl', 'gtin', { starred: always, problem: (v) => gtinProblem(field(v, 'gtin')) }),
  // a payment is checked as its lines are written: a name or BIC of spaces alone would make an empty
  // line, or no code at all
  rule('epc', 'name', { starred: always, problem: (v) => (epcLine(field(v, 'name')).length === 0 ? "Type the beneficiary's name." : null) }),
  rule('epc', 'iban', {
    starred: always,
    problem: (v) => (unspaced(field(v, 'iban')).length === 0 ? 'Type the IBAN.' : validIban(field(v, 'iban')) ? null : IBAN_CHECK)
  }),
  rule('epc', 'bic', {
    starred: versionOne,
    problem: (v) => (versionOne(v) && unspaced(field(v, 'bic')).length === 0 ? 'Version 1 needs the BIC: type it, or choose version 2.' : null)
  }),
  rule('epc', 'amount', { problem: (v) => (amountOk(field(v, 'amount')) ? null : AMOUNT_CHECK) }),
  rule('epc', 'remittanceText', { off: (v) => field(v, 'remittanceReference').length > 0 })
]

const ruleFor = (kind: TemplateKind, name: string): Rule | undefined => RULES.find((r) => r.kind === kind && r.field === name)

/** A required field is marked with an asterisk. */
export const isRequired = (kind: TemplateKind, name: string, v: Fields): boolean => ruleFor(kind, name)?.starred(v) ?? false

export const isDisabled = (kind: TemplateKind, name: string, v: Fields): boolean => ruleFor(kind, name)?.off(v) ?? false

/** The line under a field that changes with it: a WPA3-only warning, the check of a GTIN or an IBAN. */
export function liveNote(kind: TemplateKind, name: string, v: Fields): string | null {
  if (kind === 'wifi' && name === 'encryption' && field(v, 'encryption') === 'SAE')
    return "Only for networks that accept nothing but WPA3. Some phones can't join from a WPA3-only code; WPA/WPA2/WPA3 works for mixed networks."
  if (kind === 'gs1dl' && name === 'gtin' && field(v, 'gtin').length > 0) return gtinProblem(field(v, 'gtin'))
  if (kind === 'epc' && name === 'iban') {
    const iban = unspaced(field(v, 'iban'))
    if (iban.length >= 15 && !validIban(iban)) return IBAN_CHECK
  }
  return null
}

/** What's missing or wrong when Save is clicked, field by field. */
export function templateProblems(kind: TemplateKind, v: Fields): [string, string][] {
  return RULES.filter((r) => r.kind === kind)
    .map((r): [string, string | null] => [r.field, r.problem(v)])
    .filter((p): p is [string, string] => p[1] !== null)
}

/**
 * An amount a payment code can carry, or none: euros, with up to two decimals after a point or a
 * comma, from 0.01 to 999999999.99. Anything else is asked about rather than guessed ("1.234,56").
 */
export function amountOk(amount: string | null | undefined): boolean {
  const a = (amount ?? '').trim()
  if (a.length === 0) return true
  const m = /^([0-9]{0,9})(?:[.,]([0-9]{0,2}))?$/.exec(a)
  return !!m && m[1].length + (m[2] ?? '').length > 0 && parseFloat(a.replace(/,/g, '.')) >= 0.01
}

/** Whether a field's message goes once something is typed in it (all but the Wi-Fi password's). */
export const clearsWhenFilled = (kind: TemplateKind, name: string): boolean => !(ruleFor(kind, name)?.messageStays ?? false)

/** The checks of what's typed (an IBAN's check digits, an amount) go as soon as the field changes. */
export const clearsWhenChanged = (message: string): boolean => message === IBAN_CHECK || message === AMOUNT_CHECK

/** A wall time as a form has it ("2026-11-08T14:30"). */
const wallText = (t: Date): string =>
  `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}T${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`

/**
 * What "Use example" puts in the template on show, field by field. A field given "" is emptied; one
 * that isn't listed keeps what's in it (a contact's version, say). An event starts now (the
 * browser's clock) and ends an hour later on the clock.
 */
export function templateExample(kind: TemplateKind, now: Date = new Date()): Fields {
  switch (kind) {
    case 'url':
      return { url: 'https://b0r3d.org' }
    case 'email':
      return { address: 'rukus@example.com', cc: 'staff@example.com', bcc: 'vet@example.com', subject: 'My bowl', body: "It's empty again. Please see to it." }
    case 'phone':
      return { phone: '+1-202-555-0100' }
    case 'sms':
      return { phone: '+1-202-555-0100', message: 'Dinner at six? Rukus says yes.' }
    case 'wifi':
      return { encryption: 'WPA', ssid: 'b0r3d guest', password: 'naps-all-day', hidden: 'false' }
    case 'vcard':
      // the contact in the batch example, with whole phone numbers
      return {
        firstName: 'Rukus',
        lastName: 'Cat',
        org: 'b0r3d.org',
        position: 'Chief napper',
        phoneWork: '+1 202 555 0100',
        phonePrivate: '',
        phoneMobile: '+1 202 555 0199',
        email: 'rukus@example.com',
        website: 'https://b0r3d.org',
        street: '1 Loaf Lane',
        zipcode: '12345',
        city: 'Breadville',
        state: 'CA',
        country: 'USA'
      }
    case 'location':
      return { latitude: '48.8584', longitude: '2.2945' } // the Eiffel Tower
    case 'event': {
      // the wall clock now, and an hour on from it (read as UTC so no zone moves it)
      const wall = new Date(0)
      wall.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate())
      wall.setUTCHours(now.getHours(), now.getMinutes(), 0, 0)
      const later = new Date(wall.getTime() + 3600000)
      return { title: 'Nap time', location: 'The sunny windowsill', startTime: wallText(wall), endTime: wallText(later) }
    }
    case 'gs1dl':
      // GS1's own example number, so the example can't point at a real product
      return { gtin: '09506000134352', lot: 'ABC123', serial: '', expiry: '2027-12-31', domain: '' }
    case 'epc':
      return {
        version: '002',
        name: 'Rukus Cat',
        iban: 'DE89 3704 0044 0532 0130 00',
        bic: 'COBADEFFXXX',
        amount: '12.50',
        purpose: '',
        remittanceText: 'Cat food',
        remittanceReference: '',
        originatorInfo: ''
      }
    default:
      return { text: 'Rukus was here.' }
  }
}

/** The form's fields filled from a text read as this template, with the defaults for the choices. */
export function formFromText(kind: TemplateKind, read: Fields): Fields {
  const v = templateDefaults(kind)
  for (const name of Object.keys(v)) v[name] = field(read, name)
  switch (kind) {
    case 'wifi':
      if (v.encryption.length === 0) v.encryption = 'nopass'
      v.hidden = field(read, 'hidden') === 'true' ? 'true' : 'false'
      break
    case 'vcard':
      if (v.version.length === 0) v.version = '3'
      break
    case 'gs1dl':
      if (v.domain === GS1_DOMAIN) v.domain = ''
      break
    case 'epc':
      v.version = field(read, 'version') === '001' ? '001' : '002'
      break
  }
  return v
}


/** What a number field holds once something's typed in it: the number as JavaScript writes it ("40.70" is 40.7), or nothing. */
export function typedNumber(typed: string | null | undefined): string {
  const t = trimmedText(typed ?? '')
  return /^-?([0-9]+(\.[0-9]+)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/.test(t) ? String(parseFloat(t)) : ''
}

/**
 * What a field gives for what's typed in it: a box of lines its line breaks as \n alone; a one-line
 * field no line breaks; a web or email address no spaces or tabs at either end.
 */
export function asTyped(fl: Pick<TemplateField, 'kind' | 'address'>, text: string | null | undefined): string {
  if (fl.kind === 'lines') return (text ?? '').replace(/\r\n?/g, '\n')
  const line = (text ?? '').replace(/[\r\n]/g, '')
  return fl.address ? line.replace(/^[\t\f ]+|[\t\f ]+$/g, '') : line
}
