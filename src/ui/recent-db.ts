// Where Recent codes are kept: this site's IndexedDB database "b0r3d-qr", as the site has kept them
// before (so a visitor's codes from then are still here). "codes" holds what the list shows (its id
// counts on and never comes back), "details" what opens each code again (under the same id), and
// "meta" whether codes are being added ("remember") and whether the note about them was shown.

import { MOST, newestFirst, readRecord, type RecentDetails, type RecentRecord } from '../qr/recent'

const NAME = 'b0r3d-qr'
const VERSION = 1
/** An open that hasn't answered by then won't (some browsers hang): Recent codes can't be kept. */
const OPEN_WAIT = 8000

/** Why Recent codes can't be used just now: "unavailable" (the browser keeps nothing), "newer" (a later site's). */
export type RecentTrouble = 'unavailable' | 'newer'

export type ListedCode = RecentRecord & { id: number }

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (opening) return opening
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(NAME, VERSION)
    } catch (e) {
      reject(e)
      return
    }
    const timer = setTimeout(() => reject(new DOMException('The browser didn’t open its storage.', 'TimeoutError')), OPEN_WAIT)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('codes')) db.createObjectStore('codes', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('details')) db.createObjectStore('details')
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      const db = request.result
      // a later copy of the site, open in another tab, wants a newer shape: let it have it; and a
      // connection the browser drops (site data cleared) is opened again next time
      db.onversionchange = () => {
        db.close()
        if (opening === attempt) opening = null
      }
      db.onclose = () => {
        if (opening === attempt) opening = null
      }
      resolve(db)
    }
    request.onerror = () => {
      clearTimeout(timer)
      reject(request.error)
    }
    request.onblocked = () => {
      clearTimeout(timer)
      reject(new DOMException('blocked', 'AbortError'))
    }
  })
  opening = attempt
  attempt.catch(() => {
    if (opening === attempt) opening = null
  })
  return attempt
}

/** A transaction on the database, opened again once if its connection has gone. */
async function transaction(stores: string | string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
  const db = await open()
  try {
    return db.transaction(stores, mode)
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'InvalidStateError')) throw e
    opening = null
    return (await open()).transaction(stores, mode)
  }
}

/** Why the database can't be used, from what opening it threw. */
export function troubleOf(e: unknown): RecentTrouble {
  return e instanceof DOMException && e.name === 'VersionError' ? 'newer' : 'unavailable'
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'))
  })

const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const laterSite = (raw: unknown): boolean => typeof (raw as { v?: unknown })?.v === 'number' && (raw as { v: number }).v > 1

/** Every code that's whole and can be opened (its details are there), newest first. Throws when the database can't be opened (see troubleOf). */
export async function listCodes(): Promise<ListedCode[]> {
  const tx = await transaction(['codes', 'details'], 'readonly')
  const [all, detailIds] = await Promise.all([result(tx.objectStore('codes').getAll()), result(tx.objectStore('details').getAllKeys())])
  const opens = new Set(detailIds)
  return newestFirst(all.map(readRecord).filter((r): r is ListedCode => r !== null && opens.has(r.id)))
}

/**
 * Adds a code: the same text again (as the same kind of code) replaces the old one, and past 20 the
 * oldest go, with what opens them. Codes that aren't whole (or can't be opened) go too; a later
 * site's stay as they are. Its id.
 */
export async function addCode(record: RecentRecord, details: RecentDetails): Promise<number> {
  const tx = await transaction(['codes', 'details'], 'readwrite')
  const codes = tx.objectStore('codes')
  const more = tx.objectStore('details')
  const [all, detailIds] = await Promise.all([result(codes.getAll()), result(more.getAllKeys())])
  const opens = new Set(detailIds)
  const whole: ListedCode[] = []
  for (const raw of all) {
    if (laterSite(raw)) continue
    const r = readRecord(raw)
    const id = (raw as { id?: unknown })?.id
    if (r === null || !opens.has(r.id) || r.key === record.key) {
      if (typeof id === 'number') {
        codes.delete(id)
        more.delete(id)
      }
      continue
    }
    whole.push(r)
  }
  for (const old of newestFirst(whole).slice(MOST - 1)) {
    codes.delete(old.id)
    more.delete(old.id)
  }
  const fresh: RecentRecord = { ...record }
  delete fresh.id
  const id = (await result(codes.add(fresh))) as number
  more.put(details, id)
  await done(tx)
  return id
}

export async function deleteCode(id: number): Promise<void> {
  const tx = await transaction(['codes', 'details'], 'readwrite')
  tx.objectStore('codes').delete(id)
  tx.objectStore('details').delete(id)
  await done(tx)
}

/** Every code gone, but a later site's (the count of ids goes on). */
export async function clearCodes(): Promise<void> {
  const tx = await transaction(['codes', 'details'], 'readwrite')
  const codes = tx.objectStore('codes')
  const more = tx.objectStore('details')
  const all = await result(codes.getAll())
  const kept = new Set<IDBValidKey>()
  for (const raw of all) {
    const id = (raw as { id?: unknown })?.id
    if (typeof id !== 'number') continue
    if (laterSite(raw)) kept.add(id)
    else codes.delete(id)
  }
  for (const id of await result(more.getAllKeys())) if (!kept.has(id)) more.delete(id)
  await done(tx)
}

/** What opens a code again, or null when it's gone. */
export async function codeDetails(id: number): Promise<RecentDetails | null> {
  const tx = await transaction('details', 'readonly')
  const details = (await result(tx.objectStore('details').get(id))) as RecentDetails | undefined
  return details && typeof details === 'object' ? details : null
}

/** Whether codes are being added: yes unless turned off. */
export async function remembering(): Promise<boolean> {
  return (await meta('remember')) !== false
}

export async function setRemembering(on: boolean): Promise<void> {
  await setMeta('remember', on)
}

export async function noteShown(): Promise<boolean> {
  return (await meta('noticeShown')) === true
}

export async function setNoteShown(): Promise<void> {
  await setMeta('noticeShown', true)
}

async function meta(key: string): Promise<unknown> {
  const tx = await transaction('meta', 'readonly')
  return result(tx.objectStore('meta').get(key))
}

async function setMeta(key: string, value: unknown): Promise<void> {
  const tx = await transaction('meta', 'readwrite')
  tx.objectStore('meta').put(value, key)
  await done(tx)
}
