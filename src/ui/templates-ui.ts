// The Data section's templates: a list that opens a template's form when one is chosen (moving
// through it with the keys opens nothing until Enter), the Edit… button, and the "Data to encode"
// window, as b0r3d QR for PC has them. What's typed in each form is kept while the page is open,
// and the text already in the Data box fills the form when it's that template.

import {
  REQUIRED_NOTE,
  TYPES,
  MENU,
  asTyped,
  clearsWhenChanged,
  clearsWhenFilled,
  formFromText,
  isDisabled,
  isRequired,
  liveNote,
  templateDefaults,
  templateExample,
  templateFields,
  templateIntro,
  templateLabel,
  templateProblems,
  typedNumber,
  type TemplateField
} from '../qr/template-forms'
import { trimmedText } from '../qr/checks'
import { detect, makeText, type Fields, type TemplateKind } from '../qr/templates'
import { h } from './dom'

let ids = 0

// ---------- the list ----------

export interface TemplatePicker {
  readonly el: HTMLElement
  /** Shows the text's template, or none. */
  show(kind: TemplateKind | null): void
}

export function makeTemplatePicker(onPick: (kind: TemplateKind) => void, onEdit: () => void): TemplatePicker {
  const listId = `template-menu-${++ids}`
  const shown = h('span', { class: 'picker-text' })
  const button = h(
    'button',
    { type: 'button', class: 'picker-button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listId, 'data-testid': 'template-picker' },
    shown
  )
  const options = MENU.map((kind) =>
    h('li', { id: `${listId}-${kind}`, role: 'option', class: 'menu-option', 'data-kind': kind, 'aria-selected': 'false' }, templateLabel(kind))
  )
  const list = h('ul', { id: listId, role: 'listbox', class: 'template-menu', tabindex: -1, 'aria-label': 'Data templates', hidden: true }, ...options)
  const edit = h('button', { type: 'button', class: 'small', title: 'Edit data template', 'aria-label': 'Edit data template', 'data-testid': 'edit-template' }, 'Edit…')
  let current: TemplateKind | null = null
  let active = 0

  function setActive(i: number): void {
    active = Math.max(0, Math.min(options.length - 1, i))
    options.forEach((o, k) => o.classList.toggle('active', k === active))
    list.setAttribute('aria-activedescendant', options[active].id)
    options[active].scrollIntoView({ block: 'nearest' })
  }

  function openList(): void {
    list.hidden = false
    button.setAttribute('aria-expanded', 'true')
    setActive(current ? MENU.indexOf(current) : 0)
    list.focus()
    document.addEventListener('pointerdown', outside, true)
  }

  function closeList(focusButton = true): void {
    list.hidden = true
    button.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside, true)
    if (focusButton) button.focus()
  }

  function outside(e: PointerEvent): void {
    if (!wrap.contains(e.target as Node)) closeList(false)
  }

  function choose(i: number): void {
    closeList()
    onPick(MENU[i])
  }

  button.addEventListener('click', () => (list.hidden ? openList() : closeList()))
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openList()
    }
  })
  list.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        setActive(active + 1)
        break
      case 'ArrowUp':
        setActive(active - 1)
        break
      case 'Home':
        setActive(0)
        break
      case 'End':
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        choose(active)
        break
      case 'Escape':
        closeList()
        break
      case 'Tab':
        closeList(false)
        return
      default:
        return
    }
    e.preventDefault()
  })
  options.forEach((o, i) => {
    o.addEventListener('click', () => choose(i))
    o.addEventListener('pointermove', () => {
      if (active !== i) setActive(i)
    })
  })
  edit.addEventListener('click', onEdit)

  const wrap = h('div', { class: 'template-picker' }, button, list)
  const el = h('div', { class: 'template-row' }, h('span', { class: 'label', id: `${listId}-label` }, 'Data templates'), h('div', { class: 'buttons' }, wrap, edit))
  button.setAttribute('aria-labelledby', `${listId}-label ${listId}-shown`)
  shown.id = `${listId}-shown`

  function show(kind: TemplateKind | null): void {
    current = kind
    shown.textContent = kind ? templateLabel(kind) : 'Select template...'
    shown.classList.toggle('dim', kind === null)
    options.forEach((o, i) => o.setAttribute('aria-selected', String(MENU[i] === kind)))
  }
  show(null)
  return { el, show }
}

// ---------- the form ----------

interface FieldUi {
  field: TemplateField
  label: HTMLElement | null
  /** whether the label shows its asterisk now (null: not drawn yet) */
  starred: boolean | null
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  note: HTMLElement
  problem: HTMLElement
}

/**
 * What a date or time box holds once something's typed in it, as the PC app reads it: the date, or
 * the date and time ("2026-11-08T14:30"), or nothing until it's a whole one.
 */
