import animate from 'tailwindcss-animate'
import typography from '@tailwindcss/typography'

// b0r3d palette. Upstream styles everything with the zinc/gray/slate scales
// (light shades in light mode, dark shades in dark mode), so the dark end of
// each scale is mapped onto the b0r3d.org tokens and the light end is left
// neutral. One mapping restyles every component in both themes.
//   --bg #131313  --panel #1a1a1a  --panel-2 #1f1f1f  --line #2c2c2c
//   --text #e6e6e6  --muted #9d9d9d
const b0r3dGrey = {
  50: '#fafafa',
  100: '#f4f4f4',
  200: '#e6e6e6', // --text
  300: '#d4d4d4',
  400: '#9d9d9d', // --muted
  500: '#737373',
  600: '#3a3a3a',
  700: '#2c2c2c', // --line
  800: '#1f1f1f', // --panel-2
  900: '#1a1a1a', // --panel
  950: '#131313' // --bg
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './pages/**/*.{ts,tsx,vue}',
    './components/**/*.{ts,tsx,vue}',
    './app/**/*.{ts,tsx,vue}',
    './src/**/*.{ts,tsx,vue}'
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        zinc: b0r3dGrey,
        gray: b0r3dGrey,
        slate: b0r3dGrey,
        b0r3d: {
          bg: '#131313',
          panel: '#1a1a1a',
          'panel-2': '#1f1f1f',
          line: '#2c2c2c',
          text: '#e6e6e6',
          muted: '#9d9d9d',
          pink: '#ff66ff',
          magenta: '#ff00ff',
          cyan: '#00ffff',
          mint: '#00ff9d'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--reka-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--reka-accordion-content-height)' },
          to: { height: 0 }
        },
        'collapsible-down': {
          from: { height: 0 },
          to: { height: 'var(--reka-collapsible-content-height)' }
        },
        'collapsible-up': {
          from: { height: 'var(--reka-collapsible-content-height)' },
          to: { height: 0 }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-in-out',
        'collapsible-up': 'collapsible-up 0.2s ease-in-out'
      }
    }
  },
  plugins: [animate, typography]
}
