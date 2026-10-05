import { isValidFrameConfig } from './framePresets'
import B0r3dCupLogo from '@/assets/presets/b0r3d-cup-logo.json'
import RukusLogo from '@/assets/presets/rukus-logo.json'
import PlainConfig from '@/assets/presets/plain.json'
import type { DrawType, Options as StyledQRCodeProps } from '@/lib/qr-code'

export interface CustomStyleProps {
  borderRadius?: string
  background?: string
}

export type PresetAttributes = {
  style: CustomStyleProps
  name: string
}

export type Preset = Omit<
  Required<StyledQRCodeProps>,
  'shape' | 'qrOptions' | 'nodeCanvas' | 'jsdom'
> &
  PresetAttributes

const defaultPresetOptions = {
  backgroundOptions: {
    color: 'transparent'
  },
  imageOptions: {
    margin: 0
  },
  width: 200,
  height: 200,
  margin: 0,
  type: 'svg' as DrawType
}

// Built-in presets. Every logo is bundled with the app (data URI), so picking
// a preset never makes a request to another site.

export const plainPreset = {
  ...defaultPresetOptions,
  name: 'Plain',
  ...PlainConfig.props,
  style: PlainConfig.style
} as Preset

export const roundedPreset = {
  ...defaultPresetOptions,
  name: 'Rounded',
  data: 'https://b0r3d.org',
  image: '',
  margin: 4,
  dotsOptions: { color: '#000000', type: 'rounded' },
  cornersSquareOptions: { color: '#000000', type: 'extra-rounded' },
  cornersDotOptions: { color: '#000000', type: 'dot' },
  style: { borderRadius: '16px', background: '#ffffff' },
  qrOptions: { errorCorrectionLevel: 'Q' }
} as Preset

export const dotsPreset = {
  ...defaultPresetOptions,
  name: 'Dots',
  data: 'https://b0r3d.org',
  image: '',
  margin: 4,
  dotsOptions: { color: '#000000', type: 'dots' },
  cornersSquareOptions: { color: '#000000', type: 'dot' },
  cornersDotOptions: { color: '#000000', type: 'dot' },
  style: { borderRadius: '16px', background: '#ffffff' },
  qrOptions: { errorCorrectionLevel: 'Q' }
} as Preset

export const b0r3dCupPreset = {
  ...defaultPresetOptions,
  name: 'b0r3d Cup',
  data: 'https://b0r3d.org',
  image: B0r3dCupLogo.image,
  margin: 4,
  dotsOptions: { color: '#131313', type: 'rounded' },
  cornersSquareOptions: { color: '#131313', type: 'extra-rounded' },
  cornersDotOptions: { color: '#c000c0', type: 'dot' },
  imageOptions: { margin: 4 },
  style: { borderRadius: '16px', background: '#ffffff' },
  qrOptions: { errorCorrectionLevel: 'H' }
} as Preset

// Rukus the cat, in his grey with a nose-pink centre in each corner.
export const rukusPreset = {
  ...defaultPresetOptions,
  name: 'Rukus',
  data: 'https://b0r3d.org',
  image: RukusLogo.image,
  margin: 4,
  dotsOptions: { color: '#2b2b2b', type: 'rounded' },
  cornersSquareOptions: { color: '#2b2b2b', type: 'extra-rounded' },
  cornersDotOptions: { color: '#c0396b', type: 'dot' },
  imageOptions: { margin: 4 },
  style: { borderRadius: '16px', background: '#ffffff' },
  qrOptions: { errorCorrectionLevel: 'H' }
} as Preset

export const builtInPresets: Preset[] = [
  plainPreset,
  roundedPreset,
  dotsPreset,
  b0r3dCupPreset,
  rukusPreset
]

function parsePresetsFromEnv(envVal?: string): Preset[] | undefined {
  if (!envVal) return undefined
  try {
    return JSON.parse(envVal) as Preset[]
  } catch (err) {
    console.error('Failed to parse VITE_QR_CODE_PRESETS', err)
    return undefined
  }
}

const envPresets = parsePresetsFromEnv(import.meta.env.VITE_QR_CODE_PRESETS)
export const allQrCodePresets: Preset[] = envPresets ?? builtInPresets

/** Case-insensitive, so VITE_DEFAULT_PRESET=plain finds the "Plain" preset. */
export function findPresetByName(presets: Preset[], name?: string): Preset | undefined {
  const wanted = name?.trim().toLowerCase()
  if (!wanted) return undefined
  return presets.find((p) => p.name.toLowerCase() === wanted)
}

export const defaultPreset: Preset =
  findPresetByName(allQrCodePresets, import.meta.env.VITE_DEFAULT_PRESET) ?? allQrCodePresets[0]

/**
 * Logo image URLs are looser than frame background images
 * (isValidFrameBackgroundImage): besides http(s) and data:image, configs may
 * use Vite asset paths (e.g. /assets/logo-<hash>.png), so scheme-less
 * same-origin paths must stay loadable. Only an explicit
 * non-http(s), non-image scheme (javascript:, file:, data:text/html, …) is
 * rejected — those have no business in an <image href>.
 */
export function isSafeImageUrl(value: string): boolean {
  if (value === '') return true
  if (/^data:/i.test(value)) return /^data:image\//i.test(value)
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(value)
  if (scheme) return /^https?:$/i.test(scheme[0])
  return true // scheme-less: relative or root-relative same-origin path
}

export function isValidQRCodeConfig(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (!c.props || typeof c.props !== 'object') return false
  const props = c.props as Record<string, unknown>
  if (props.image != null && (typeof props.image !== 'string' || !isSafeImageUrl(props.image))) {
    return false
  }
  if (!c.style || typeof c.style !== 'object') return false
  const style = c.style as Record<string, unknown>
  if (typeof style.borderRadius !== 'string') return false
  if (c.frame != null && !isValidFrameConfig(c.frame)) return false
  return true
}
