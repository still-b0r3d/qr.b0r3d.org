/**
 * Where recent codes are kept: IndexedDB in this browser. Nothing is sent
 * anywhere.
 *
 * Not localStorage: that holds about 5 million characters per site, and the
 * current settings (logo included) already live there, so a few codes with
 * logos would fill it and settings would stop being saved. IndexedDB allows
 * hundreds of MB or more.
 *
 * Three stores: `codes` holds what the list shows (with a small picture),
 * `details` the full settings, read only when a code is opened (so listing
 * 20 codes doesn't load 20 logos), and `meta` whether to keep adding codes.
 * Every change is a single transaction, so two quick exports or two tabs
 * can't interleave.
 *
 * The database is opened only when a code is added or the list is opened.
 * Failures (storage blocked, a full disk, Safari dropping the connection
 * while the page is in the background) come back as a status, never as an
 * exception, so exports keep working whatever happens here.
 */
import {
  MAX_RECENT_CODES,
  readRecentDetails,
  type NewRecentCode,
  type RecentCodeDetails,
  type RecentCodeSummary
} from './recentCodes'
import { isLocalStorageEnabled } from './useQRCodeStorage'

export const RECENT_CODES_DB_NAME = 'b0r3d-qr'
// Never raised: records carry their own format version (`v`), so a tab still
// running an older build can't block this one with a version change.
const DB_VERSION = 1
const CODES = 'codes'
const DETAILS = 'details'
const META = 'meta'
const STORES = [CODES, DETAILS, META]
const REMEMBER_KEY = 'remember'
const NOTICE_KEY = 'noticeShown'
const OPEN_TIMEOUT_MS = 3000

export type AddStatus = 'saved' | 'off' | 'full' | 'unavailable'

export interface RecentCodesList {
  available: boolean
  codes: RecentCodeSummary[]
  /** Whether new codes are being added. */
  remember: boolean
}

/** Off when the site is built with VITE_DISABLE_LOCAL_STORAGE, or there is no IndexedDB. */
export function isRecentCodesSupported(): boolean {
  if (!isLocalStorageEnabled()) return false
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    // Reading indexedDB throws when the browser blocks site data.
    return false
  }
}

let opening: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening
  const attempt: Promise<IDBDatabase> = new Promise((resolve, reject) => {
    let settled = false
    // Some Safari versions never answer an open request; don't wait forever.
    const timer = setTimeout(() => {
      settled = true
      reject(new DOMException('Opening browser storage timed out', 'TimeoutError'))
    }, OPEN_TIMEOUT_MS)
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(RECENT_CODES_DB_NAME, DB_VERSION)
    } catch (err) {
      clearTimeout(timer)
      reject(err)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CODES)) {
        db.createObjectStore(CODES, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(DETAILS)) db.createObjectStore(DETAILS)
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    request.onsuccess = () => {
      const db = request.result
      if (settled) {
        db.close()
        return
      }
      settled = true
      clearTimeout(timer)
      const forget = () => {
        if (opening === attempt) opening = null
      }
      db.onversionchange = () => {
        db.close()
        forget()
      }
      db.onclose = forget
      resolve(db)
    }
    request.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(request.error)
    }
  })
  opening = attempt
  attempt.catch(() => {
    if (opening === attempt) opening = null
  })
  return attempt
}

/** Closes the connection; the next call opens it again. For tests. */
export async function closeRecentCodesDb(): Promise<void> {
  const current = opening
  opening = null
  if (current) (await current.catch(() => null))?.close()
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'))
  })
}

async function inTransaction<T>(
  mode: IDBTransactionMode,
  work: (stores: {
    codes: IDBObjectStore
    details: IDBObjectStore
    meta: IDBObjectStore
  }) => Promise<T>
): Promise<T> {
  for (let retry = 0; ; retry++) {
    const db = await openDatabase()
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORES, mode)
    } catch (err) {
      // The connection was closed under us (Safari does this in the
      // background): open a new one and try once more.
      if (retry === 0 && (err as DOMException)?.name === 'InvalidStateError') {
        opening = null
        continue
      }
      throw err
    }
    const done = finished(tx)
    let value: T
    try {
      value = await work({
        codes: tx.objectStore(CODES),
        details: tx.objectStore(DETAILS),
        meta: tx.objectStore(META)
      })
    } catch (err) {
      try {
        tx.abort()
      } catch {
        // Already finished or aborted.
      }
      await done.catch(() => undefined)
      throw err
    }
    await done
    return value
  }
}

function isQuotaError(err: unknown): boolean {
  return (err as DOMException)?.name === 'QuotaExceededError'
}

const newestFirst = (a: RecentCodeSummary, b: RecentCodeSummary) =>
  b.savedAt - a.savedAt || b.id - a.id

function isSummary(value: unknown): value is RecentCodeSummary {
  const s = value as RecentCodeSummary
  return (
    !!s &&
    s.v === 1 &&
    typeof s.id === 'number' &&
    typeof s.key === 'string' &&
    typeof s.savedAt === 'number'
  )
}

