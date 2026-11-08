// Recent codes on the page: the codes saved or copied are added (while that's on), the first time
// with a note that says where they went and offers to stop; the window lists them newest first,
// each with a picture (none for a Wi-Fi network with its password), to open again or delete, with
// the switch that adds them and Clear all, which takes a second, separate click. As b0r3d QR for PC
// has them, kept in this browser.

import { QrArt } from '../qr/art'
import type { BarcodeLook, BarcodeSvg } from '../qr/barcode-svg'
import type { BarcodeType } from '../qr/barcodes'
import type { QrDesign } from '../qr/design'
import { DesignFileError, readDesign } from '../qr/design-file'
import { paint } from '../qr/export'
import { keptBarcode, MOST, newRecent, newRecentBarcode, recentName, sizeText, type RecentDetails, type RecentRecord } from '../qr/recent'
import { h } from './dom'
import { lockIcon } from './icons'
import {
  addCode,
  clearCodes,
  codeDetails,
  deleteCode,
  listCodes,
  noteShown,
  remembering,
  setNoteShown,
  setRemembering,
  troubleOf,
  type ListedCode,
  type RecentTrouble
} from './recent-db'

export interface RecentHost {
  /** A design from Recent codes, its text exactly as it was, into the page. */
  open(design: QrDesign): void
  /** A barcode from Recent codes: its type, its text exactly as it was, and its settings as kept. */
  openBarcode(type: BarcodeType, text: string, settings: unknown): void
  /** The design the page has now (opened codes are read on top of it). */
  current(): QrDesign
  /** A short note under the code; `after` keeps what the note said before it. */
  say(text: string, kind: 'good' | 'warn' | 'bad', after?: boolean): void
}

export interface Recent {
  readonly button: HTMLButtonElement
  readonly note: HTMLElement
  readonly dialog: HTMLDialogElement
  /** Adds a code just saved or copied (`art` is it drawn, for its picture), while that's on. */
  remember(design: QrDesign, art: QrArt | null): Promise<void>
  /** Adds a barcode just saved or copied: its type, text and settings, and it drawn for its picture. */
  rememberBarcode(type: BarcodeType, text: string, look: BarcodeLook, barcode: BarcodeSvg | null): Promise<void>
}

const THUMBNAIL = 160
const NOTE_TEXT = 'Added to Recent codes, so you can open it again later. It is kept only in this browser and never sent anywhere.'
const FOOTNOTE =
  'Kept only in this browser and never sent anywhere. Opening a code here shows everything in it, Wi-Fi passwords included. The browser can delete these: when site data is cleared, when a private window closes, or (in Safari) after some days without a visit. Download anything you need to keep.'

/** The code drawn small, as the list's picture of it (a PNG data: URL), or nothing when it can't be read back. */
function thumbnail(art: QrArt): string | undefined {
  const k = THUMBNAIL / Math.max(art.W, art.H)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(art.W * k))
  canvas.height = Math.max(1, Math.ceil(art.H * k))
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    paint(ctx, art, k, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  } finally {
    canvas.width = canvas.height = 0
  }
}

