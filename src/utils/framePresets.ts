export interface FrameStyle {
  textColor: string
  backgroundColor: string
  borderColor: string
  borderWidth: string
  borderRadius: string
  padding: string
  fontFamily?: string
  /** Frame background image (data:image URI from upload, or http(s) URL). Drawn over backgroundColor. */
  backgroundImage?: string
}

export type FontCategory = 'sans' | 'serif' | 'monospace' | 'display'

export interface FontOption {
  label: string
  value: string
  /** Family name of a self-hosted web font (see WEB_FONT_LOADERS). */
  webFontName?: string
  // Omitted on the "Default" entry; everything else is categorised so the UI
  // can render an <optgroup> per category.
  category?: FontCategory
}

/**
 * Curated font list: web-safe fonts (no loading) + popular open-source web
 * fonts. The web fonts ship with the app (@fontsource packages) and are only
 * downloaded, from this site, when someone picks one.
 *
 * Sources:
 *  - Google Fonts popularity rankings (sans/serif/display picks).
 *  - Programming-font catalogues + Wikipedia "Slashed zero" article
 *    (monospace picks — all have a slashed 0 to disambiguate from O,
 *    requested in lyqht/mini-qr#203 for WiFi-password QR codes).
 */
export const FONT_OPTIONS: FontOption[] = [
  { label: 'Default', value: '' },
  // Sans-serif
  { label: 'Arial', value: 'Arial, sans-serif', category: 'sans' },
  { label: 'Verdana', value: 'Verdana, sans-serif', category: 'sans' },
  { label: 'Roboto', value: "'Roboto', sans-serif", webFontName: 'Roboto', category: 'sans' },
  { label: 'Inter', value: "'Inter', sans-serif", webFontName: 'Inter', category: 'sans' },
  {
    label: 'Open Sans',
    value: "'Open Sans', sans-serif",
    webFontName: 'Open Sans',
    category: 'sans'
  },
  { label: 'Lato', value: "'Lato', sans-serif", webFontName: 'Lato', category: 'sans' },
  {
    label: 'Montserrat',
    value: "'Montserrat', sans-serif",
    webFontName: 'Montserrat',
    category: 'sans'
  },
  {
    label: 'Poppins',
    value: "'Poppins', sans-serif",
    webFontName: 'Poppins',
    category: 'sans'
  },
  { label: 'Oswald', value: "'Oswald', sans-serif", webFontName: 'Oswald', category: 'sans' },
  {
    label: 'Raleway',
    value: "'Raleway', sans-serif",
    webFontName: 'Raleway',
    category: 'sans'
  },
  { label: 'Nunito', value: "'Nunito', sans-serif", webFontName: 'Nunito', category: 'sans' },
  // Serif
  { label: 'Georgia', value: 'Georgia, serif', category: 'serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif", category: 'serif' },
  {
    label: 'Playfair Display',
    value: "'Playfair Display', serif",
    webFontName: 'Playfair Display',
    category: 'serif'
  },
  {
    label: 'Merriweather',
    value: "'Merriweather', serif",
    webFontName: 'Merriweather',
    category: 'serif'
  },
  // Monospace — all web-font entries below have a slashed 0
  { label: 'Courier New', value: "'Courier New', monospace", category: 'monospace' },
  {
    label: 'JetBrains Mono',
    value: "'JetBrains Mono', monospace",
    webFontName: 'JetBrains Mono',
    category: 'monospace'
  },
  {
    label: 'Fira Code',
    value: "'Fira Code', monospace",
    webFontName: 'Fira Code',
    category: 'monospace'
  },
  {
    label: 'Source Code Pro',
    value: "'Source Code Pro', monospace",
    webFontName: 'Source Code Pro',
    category: 'monospace'
  },
  {
    label: 'IBM Plex Mono',
    value: "'IBM Plex Mono', monospace",
    webFontName: 'IBM Plex Mono',
    category: 'monospace'
  },
  {
    label: 'Inconsolata',
    value: "'Inconsolata', monospace",
    webFontName: 'Inconsolata',
    category: 'monospace'
  },
  // Display & cursive
  {
    label: 'Pacifico',
    value: "'Pacifico', cursive",
    webFontName: 'Pacifico',
    category: 'display'
  },
  {
    label: 'Bebas Neue',
    value: "'Bebas Neue', sans-serif",
    webFontName: 'Bebas Neue',
    category: 'display'
  }
]

// Only weight 400 is loaded: frame captions are always drawn at normal weight.
const WEB_FONT_LOADERS: Record<string, () => Promise<unknown>> = {
  Roboto: () => import('@fontsource/roboto/400.css'),
  Inter: () => import('@fontsource/inter/400.css'),
  'Open Sans': () => import('@fontsource/open-sans/400.css'),
  Lato: () => import('@fontsource/lato/400.css'),
  Montserrat: () => import('@fontsource/montserrat/400.css'),
  Poppins: () => import('@fontsource/poppins/400.css'),
  Oswald: () => import('@fontsource/oswald/400.css'),
  Raleway: () => import('@fontsource/raleway/400.css'),
  Nunito: () => import('@fontsource/nunito/400.css'),
  'Playfair Display': () => import('@fontsource/playfair-display/400.css'),
  Merriweather: () => import('@fontsource/merriweather/400.css'),
  'JetBrains Mono': () => import('@fontsource/jetbrains-mono/400.css'),
  'Fira Code': () => import('@fontsource/fira-code/400.css'),
  'Source Code Pro': () => import('@fontsource/source-code-pro/400.css'),
  'IBM Plex Mono': () => import('@fontsource/ibm-plex-mono/400.css'),
  Inconsolata: () => import('@fontsource/inconsolata/400.css'),
  Pacifico: () => import('@fontsource/pacifico/400.css'),
  'Bebas Neue': () => import('@fontsource/bebas-neue/400.css')
}

export function hasWebFontLoader(fontName: string): boolean {
  return fontName in WEB_FONT_LOADERS
}

export function loadWebFont(fontName: string): Promise<void> {
  const load = WEB_FONT_LOADERS[fontName]
  if (!load) return Promise.resolve()
  // Wait for the font to be available for rendering
  return load()
    .then(() => document.fonts.load(`400 1em "${fontName}"`))
    .then(() => {})
}

export interface FramePreset {
  name: string
  style: FrameStyle
  text?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export const plainFramePreset: FramePreset = {
  name: 'Default Frame',
  style: {
    textColor: '#000000',
    backgroundColor: '#ffffff',
    borderColor: '#000000',
    borderWidth: '1px',
    borderRadius: '8px',
    padding: '16px'
  }
}

export const darkFramePreset: FramePreset = {
  name: 'Dark Frame',
  style: {
    textColor: '#ffffff',
    backgroundColor: '#000000',
    borderColor: '#ffffff',
    borderWidth: '1px',
    borderRadius: '8px',
    padding: '16px'
  }
}

export const borderlessFramePreset: FramePreset = {
  name: 'Borderless Frame',
  style: {
    textColor: '#000000',
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    borderWidth: '0px',
    borderRadius: '0px',
    padding: '16px'
  }
}

export const builtInFramePresets: FramePreset[] = [
  plainFramePreset,
  darkFramePreset,
  borderlessFramePreset
]

function parseFramePresetsFromEnv(envVal?: string): FramePreset[] | undefined {
  if (!envVal) return undefined
  try {
    return JSON.parse(envVal) as FramePreset[]
  } catch (err) {
    console.error('Failed to parse VITE_FRAME_PRESETS', err)
    return undefined
  }
}

const envFramePresets = parseFramePresetsFromEnv(import.meta.env.VITE_FRAME_PRESETS)
export const allFramePresets: FramePreset[] = envFramePresets ?? builtInFramePresets

export const defaultFramePreset: FramePreset =
  allFramePresets.find((p) => p.name === import.meta.env.VITE_FRAME_PRESET) ?? allFramePresets[0]

export const VALID_FRAME_POSITIONS = ['top', 'bottom', 'left', 'right'] as const

import { isValidCSSColor, isValidCSSLength } from './css'

/**
 * Frame background images come from a file upload (data:image URI) or a
 * preset/config URL. Restricting to these schemes keeps e.g. `javascript:`
 * out of stored configs and exported SVG `<image href>` attributes.
 */
export function isValidFrameBackgroundImage(value: string): boolean {
  return /^data:image\//.test(value) || /^https?:\/\//i.test(value)
}

export function isValidFrameStyle(value: unknown): value is FrameStyle {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return (
    typeof s.textColor === 'string' &&
    isValidCSSColor(s.textColor) &&
    typeof s.backgroundColor === 'string' &&
    isValidCSSColor(s.backgroundColor) &&
    typeof s.borderColor === 'string' &&
    isValidCSSColor(s.borderColor) &&
    typeof s.borderWidth === 'string' &&
    isValidCSSLength(s.borderWidth) &&
    typeof s.borderRadius === 'string' &&
    isValidCSSLength(s.borderRadius) &&
    typeof s.padding === 'string' &&
    isValidCSSLength(s.padding) &&
    (s.fontFamily === undefined || typeof s.fontFamily === 'string') &&
    (s.backgroundImage === undefined ||
      (typeof s.backgroundImage === 'string' && isValidFrameBackgroundImage(s.backgroundImage)))
  )
}

export function isValidFrameConfig(value: unknown): value is FramePreset {
  if (!value || typeof value !== 'object') return false
  const f = value as Record<string, unknown>
  return (
    typeof f.text === 'string' &&
    VALID_FRAME_POSITIONS.includes(f.position as (typeof VALID_FRAME_POSITIONS)[number]) &&
    isValidFrameStyle(f.style)
  )
}