export function typedTime(kind: 'date' | 'datetime', text: string): string {
  const t = trimmedText(text)
  const m = kind === 'date' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(t) : /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return ''
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days) return ''
  const date = `${m[1]}-${m[2]}-${m[3]}`
  if (kind === 'date') return date
  const [hour, minute] = [Number(m[4]), Number(m[5])]
  return hour > 23 || minute > 59 ? '' : `${date}T${String(hour).padStart(2, '0')}:${m[5]}`
}

/** A line's words and whether it shows, changed only when they differ (so nothing is said again). */
function put(el: HTMLElement, text: string | null): void {
  if (el.textContent !== (text ?? '')) el.textContent = text ?? ''
  if (el.hidden !== (text === null)) el.hidden = text === null
}

export interface TemplateDialog {
  readonly el: HTMLDialogElement
  /** The form for `kind`, filled from `data` when it's that template; the text Save wrote, or null. */
  ask(kind: TemplateKind, data: string): Promise<string | null>
}

export function makeTemplateDialog(): TemplateDialog {
  const forms = new Map<TemplateKind, Fields>()
  const problems = new Map<string, string>()
  let kind: TemplateKind = 'text'
  let submitted = false
  let fieldsUi: FieldUi[] = []
  let answer: ((text: string | null) => void) | null = null

  const typeBox = h('select', { id: 'template-type', 'data-testid': 'template-type' }, ...TYPES.map((k) => h('option', { value: k }, templateLabel(k))))
  const intro = h('p', { class: 'hint template-intro', hidden: true })
  const fieldsBox = h('div', { class: 'template-fields' })
  const example = h('button', { type: 'button', class: 'small', title: 'Fill in this template with an example' }, 'Use example')
  const cancel = h('button', { type: 'button', class: 'small' }, 'Cancel')
  const save = h('button', { type: 'submit', class: 'small primary' }, 'Save')
  const form = h(
    'form',
    { class: 'template-form', novalidate: true },
    h('div', { class: 'dialog-head' }, h('h2', { id: 'template-title' }, 'Data to encode'), example),
    h('label', { class: 'label', for: 'template-type' }, 'Data type'),
    typeBox,
    intro,
    fieldsBox,
    h('div', { class: 'dialog-foot' }, h('p', { class: 'hint' }, REQUIRED_NOTE), h('span', { class: 'buttons' }, cancel, save))
  )
  const el = h('dialog', { class: 'template-dialog', 'aria-labelledby': 'template-title', 'data-testid': 'template-dialog' }, form)

  const values = (): Fields => forms.get(kind)!

  function finish(text: string | null): void {
    const reply = answer
    answer = null
    if (el.open) el.close()
    reply?.(text)
  }

  function showForm(k: TemplateKind): void {
    kind = k
    typeBox.value = k
    const words = templateIntro(k)
    intro.textContent = words ?? ''
    intro.hidden = words === null
    build()
    refresh()
  }

  function build(): void {
    fieldsUi = templateFields(kind).map(makeField)
    fieldsBox.classList.toggle('two-columns', kind === 'vcard')
    fieldsBox.replaceChildren(
      ...fieldsUi.map((ui) =>
        h('div', { class: 'template-field' + (ui.field.wide ? ' wide' : '') + (ui.field.kind === 'check' ? ' check' : '') }, ui.label ?? '', ui.input.closest('.check-row') ?? ui.input, ui.note, ui.problem)
      )
    )
  }

  function makeField(f: TemplateField): FieldUi {
    const id = `template-${f.name}-${++ids}`
    const value = values()[f.name] ?? ''
    const note = h('p', { class: 'hint', hidden: true, id: `${id}-note` })
    // read out with its field: Save takes the focus to the first field with a problem
    const problem = h('p', { class: 'hint bad-text', hidden: true, id: `${id}-problem`, 'data-problem': f.name })
    let input: FieldUi['input']
    let label: HTMLElement | null = h('label', { class: 'label', for: id })
    switch (f.kind) {
      case 'choice': {
        const select = h('select', { id }, ...(f.choices ?? []).map(([v, text]) => h('option', { value: v }, text)))
        select.value = (f.choices ?? []).some(([v]) => v === value) ? value : (f.choices?.[0]?.[0] ?? '')
        select.addEventListener('change', () => changed(f, select.value))
        input = select
        break
      }
      case 'check': {
        const check = h('input', { id, type: 'checkbox', checked: value === 'true' })
        check.addEventListener('change', () => changed(f, check.checked ? 'true' : 'false'))
        label = null
        h('label', { class: 'check-row', for: id }, check, ' ' + f.label)
        input = check
        break
      }
      case 'lines': {
        const box = h('textarea', { id, rows: 3, placeholder: f.placeholder, spellcheck: 'false' })
        box.value = value
        box.addEventListener('input', () => changed(f, asTyped(f, box.value)))
        input = box
        break
      }
      case 'date':
      case 'datetime': {
        const date = f.kind === 'date'
        const picker = h('input', { id, type: date ? 'date' : 'datetime-local', min: date ? '0001-01-01' : '0001-01-01T00:00', max: date ? '9999-12-31' : '9999-12-31T23:59' })
        picker.value = value
        const supported = picker.type === (date ? 'date' : 'datetime-local')
        if (supported && (value === '' || picker.value === value)) {
          picker.addEventListener('input', () => changed(f, date ? picker.value : picker.value.slice(0, 16)))
          input = picker
          break
        }
        // a browser without the picker, or a value it can't show (read from a code: a GS1 date's
        // day 00, 30 February): typed instead, as the PC app has it, so it's seen and can be changed
        const typed = h('input', { id, type: 'text', placeholder: date ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:MM', autocomplete: 'off', spellcheck: 'false' })
        typed.value = date ? value : value.replace('T', ' ')
        typed.addEventListener('input', () => changed(f, typedTime(f.kind as 'date' | 'datetime', typed.value)))
        input = typed
        break
      }
      default: {
        // (a number gets the whole keyboard: a phone's number pad has no minus on some phones)
        const mode = f.address ? (/^(address|cc|bcc|email)$/.test(f.name) ? 'email' : 'url') : null
        const box = h('input', {
          id,
          type: f.kind === 'password' ? 'password' : 'text',
          placeholder: f.placeholder || null,
          inputmode: mode,
          autocomplete: 'off',
          spellcheck: 'false',
          maxlength: f.maxLength > 0 ? f.maxLength : null
        })
        box.value = value
        box.addEventListener('input', () => changed(f, f.kind === 'number' ? typedNumber(box.value) : asTyped(f, box.value)))
        input = box
      }
    }
    input.setAttribute('aria-describedby', `${id}-problem ${id}-note`)
    if (f.kind !== 'check' && f.hint === null && f.placeholder) input.title = f.placeholder
    return { field: f, label, starred: null, input, note, problem }
  }

  function changed(f: TemplateField, value: string): void {
    values()[f.name] = value
    unflag(f.name, value)
    refresh()
  }

  /** A message goes once its field is filled in; the IBAN's and the amount's as soon as it changes. */
  function unflag(name: string, value: string): void {
    const message = problems.get(name)
    if (submitted && message !== undefined && ((value.length > 0 && clearsWhenFilled(kind, name)) || clearsWhenChanged(message))) problems.delete(name)
    if (kind === 'epc' && name === 'version' && value !== '001') problems.delete('bic')
  }

  /** The asterisks, the fields that are off, and the lines under the fields. */
  function refresh(): void {
    const v = values()
    for (const ui of fieldsUi) {
      const name = ui.field.name
      const required = isRequired(kind, name, v)
      if (ui.label && ui.starred !== required) {
        ui.starred = required
        ui.label.replaceChildren(ui.field.label, ...(required ? [h('span', { class: 'star', 'aria-hidden': 'true' }, ' *')] : []))
      }
      ui.input.required = required
      ui.input.disabled = isDisabled(kind, name, v)
      const live = liveNote(kind, name, v)
      let red = problems.get(name) ?? null
      if (name === 'gtin') red = live ?? red
      else if (name === 'iban' && red === null) red = live
      const dim = name === 'encryption' ? live : name === 'gtin' && red !== null ? null : ui.field.hint
      put(ui.problem, red)
      ui.input.setAttribute('aria-invalid', String(red !== null && problems.has(name)))
      put(ui.note, dim)
    }
  }

  typeBox.addEventListener('change', () => {
    submitted = false // a new template starts with no messages
    problems.clear()
    showForm(typeBox.value as TemplateKind)
  })

  example.addEventListener('click', () => {
    // the fields filled in lose their messages, as they would being typed in
    const v = values()
    for (const [name, value] of Object.entries(templateExample(kind))) {
      const was = v[name]
      v[name] = value
      if (was !== value) unflag(name, value)
    }
    showForm(kind)
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    submitted = true
    problems.clear()
    for (const [name, message] of templateProblems(kind, values())) problems.set(name, message)
    refresh()
    const first = fieldsUi.find((ui) => problems.has(ui.field.name))
    if (first) {
      first.input.focus()
      return
    }
    finish(makeText(kind, values()))
  })
  cancel.addEventListener('click', () => finish(null))
  el.addEventListener('close', () => finish(null))

  return {
    el,
    ask(start: TemplateKind, data: string): Promise<string | null> {
      for (const k of TYPES) if (!forms.has(k)) forms.set(k, templateDefaults(k))
      // the form is filled from the data only when the data is that template
      if (data.length > 0) {
        const read = detect(data)
        if (read.kind === start) forms.set(start, formFromText(start, read.fields))
      }
      submitted = false
      problems.clear()
      showForm(start)
      return new Promise((resolve) => {
        answer = resolve
        el.showModal()
        ;(fieldsUi[0]?.input ?? typeBox).focus()
      })
    }
  }
}
