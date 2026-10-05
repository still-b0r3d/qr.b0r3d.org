import { afterEach, describe, expect, it, vi } from 'vitest'
import { storageGet, storageSet } from './safeStorage'

describe('safeStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads and writes like localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v)
    })
    expect(storageSet('a', '1')).toBe(true)
    expect(storageGet('a')).toBe('1')
    expect(storageGet('missing')).toBeNull()
  })

  it('carries on when the browser blocks storage or it is full', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Access is denied', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
    })
    expect(storageGet('a')).toBeNull()
    expect(storageSet('a', 'x'.repeat(10))).toBe(false)
  })
})
