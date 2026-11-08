import './style.css'
import { startApp } from './ui/app'

const root = document.getElementById('app')
if (root) startApp(root)

// The site works offline once it has been opened: the service worker keeps a copy of its files.
// Only in the built site, so the dev server always shows the newest code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // no offline copy this time; the page works the same online
    })
  })
}
