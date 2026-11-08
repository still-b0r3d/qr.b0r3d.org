// What the page says about a code: the level's name and what it means, the level suggested for
// this much text, the size line, and the quiet zone warning. Worded as the PC app words them.

import type { QrArt } from './art'
import { characterCount, grouped } from './code'
import { isPlainAscii } from './encoder'
import { formatted } from './numbers'
import type { QrLevel } from './tables'

export function levelName(level: QrLevel): string {
  return level === 'L' ? 'Low (7%)' : level === 'M' ? 'Medium (15%)' : level === 'Q' ? 'High (25%)' : 'Highest (30%)'
}

/** The level suggested for this much text, or null with none. */
export function suggestedLevel(text: string): QrLevel | null {
  const n = text.length
  if (n === 0) return null
  return n <= 50 ? 'H' : n <= 150 ? 'Q' : n <= 500 ? 'M' : 'L'
}

/** The hint under the error correction buttons. */
export function levelHint(level: QrLevel, text: string): string {
  const percent = level === 'L' ? 7 : level === 'M' ? 15 : level === 'Q' ? 25 : 30
  let hint = `${levelName(level)}: about ${percent}% of the code can be dirty, scratched or covered and it still scans. Higher levels make the code denser.`
  const suggested = suggestedLevel(text)
  if (suggested) {
    hint += suggested === level ? ' Suggested for this much text.' : ` Suggested for this much text: ${levelName(suggested)}.`
  }
  return hint
}

const utf8 = new TextEncoder()

/** "17 characters · 17 bytes · version 2 · 25 × 25 modules · level Q" */
export function infoLine(art: QrArt): string {
  const code = art.code
  const chars = characterCount(code.text)
  const bytes = utf8.encode(code.text).length
  return (
    `${grouped(chars)} ${chars === 1 ? 'character' : 'characters'} · ` +
    `${grouped(bytes)} ${bytes === 1 ? 'byte' : 'bytes'}${isPlainAscii(code.text) ? '' : ' (UTF-8)'} · ` +
    `version ${code.version} · ${code.size} × ${code.size} modules · level ${code.level}`
  )
}

/** The warnings under the code (for now the quiet zone's; colours join with the designer). */
export function warnings(margin: number): string[] {
  const out: string[] = []
  if (margin < 4) {
    out.push(
      `Only ${formatted(Math.max(0, margin), 2)} modules of blank space around the code. Leave at least 4 (Quiet zone), or place it on a plain light area.`
    )
  }
  return out
}
