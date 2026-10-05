/**
 * Checks on the text going into a code, each with a fix the UI can offer.
 */

// A web address typed without a scheme ("b0r3d.org/page", "www.example.com").
// Phone cameras usually show those as plain text instead of opening them.
const BARE_DOMAIN =
  /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#]\S*)?$/i
// A scheme such as "https:" or "mailto:", but not a host followed by a port.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d{1,5}(?:[/?#]|$))/i

/** True for a lone web address without "https://" or any other scheme. */
export function isBareDomain(text: string): boolean {
  const t = text.trim()
  return t !== '' && !/\s/.test(t) && !HAS_SCHEME.test(t) && BARE_DOMAIN.test(t)
}

export function addHttps(text: string): string {
  return `https://${text.trim()}`
}

// Query parameters that only exist to track clicks. Kept deliberately to
// well-known names so a real parameter is never removed.
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'srsltid'
])
// "si" is a share-tracking id on these sites only; elsewhere it may be real.
const SI_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/i

function isTrackingParam(name: string, host: string): boolean {
  const n = name.toLowerCase()
  return n.startsWith('utm_') || TRACKING_PARAMS.has(n) || (n === 'si' && SI_HOSTS.test(host))
}

interface SplitUrl {
  base: string
  query: string | null
  fragment: string
  host: string
}

function splitHttpUrl(text: string): SplitUrl | null {
  const m = /^(https?:\/\/([^/?#\s]*)[^?#\s]*)(?:\?([^#\s]*))?(#\S*)?$/i.exec(text.trim())
  if (!m) return null
  const host = m[2].replace(/^[^@]*@/, '').replace(/:\d+$/, '')
  return { base: m[1], query: m[3] ?? null, fragment: m[4] ?? '', host }
}

function paramName(pair: string): string {
  const raw = pair.split('=')[0]
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    return raw
  }
}

/** Names of tracking parameters in an http(s) link, in order of appearance. */
export function findTrackingParams(text: string): string[] {
  const url = splitHttpUrl(text)
  if (!url?.query) return []
  const names = url.query
    .split('&')
    .filter(Boolean)
    .map(paramName)
    .filter((name) => isTrackingParam(name, url.host))
  return [...new Set(names)]
}

/**
 * Removes tracking parameters from an http(s) link. Everything else (other
 * parameters, their order and encoding, the fragment) is left exactly as is.
 */
export function stripTrackingParams(text: string): string {
  const url = splitHttpUrl(text)
  if (!url || url.query === null) return text
  const kept = url.query
    .split('&')
    .filter((pair) => pair && !isTrackingParam(paramName(pair), url.host))
  return url.base + (kept.length ? `?${kept.join('&')}` : '') + url.fragment
}

/** True when the text starts or ends with spaces, tabs or line breaks. */
export function hasOuterWhitespace(text: string): boolean {
  return text !== text.trim()
}

export type DataCheck =
  | { key: 'bareDomain'; fixed: string }
  | { key: 'trackingParams'; params: string[]; fixed: string }
  | { key: 'outerWhitespace'; fixed: string }

/** Everything worth flagging about the text, each with its suggested fix. */
export function getDataChecks(text: string): DataCheck[] {
  const checks: DataCheck[] = []
  if (!text) return checks
  if (hasOuterWhitespace(text) && text.trim() !== '') {
    checks.push({ key: 'outerWhitespace', fixed: text.trim() })
  }
  if (isBareDomain(text)) {
    checks.push({ key: 'bareDomain', fixed: addHttps(text) })
  }
  const params = findTrackingParams(text)
  if (params.length) {
    checks.push({ key: 'trackingParams', params, fixed: stripTrackingParams(text) })
  }
  return checks
}
