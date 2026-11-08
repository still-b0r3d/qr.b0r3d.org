import { describe, expect, it } from 'vitest'
import pc from '../test/pc-app-templates.json'
import { dataChecks } from './checks'
import { plainDesign } from './design'
import { readDesign, writeDesign } from './design-file'
import { describeRecent, newRecent, sizeText } from './recent'
import {
  amountOk,
  asTyped,
  clearsWhenFilled,
  formFromText,
  isDisabled,
  isRequired,
  liveNote,
  MENU,
  templateDefaults,
  templateExample,
  templateFields,
  templateIntro,
  templateLabel,
  templateProblems,
  TYPES,
  typedNumber,
  AMOUNT_CHECK,
  IBAN_CHECK,
  REQUIRED_NOTE,
  type FieldKind
} from './template-forms'
import { detect, GS1_DOMAIN, gtinProblem, localInput, makeText, validIban, type Fields, type TemplateKind } from './templates'

// What the PC app (b0r3d QR 0.8, its code loaded by reflection, no window, in New York's time zone)
// writes and reads for each data template, what its forms ask, what it says about typed text, and
// how Recent codes names a code. The website must give the same, character for character.

const KIND: Record<string, TemplateKind> = {
  Text: 'text',
  Url: 'url',
  Email: 'email',
  Phone: 'phone',
  Sms: 'sms',
  Wifi: 'wifi',
  VCard: 'vcard',
  Location: 'location',
  Event: 'event',
  Epc: 'epc',
  Gs1DigitalLink: 'gs1dl'
}
const FIELD_KIND: Record<string, FieldKind> = {
  Line: 'line',
  Lines: 'lines',
  Password: 'password',
  Choice: 'choice',
  Check: 'check',
  Number: 'number',
  Date: 'date',
  DateTime: 'datetime'
}

/** The fields as an object (the PC's JSON writes an empty one as nothing at all), sorted. */
const fields = (o: unknown): Fields =>
  Object.fromEntries(
    Object.entries(o && typeof o === 'object' ? (o as Fields) : {})
      .map(([k, v]) => [k, v ?? ''] as [string, string])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )

/** Half an emoji, as the PC's JSON carries it: the replacement character. */
const asCarried = (s: string): string => s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, String.fromCharCode(0xfffd))

const NOW = new Date(pc.utcNow)

describe('the browser runs in the PC answers’ time zone', () => {
  it('is New York', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(pc.zone)
  })
})

describe('templates write what the PC app writes', () => {
  it.each(pc.made.map((m, i) => [i, m] as const))('%i', (_, m) => {
    expect(makeText(KIND[m.kind], fields(m.fields), NOW, pc.uid)).toBe(m.text)
  })
})

describe('texts are read as the PC app reads them', () => {
  it.each(pc.read.map((r, i) => [i, r] as const))('%i', (_, r) => {
    const read = detect(r.text)
    expect(read.kind).toBe(KIND[r.kind])
    expect(fields(read.fields)).toEqual(fields(r.fields))
  })
})

describe('the forms are the PC app’s', () => {
  it('lists the templates in its order', () => {
    expect(MENU).toEqual(pc.menu.map((k) => KIND[k]))
    expect(TYPES).toEqual(pc.types.map((k) => KIND[k]))
    expect([REQUIRED_NOTE, IBAN_CHECK, AMOUNT_CHECK, GS1_DOMAIN]).toEqual([pc.requiredNote, pc.ibanCheck, pc.amountCheck, pc.gs1Domain])
  })

  it.each(pc.forms.map((f) => [f.kind, f] as const))('%s', (_, f) => {
    const kind = KIND[f.kind]
    expect(templateLabel(kind)).toBe(f.label)
    expect(templateIntro(kind)).toBe(f.intro)
    expect(
      templateFields(kind).map((x) => ({ ...x, kind: x.kind, choices: x.choices ?? [] }))
    ).toEqual(f.fields.map((x) => ({ ...x, kind: FIELD_KIND[x.kind], choices: x.choices })))
    expect(fields(templateDefaults(kind))).toEqual(fields(f.defaults))
    expect(fields(templateExample(kind, new Date(2026, 10, 8, 10, 15)))).toEqual(fields(f.example))
    expect(templateFields(kind).map((x) => clearsWhenFilled(kind, x.name))).toEqual(f.clearsWhenFilled)
  })
})

