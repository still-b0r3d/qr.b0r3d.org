// The caption fonts. The 18 web fonts come with the site and are drawn on canvases by their own
// files, so PNG, JPG and PDF files show the real font. They're added to the page under their own
// names ("b0r3d Roboto"), so declaring them never changes the page's own text, and a design keeps
// its plain CSS ("'Roboto', sans-serif") for its file and its SVG.

import { CAPTION_FACES } from './caption-faces'

/** The choices for a caption's font: a label, and the CSS a design keeps. */
export const CAPTION_FONTS: readonly { label: string; value: string }[] = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { label: 'Lato', value: "'Lato', sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'Oswald', value: "'Oswald', sans-serif" },
  { label: 'Raleway', value: "'Raleway', sans-serif" },
  { label: 'Nunito', value: "'Nunito', sans-serif" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Playfair Display', value: "'Playfair Display', serif" },
  { label: 'Merriweather', value: "'Merriweather', serif" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Fira Code', value: "'Fira Code', monospace" },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
  { label: 'Inconsolata', value: "'Inconsolata', monospace" },
  { label: 'Pacifico', value: "'Pacifico', cursive" },
  { label: 'Bebas Neue', value: "'Bebas Neue', sans-serif" }
]

/** The page's own font, which measures a caption with no font of its own (as the page shows it). */
export const PAGE_FONT = 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif'

const WEB_FONTS = new Map(Object.keys(CAPTION_FACES).map((name) => [name.toLowerCase(), name]))
const added = new Set<string>()

/** The families in a CSS font list, unquoted. */
export function familiesIn(css: string): string[] {
  const out: string[] = []
  for (const part of css.match(/("[^"]*"|'[^']*'|[^,]+)/g) ?? []) {
    const name = part.trim().replace(/^(["'])(.*)\1$/, '$2').trim()
    if (name) out.push(name)
  }
  return out
}

function alias(family: string): string {
  return 'b0r3d ' + family
}

/** A CSS font list for a canvas: the site's web fonts under their own names, the rest as they are. */
export function canvasFamilies(css: string): string {
  return familiesIn(css)
    .map((name) => {
      const web = WEB_FONTS.get(name.toLowerCase())
      if (web) return `'${alias(web)}'`
      return /^[a-z-]+$/i.test(name) ? name : `'${name.replace(/'/g, '')}'`
    })
    .join(', ')
}

function addFaces(family: string): void {
  if (added.has(family) || typeof FontFace === 'undefined') return
  added.add(family)
  for (const face of CAPTION_FACES[family]) {
    document.fonts.add(new FontFace(alias(family), `url(${face.url}) format('woff2')`, { weight: '400', style: 'normal', unicodeRange: face.range }))
  }
}

/**
 * Makes sure the web fonts in a CSS font list are loaded for some text (only the subsets it needs
 * are fetched). Resolves when they're ready, or when they can't be had (offline, a font never
 * kept): the canvas then draws with the next family in the list.
 */
export async function loadFonts(css: string, text: string): Promise<void> {
  const webFamilies = familiesIn(css)
    .map((name) => WEB_FONTS.get(name.toLowerCase()))
    .filter((name): name is string => name !== undefined)
  if (webFamilies.length === 0 || typeof document === 'undefined' || !document.fonts) return
  for (const family of webFamilies) addFaces(family)
  try {
    await document.fonts.load(`18px ${canvasFamilies(css)}`, text || 'a')
  } catch {
    // drawn with the fallback
  }
}