/** Drops all but the newest `keep` codes. */
function trimTo(
  codes: IDBObjectStore,
  details: IDBObjectStore,
  all: RecentCodeSummary[],
  keep: number
): void {
  for (const old of [...all].sort(newestFirst).slice(keep)) {
    codes.delete(old.id)
    details.delete(old.id)
  }
}

/**
 * Adds a code, replacing an earlier one with the same data, and drops the
 * oldest beyond MAX_RECENT_CODES. `firstTime` is true the first time a code
 * is added in this browser, so the app can say where it went.
 */
export async function addRecentCode(
  code: NewRecentCode
): Promise<{ status: AddStatus; firstTime: boolean }> {
  if (!isRecentCodesSupported()) return { status: 'unavailable', firstTime: false }
  const save = () =>
    inTransaction('readwrite', async ({ codes, details, meta }) => {
      if ((await result(meta.get(REMEMBER_KEY))) === false) {
        return { status: 'off' as const, firstTime: false }
      }
      const all = (await result(codes.getAll())).filter(isSummary)
      const others: RecentCodeSummary[] = []
      for (const old of all) {
        if (old.key === code.summary.key) {
          codes.delete(old.id)
          details.delete(old.id)
        } else {
          others.push(old)
        }
      }
      const id = await result(codes.add(code.summary))
      details.put(code.details, id)
      trimTo(codes, details, others, MAX_RECENT_CODES - 1)
      const firstTime = (await result(meta.get(NOTICE_KEY))) !== true
      if (firstTime) meta.put(true, NOTICE_KEY)
      return { status: 'saved' as const, firstTime }
    })

  try {
    return await save()
  } catch (err) {
    if (!isQuotaError(err)) {
      console.warn("Couldn't add the code to Recent codes:", err)
      return { status: 'unavailable', firstTime: false }
    }
  }
  // Storage is full: make room by dropping the older half, then try once more.
  try {
    await inTransaction('readwrite', async ({ codes, details }) => {
      const all = (await result(codes.getAll())).filter(isSummary)
      trimTo(codes, details, all, Math.floor(MAX_RECENT_CODES / 2))
    })
    return await save()
  } catch (err) {
    console.warn("Couldn't add the code to Recent codes:", err)
    return { status: isQuotaError(err) ? 'full' : 'unavailable', firstTime: false }
  }
}

export async function listRecentCodes(): Promise<RecentCodesList> {
  if (!isRecentCodesSupported()) return { available: false, codes: [], remember: false }
  try {
    return await inTransaction('readonly', async ({ codes, meta }) => {
      const all = (await result(codes.getAll())).filter(isSummary)
      const remember = (await result(meta.get(REMEMBER_KEY))) !== false
      return { available: true, codes: all.sort(newestFirst), remember }
    })
  } catch (err) {
    console.warn("Couldn't read Recent codes:", err)
    return { available: false, codes: [], remember: false }
  }
}

/** Whether new codes are being added; false when unavailable. */
export async function isRememberingRecentCodes(): Promise<boolean> {
  if (!isRecentCodesSupported()) return false
  try {
    return await inTransaction(
      'readonly',
      async ({ meta }) => (await result(meta.get(REMEMBER_KEY))) !== false
    )
  } catch {
    return false
  }
}

/** The full settings of a code, checked like a loaded file; null if gone or unusable. */
export async function getRecentCode(id: number): Promise<RecentCodeDetails | null> {
  if (!isRecentCodesSupported()) return null
  try {
    return await inTransaction('readonly', async ({ details }) =>
      readRecentDetails(await result(details.get(id)))
    )
  } catch (err) {
    console.warn("Couldn't read the code from Recent codes:", err)
    return null
  }
}

export async function deleteRecentCode(id: number): Promise<boolean> {
  if (!isRecentCodesSupported()) return false
  try {
    await inTransaction('readwrite', async ({ codes, details }) => {
      codes.delete(id)
      details.delete(id)
    })
    return true
  } catch (err) {
    console.warn("Couldn't delete the code from Recent codes:", err)
    return false
  }
}

export async function clearRecentCodes(): Promise<boolean> {
  if (!isRecentCodesSupported()) return false
  try {
    await inTransaction('readwrite', async ({ codes, details }) => {
      codes.clear()
      details.clear()
    })
    return true
  } catch (err) {
    console.warn("Couldn't clear Recent codes:", err)
    return false
  }
}

export async function setRememberRecentCodes(remember: boolean): Promise<boolean> {
  if (!isRecentCodesSupported()) return false
  try {
    await inTransaction('readwrite', async ({ meta }) => {
      meta.put(remember, REMEMBER_KEY)
    })
    return true
  } catch (err) {
    console.warn("Couldn't change the Recent codes setting:", err)
    return false
  }
}