describe('Save asks what the PC app asks', () => {
  it.each(pc.problems.map((p, i) => [i, p] as const))('%i', (_, p) => {
    const kind = KIND[p.kind]
    const values = fields(p.values)
    expect(templateProblems(kind, values)).toEqual(p.problems)
    expect(
      templateFields(kind).map((x) => ({ name: x.name, required: isRequired(kind, x.name, values), disabled: isDisabled(kind, x.name, values), live: liveNote(kind, x.name, values) }))
    ).toEqual(p.fields)
  })
})

describe('forms filled from text as the PC app fills them', () => {
  it.each(pc.fromText.map((r, i) => [i, r] as const))('%i', (_, r) => {
    expect(fields(formFromText(KIND[r.kind], fields(r.read)))).toEqual(fields(r.form))
  })
})

describe('what typed values become', () => {
  it('numbers', () => {
    for (const [typed, kept] of pc.typedNumbers) expect([typed, typedNumber(typed)]).toEqual([typed, kept])
  })
  it('text in each kind of field', () => {
    for (const [kind, address, typed, kept] of pc.asTyped as [string, boolean, string, string][])
      expect([kind, address, typed, asTyped({ kind: FIELD_KIND[kind], address }, typed)]).toEqual([kind, address, typed, kept])
  })
  it('amounts', () => {
    for (const [typed, ok] of pc.amounts as [string, boolean][]) expect([typed, amountOk(typed)]).toEqual([typed, ok])
  })
  it('IBANs and GTINs', () => {
    for (const [iban, ok] of pc.ibans as [string, boolean][]) expect([iban, validIban(iban)]).toEqual([iban, ok])
    for (const [gtin, problem] of pc.gtins as [string, string | null][]) expect([gtin, gtinProblem(gtin)]).toEqual([gtin, problem])
  })
  it('event times read back as local times', () => {
    for (const [value, local] of pc.localInputs) expect([value, localInput(value)]).toEqual([value, local])
  })
  it('event ids look like the PC app’s', () => {
    for (const uid of pc.uids) expect(uid).toMatch(/^[0-9a-z]{18}$/)
  })
})

describe('the checks on the typed text are the PC app’s', () => {
  it.each(pc.checks.map((c) => [JSON.stringify(c.text), c] as const))('%s', (_, c) => {
    expect(dataChecks(c.text).map((x) => [x.message, x.button, x.fixed])).toEqual(c.checks)
  })
})

describe('Recent codes names a code as the PC app does', () => {
  it.each(pc.recent.map((r) => [JSON.stringify(r.text).slice(0, 60), r] as const))('%s', (_, r) => {
    const said = describeRecent(r.text)
    expect([said.label, asCarried(said.title), said.sensitive]).toEqual([r.label, r.title, r.sensitive])
  })

  it('sizes', () => {
    for (const [bytes, text] of pc.sizes as [number, string][]) expect([bytes, sizeText(bytes)]).toEqual([bytes, text])
  })

  const big = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024 - 'data:image/png;base64,'.length + 1)
  it.each(pc.news.map((n, i) => [i, n] as const))('keeps design %i as the PC app keeps it', (_, n) => {
    const d = readDesign(n.file.split('{{BIG}}').join(big), plainDesign(''))
    const kept = newRecent(d, 1794116816196)
    expect([kept.record.key, kept.record.label, kept.record.title, kept.record.sensitive, kept.record.omitted]).toEqual([n.key, n.label, n.title, n.sensitive, n.omitted])
    expect(writeDesign(kept.design)).toBe(n.design)
  })
})
