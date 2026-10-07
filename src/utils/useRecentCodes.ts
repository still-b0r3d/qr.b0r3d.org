import { reactive } from 'vue'
import type { NewRecentCode } from './recentCodes'
import { addRecentCode, isRecentCodesSupported, isRememberingRecentCodes } from './recentCodesDb'

/** Shared by both editors, the Recent codes list and the first-time note. */
export const recentCodesState = reactive({
  /** Goes up whenever a code is added, so an open list can refresh. */
  changes: 0,
  /** The note saying where codes go, shown after the first one is added. */
  showNotice: false,
  /** The code that note is about, so "Don't keep codes" can delete it. */
  noticeCodeId: undefined as number | undefined,
  /** The phone export sheet is open; the note waits until it closes. */
  exportSheetOpen: false,
  /** The last code couldn't be kept because storage for this site is full. */
  storageFull: false
})

/**
 * Adds a code to Recent codes after it was downloaded, copied or saved.
 * Call it without awaiting: it never throws, and `make` (which may render a
 * thumbnail) only runs when codes are being kept.
 */
export async function recordRecentCode(
  make: () => NewRecentCode | Promise<NewRecentCode>
): Promise<void> {
  if (!isRecentCodesSupported()) return
  try {
    if (!(await isRememberingRecentCodes())) return
    const { status, firstTime, id } = await addRecentCode(await make())
    recentCodesState.storageFull = status === 'full'
    if (status === 'saved') {
      recentCodesState.changes++
      if (firstTime) {
        recentCodesState.noticeCodeId = id
        recentCodesState.showNotice = true
      }
    }
  } catch (err) {
    console.warn("Couldn't add the code to Recent codes:", err)
  }
}

const appliedRestores = new Set<number>()

/**
 * True the first time it sees `id`. The barcode view is created again each
 * time it is shown, and must apply an opened code's settings only once, or it
 * would keep resetting colours the user changed since.
 */
export function takeRestore(id: number): boolean {
  if (appliedRestores.has(id)) return false
  appliedRestores.add(id)
  return true
}