export function makeRecent(host: RecentHost): Recent {
  // ---------- adding ----------

  let lastFailed = false
  let offForNow = false // turned off, though the browser wouldn't keep that for next time
  let noteCode = 0 // the code the note is about (0: none, or it's gone)
  let noteKey = ''
  let noteDone = false // the note has been shown on this page

  const noteProblem = h('p', { class: 'hint bad-text', hidden: true })
  const stop = h('button', { type: 'button', class: 'small' }, "Don't keep codes")
  const view = h('button', { type: 'button', class: 'small' }, 'View')
  const ok = h('button', { type: 'button', class: 'small' }, 'OK')
  const noteBox = h('div', { class: 'recent-note', hidden: true, 'data-testid': 'recent-note' }, h('p', null, NOTE_TEXT), noteProblem, h('div', { class: 'buttons' }, stop, view, ok))
  // what screen readers say when the note comes up (a live region that's always on the page)
  const noteSaid = h('p', { class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'recent-note-said' })
  const note = h('div', { class: 'recent-note-wrap' }, noteSaid, noteBox)

  async function remember(design: QrDesign, art: QrArt | null): Promise<void> {
    if (offForNow || design.data.trim().length === 0) return
    // taken now, as it was saved, before anything can change it
    const kept = newRecent(design, Date.now())
    if (!kept.record.sensitive && art) {
      // drawn from what's kept (without a picture too big to keep), not from the page's design,
      // which may have changed since
      const drawn = keptArt(kept.design, art)
      const picture = drawn ? thumbnail(drawn) : undefined
      if (picture) {
        kept.record.thumbnail = picture
        kept.record.size += picture.length
      }
    }
    await keep(kept.record, kept.details)
  }

  async function rememberBarcode(type: BarcodeType, text: string, look: BarcodeLook, barcode: BarcodeSvg | null): Promise<void> {
    if (offForNow) return
    const kept = newRecentBarcode(type, text, look, barcode, Date.now())
    await keep(kept.record, kept.details)
  }

  async function keep(record: RecentRecord, details: RecentDetails): Promise<void> {
    try {
      if (!(await remembering())) return
    } catch (e) {
      // a newer site's codes are left alone, and said so; a browser that keeps nothing is said in the window
      if (troubleOf(e) === 'newer') host.say('Not added to Recent codes: the ones in this browser were kept by a newer b0r3d QR.', 'warn', true)
      return
    }
    let id: number
    try {
      id = await addCode(record, details)
    } catch {
      lastFailed = true
      host.say("Not added to Recent codes: the browser couldn't store it (it may be out of room for this site).", 'warn', true)
      return
    }
    lastFailed = false
    // the same code saved again while the note is up: the note is about it now
    if (!noteBox.hidden && record.key === noteKey) noteCode = id
    if (noteDone) return
    let shownBefore = false
    try {
      shownBefore = await noteShown()
    } catch {
      // shown all the same
    }
    if (shownBefore) return
    noteDone = true
    try {
      await setNoteShown()
    } catch {
      // shown all the same, once on this page
    }
    noteCode = id
    noteKey = record.key
    noteProblem.hidden = true
    noteBox.hidden = false
    noteSaid.textContent = ''
    requestAnimationFrame(() => (noteSaid.textContent = NOTE_TEXT))
  }

  /** The note goes, and the keys go on from the Recent codes button (when it's on show). */
  function hideNote(): void {
    if (noteBox.contains(document.activeElement) && button.offsetParent !== null) button.focus()
    noteBox.hidden = true
  }

  function keptArt(design: QrDesign, art: QrArt): QrArt | null {
    try {
      const p = art.pictures
      return new QrArt(design, { ...p, logo: design.logo ? p.logo : null, frame: design.frame?.backgroundImage ? p.frame : null })
    } catch {
      return null
    }
  }

  stop.addEventListener('click', async () => {
    offForNow = true
    let stopped = true
    try {
      await setRemembering(false)
    } catch {
      stopped = false
    }
    let deleted = noteCode === 0
    if (!deleted) {
      try {
        await deleteCode(noteCode)
        deleted = true
        noteCode = 0
      } catch {
        deleted = false
      }
    }
    if (stopped) offForNow = false
    if (stopped && deleted) {
      hideNote()
      return
    }
    noteProblem.textContent = stopped
      ? "No more codes will be added, but this one couldn't be deleted. Open Recent codes to delete it."
      : deleted
        ? "No more codes will be added while this page is open, but the browser didn't keep the setting for next time."
        : "No more codes will be added while this page is open, but the browser didn't keep the setting for next time, and this code couldn't be deleted. Open Recent codes to delete it."
    noteProblem.hidden = false
  })
  view.addEventListener('click', () => {
    // (the window gives the keys back to the Recent codes button when it closes)
    hideNote()
    void openWindow()
  })
  ok.addEventListener('click', hideNote)

  // ---------- the window ----------

  const button = h('button', { type: 'button', 'data-testid': 'recent-codes' }, 'Recent codes…')
  const problem = h('p', { class: 'hint bad-text', hidden: true, role: 'alert' })
  const empty = h('p', { class: 'hint recent-empty', hidden: true, tabindex: -1 })
  const list = h('ul', { class: 'recent-list', 'aria-label': 'Recent codes' })
  const status = h('p', { class: 'hint recent-status', 'aria-live': 'polite' })
  const rememberBox = h('input', { type: 'checkbox', id: 'recent-remember' })
  const count = h('span', { class: 'hint recent-count' })
  const cancelClear = h('button', { type: 'button', class: 'small', hidden: true }, 'Cancel')
  const clear = h('button', { type: 'button', class: 'small', 'data-testid': 'recent-clear' }, 'Clear all')
  const close = h('button', { type: 'button', class: 'small' }, 'Close')
  const dialog = h(
    'dialog',
    { class: 'recent-dialog', 'aria-labelledby': 'recent-title', 'data-testid': 'recent-dialog' },
    h('div', { class: 'dialog-head' }, h('h2', { id: 'recent-title' }, 'Recent codes')),
    problem,
    empty,
    list,
    h(
      'div',
      { class: 'recent-foot' },
      status,
      h('label', { class: 'check-row', for: 'recent-remember' }, rememberBox, ' Add codes I save or copy'),
      h('p', { class: 'hint' }, FOOTNOTE),
      h('div', { class: 'recent-bottom' }, count, h('span', { class: 'buttons' }, cancelClear, clear, close))
    )
  )

  let codes: ListedCode[] = []
  let confirming = false
  let armedAt = 0
  let trouble: RecentTrouble | null = null
  let on = true

  async function refresh(): Promise<void> {
    try {
      codes = await listCodes()
      on = !offForNow && (await remembering())
      trouble = null
    } catch (e) {
      codes = []
      trouble = troubleOf(e)
    }
    let says: string | null = null
    if (trouble === 'unavailable') says = "Recent codes can't be kept here: this browser doesn't let the page store anything (a private window, or site data turned off)."
    else if (trouble === 'newer') says = 'Recent codes here were kept by a newer b0r3d QR, so this page leaves them as they are.'
    else if (lastFailed) says = "The last code couldn't be kept: the browser is out of room for this site. Delete some codes, or clear this site's data."
    problem.textContent = says ?? ''
    problem.hidden = says === null
    empty.textContent = on ? 'Codes you save or copy will appear here.' : 'No codes are being added. Turn it on below to keep the codes you make.'
    empty.hidden = !(codes.length === 0 && trouble === null)
    list.replaceChildren(...codes.map(row))
    rememberBox.checked = on
    rememberBox.disabled = trouble !== null
    const total = codes.reduce((sum, c) => sum + c.size, 0)
    count.textContent = codes.length > 0 ? `${codes.length} of ${MOST} codes, about ${sizeText(total)}` : ''
    clear.hidden = codes.length === 0
    if (codes.length === 0) confirming = false
    showConfirm()
  }

  function row(code: ListedCode): HTMLElement {
    const name = recentName(code)
    const picture = h('div', { class: 'recent-picture' })
    if (code.sensitive) picture.append(lockIcon())
    else if (code.thumbnail) picture.append(h('img', { src: code.thumbnail, alt: '', width: 56, height: 56 }))
    // the short date and time, as the PC app writes them ("11/8/2026 2:04 PM" in the US)
    const at = new Date(code.savedAt)
    const when =
      at.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }) +
      ' ' +
      at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) +
      (code.sensitive ? ' · picture and password hidden' : '')
    const words = h('div', { class: 'recent-words' }, h('strong', null, name), h('span', { class: 'hint' }, when))
    if (code.omitted.length > 0)
      words.append(
        h(
          'span',
          { class: 'hint warn-text' },
          code.omitted.includes('logo') ? 'The logo was too large to keep; add it again after opening.' : 'The frame background was too large to keep; add it again after opening.'
        )
      )
    const openButton = h('button', { type: 'button', class: 'small', 'aria-label': `Open ${name}` }, 'Open')
    const deleteButton = h('button', { type: 'button', class: 'small', 'aria-label': `Delete ${name}` }, 'Delete')
    openButton.addEventListener('click', () => void openCode(code))
    deleteButton.addEventListener('click', () => void remove(code))
    return h('li', { class: 'recent-row', 'data-id': code.id }, picture, words, h('span', { class: 'buttons' }, openButton, deleteButton))
  }

  async function openCode(code: ListedCode): Promise<void> {
    confirming = false
    showConfirm()
    let details = null
    try {
      details = await codeDetails(code.id)
    } catch {
      // the database went away: the code isn't here to open
    }
    if (details?.kind === 'barcode') {
      const barcode = keptBarcode(details)
      if (!barcode) {
        status.textContent = "That code can't be opened: it's a kind of barcode this page doesn't make."
        return
      }
      host.openBarcode(barcode.type, barcode.text, details.settings)
      dialog.close()
      host.say('Opened from Recent codes', 'good')
      return
    }
    if (details?.kind === 'qr' && details.config && typeof details.config === 'object') {
      try {
        host.open(readDesign(JSON.stringify(details.config), host.current()))
        dialog.close()
        host.say('Opened from Recent codes', 'good')
        return
      } catch (e) {
        status.textContent = e instanceof DesignFileError ? `That code can't be opened: ${e.message}` : "That code can't be opened."
        return
      }
    }
    status.textContent = "That code isn't here any more. It may have been deleted in another tab."
    await refresh()
  }

  async function remove(code: ListedCode): Promise<void> {
    confirming = false
    const index = codes.findIndex((c) => c.id === code.id)
    try {
      await deleteCode(code.id)
      lastFailed = false
      status.textContent = `Deleted ${recentName(code)}.`
    } catch {
      status.textContent = "Couldn't delete it. Try again."
    }
    await refresh()
    // the next code's Open button, or the line that says there are none
    const next = list.children[Math.max(0, Math.min(index, codes.length - 1))]?.querySelector('button')
    if (next) next.focus()
    else empty.focus()
  }

  /** The first click asks; the second, a separate click at least half a second later, deletes them all. */
  async function clearAll(): Promise<void> {
    if (!confirming) {
      confirming = true
      armedAt = performance.now()
      showConfirm()
      return
    }
    if (performance.now() - armedAt < 500) return
    confirming = false
    try {
      await clearCodes()
      lastFailed = false
      status.textContent = 'All recent codes deleted.'
    } catch {
      status.textContent = "Couldn't delete them. Try again."
    }
    await refresh()
    empty.focus()
  }

  function showConfirm(): void {
    clear.textContent = !confirming ? 'Clear all' : codes.length === 1 ? 'Delete the 1 code' : `Delete all ${codes.length} codes`
    clear.classList.toggle('danger', confirming)
    cancelClear.hidden = !confirming
  }

  clear.addEventListener('click', () => void clearAll())
  // a key held down clicks again and again: only a fresh press counts
  clear.addEventListener('keydown', (e) => {
    if (e.repeat) e.preventDefault()
  })
  cancelClear.addEventListener('click', () => {
    confirming = false
    showConfirm()
    clear.focus()
  })
  close.addEventListener('click', () => dialog.close())
  rememberBox.addEventListener('change', async () => {
    const want = rememberBox.checked
    try {
      await setRemembering(want)
      offForNow = false
      if (!want) lastFailed = false
      status.textContent = want ? 'New codes will be added here.' : "New codes won't be added. The ones above stay until you delete them."
    } catch {
      if (!want) {
        offForNow = true
        lastFailed = false
        status.textContent = "New codes won't be added while this page is open, but the browser didn't keep the setting for next time."
      } else {
        rememberBox.checked = false
        status.textContent = "Couldn't change this setting. Try again."
        return
      }
    }
    await refresh()
  })

  async function openWindow(): Promise<void> {
    confirming = false
    status.textContent = ''
    // open at once (a slow or stuck browser storage shows as an empty list until it answers)
    if (!dialog.open) dialog.showModal()
    await refresh()
  }
  button.addEventListener('click', () => void openWindow())

  return { button, note, dialog, remember, rememberBarcode }
}
