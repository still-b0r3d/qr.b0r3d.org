/**
 * localStorage that never throws. Reading it throws when the browser blocks
 * site data, and writing throws when it is full (a large logo can fill it);
 * either way the app keeps working, just without remembering this setting.
 */

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Returns false when the value couldn't be stored. */
export function storageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    console.warn(`Couldn't save "${key}" in this browser:`, err)
    return false
  }
}
