// Dark or light. Dark is the default. A visitor's choice is kept where this site has always kept it
// ('dark-mode-preference': 'dark', 'light', or 'system' to follow the device), so it carries over.
// index.html applies it before the first paint with the same rule.

import { moonIcon, sunIcon } from './icons'

export const THEME_KEY = 'dark-mode-preference'

type Preference = 'dark' | 'light' | 'system'

// the choice made on this page, which counts even when the browser won't keep it
let chosen: Preference | null = null

function stored(): Preference {
  if (chosen) return chosen
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

const darkDevice = () => matchMedia('(prefers-color-scheme: dark)').matches

export function themeShown(pref: Preference = stored()): 'dark' | 'light' {
  return pref === 'light' || (pref === 'system' && !darkDevice()) ? 'light' : 'dark'
}

/** The button that switches between dark and light, kept as the visitor's choice. */
export function themeButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'theme-toggle'
  button.append(sunIcon(), moonIcon())
  const show = () => {
    const shown = themeShown()
    document.documentElement.dataset.theme = shown
    const next = shown === 'dark' ? 'light' : 'dark'
    button.setAttribute('aria-label', `Switch to the ${next} look`)
    button.title = `Switch to the ${next} look`
  }
  button.addEventListener('click', () => {
    chosen = themeShown() === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_KEY, chosen)
    } catch {
      // private browsing: it still switches, for this visit
    }
    show()
  })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', show)
  show()
  return button
}
