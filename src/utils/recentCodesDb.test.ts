import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_RECENT_CODES, newRecentBarcode, newRecentQrCode } from './recentCodes'
import {
  RECENT_CODES_DB_NAME,
  addRecentCode,
  clearRecentCodes,
  closeRecentCodesDb,
  deleteRecentCode,
  getRecentCode,
  isRememberingRecentCodes,
  listRecentCodes,
  setRememberRecentCodes
} from './recentCodesDb'
import type { QRCodeConfig } from './useQRCodeStorage'

function qr(data: string, savedAt = 1, color = '#000000') {
  const config: QRCodeConfig = {
    props: { data, width: 200, height: 200, dotsOptions: { color, type: 'square' } },
    style: { borderRadius: '0px' },
    frame: null
  }
  return newRecentQrCode(config, 'data:image/png;base64,AA', savedAt)
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(RECENT_CODES_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

beforeEach(async () => {
  await closeRecentCodesDb()
  await deleteDatabase()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Recent codes storage', () => {
  it('starts empty and keeping codes', async () => {
    expect(await listRecentCodes()).toEqual({ available: true, codes: [], remember: true })
  })

  it('adds a code and reads it back, newest first', async () => {
    expect(await addRecentCode(qr('https://a.example', 1))).toMatchObject({
      status: 'saved',
      firstTime: true
    })
    expect((await addRecentCode(qr('https://b.example', 2))).firstTime).toBe(false)

    const { codes } = await listRecentCodes()
    expect(codes.map((c) => c.title)).toEqual(['https://b.example', 'https://a.example'])
    const details = await getRecentCode(codes[1].id)
    expect(details?.kind === 'qr' && details.config.props.data).toBe('https://a.example')
  })

  it('keeps one entry per data: making it again replaces the old look', async () => {
    await addRecentCode(qr('https://a.example', 1, '#000000'))
    await addRecentCode(qr('https://b.example', 2))
    await addRecentCode(qr('https://a.example', 3, '#ff0000'))

    const { codes } = await listRecentCodes()
    expect(codes.map((c) => c.title)).toEqual(['https://a.example', 'https://b.example'])
    const details = await getRecentCode(codes[0].id)
    expect(details?.kind === 'qr' && details.config.props.dotsOptions?.color).toBe('#ff0000')
  })

  it(`keeps only the newest ${MAX_RECENT_CODES}, with their details`, async () => {
    for (let i = 1; i <= MAX_RECENT_CODES + 3; i++) {
      await addRecentCode(qr(`https://example.com/${i}`, i))
    }
    const { codes } = await listRecentCodes()
    expect(codes).toHaveLength(MAX_RECENT_CODES)
    expect(codes[0].title).toBe(`https://example.com/${MAX_RECENT_CODES + 3}`)
    expect(codes.at(-1)?.title).toBe('https://example.com/4')
    // The dropped codes' details are gone too.
    expect(await getRecentCode(1)).toBeNull()
  })

  it('adds nothing while turned off, and keeps what is there', async () => {
    await addRecentCode(qr('https://a.example'))
    await setRememberRecentCodes(false)
    expect(await isRememberingRecentCodes()).toBe(false)
    expect((await addRecentCode(qr('https://b.example'))).status).toBe('off')
    const list = await listRecentCodes()
    expect(list.remember).toBe(false)
    expect(list.codes.map((c) => c.title)).toEqual(['https://a.example'])
  })

  it('deletes one code, or all of them', async () => {
    await addRecentCode(qr('https://a.example', 1))
    await addRecentCode(newRecentBarcode('code128', 'ABC', { color: '#000000' }, undefined, 2))
    const [barcode, url] = (await listRecentCodes()).codes
    expect(await deleteRecentCode(barcode.id)).toBe(true)
    expect(await getRecentCode(barcode.id)).toBeNull()
    expect((await listRecentCodes()).codes.map((c) => c.id)).toEqual([url.id])

    expect(await clearRecentCodes()).toBe(true)
    expect((await listRecentCodes()).codes).toEqual([])
  })

  it('reports a full disk, and drops no other code to make room', async () => {
    for (let i = 1; i <= MAX_RECENT_CODES; i++) {
      await addRecentCode(qr(`https://example.com/${i}`, i))
    }
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    expect(await addRecentCode(qr('https://example.com/new', 99))).toEqual({
      status: 'full',
      firstTime: false
    })
    vi.restoreAllMocks()
    expect((await listRecentCodes()).codes).toHaveLength(MAX_RECENT_CODES)
  })

  it('reports why a write failed, not the abort that followed it', async () => {
    // Firefox and Safari fail the write request itself when storage is full;
    // requests still waiting then fail with a plain AbortError. A second add
    // of the same key fails the same way (with ConstraintError).
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      const request = put.apply(this, args)
      if (this.name === 'details') this.add(args[0], args[1])
      return request
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect((await addRecentCode(qr('https://a.example'))).status).toBe('unavailable')
    expect((warn.mock.calls[0][1] as DOMException).name).toBe('ConstraintError')
  })

  it('returns the id of the code it added', async () => {
    const { id } = await addRecentCode(qr('https://a.example'))
    expect((await listRecentCodes()).codes[0].id).toBe(id)
  })

  it('opens the database again when the browser closed the connection', async () => {
    await addRecentCode(qr('https://a.example', 1))
    // Safari closes connections while a page is in the background; the next
    // transaction then throws InvalidStateError.
    const transaction = IDBDatabase.prototype.transaction
    let failed = false
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      if (!failed) {
        failed = true
        throw new DOMException('The database connection is closing.', 'InvalidStateError')
      }
      return transaction.apply(this, args)
    })
    expect((await addRecentCode(qr('https://b.example', 2))).status).toBe('saved')
    expect(failed).toBe(true)
    expect((await listRecentCodes()).codes).toHaveLength(2)
  })
})
