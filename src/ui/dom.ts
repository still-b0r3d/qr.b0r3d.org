// A tiny element builder. No style attributes on purpose: the Content-Security-Policy blocks them,
// so sizes and colours that change go through el.style.

type Child = Node | string | null | undefined | false
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'style') throw new Error('Use el.style, not a style attribute')
    if (typeof value === 'function') el.addEventListener(key.replace(/^on/, ''), value)
    else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, String(value))
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    el.append(child)
  }
  return el
}

/** A fold-out section of settings, open or closed to start with. */
export function section(title: string, open: boolean, ...content: (Child | Child[])[]): HTMLDetailsElement {
  return h(
    'details',
    { class: 'sec', open },
    h('summary', null, h('span', { class: 'sec-title' }, title)),
    h('div', { class: 'sec-body' }, ...content)
  )
}

/** A set of buttons where one is chosen (aria-pressed). */
export function segmented<T extends string>(
  label: string,
  options: readonly { value: T; text: string; name: string }[],
  onPick: (value: T) => void
): { el: HTMLElement; set: (value: T) => void } {
  const buttons = new Map<T, HTMLButtonElement>()
  const group = h('div', { class: 'seg', role: 'group', 'aria-label': label })
  for (const o of options) {
    const b = h('button', { type: 'button', 'data-value': o.value, 'aria-label': o.name, onclick: () => onPick(o.value) }, o.text)
    buttons.set(o.value, b)
    group.append(b)
  }
  return {
    el: group,
    set(value) {
      for (const [v, b] of buttons) b.setAttribute('aria-pressed', String(v === value))
    }
  }
}
