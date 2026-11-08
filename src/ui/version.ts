// The footer's version and build: "v1.3 · Build: abc1234", the version as the PC app writes its own
// and the build (the commit it was made from) apart from it. A plain x.y.0 shows as vx.y.

export function shownVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!m) return 'v' + version
  return m[3] === '0' ? `v${m[1]}.${m[2]}` : `v${m[1]}.${m[2]}.${m[3]}`
}

/** The short commit, or "dev" for a copy built on someone's own computer. */
export function buildStamp(commit: string): string {
  return /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 7).toLowerCase() : 'dev'
}

export function versionLine(version: string, commit: string): string {
  return `b0r3d QR ${shownVersion(version)} · Build: ${buildStamp(commit)}`
}
