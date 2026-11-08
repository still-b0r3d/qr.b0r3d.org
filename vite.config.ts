import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite'

// Shown in the footer: the version, bumped by hand for a release (see README, Versioning), and
// the build, the commit the hosting build was made from. A build on someone's own computer has no
// commit given to it, and says "dev".
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const commit = process.env.CF_PAGES_COMMIT_SHA ?? ''

// Content-Security-Policy for the built page, as a <meta> tag so every copy of the build (the live
// site, `vite preview`, the verify script) runs under it. frame-ancestors can't go in a <meta>, so
// public/_headers sends that one. The inline script in index.html (the look before the first
// paint) is allowed by its hash, worked out here so an edit can't silently break the page.
const CSP_SOURCES: Record<string, string[]> = {
  'default-src': ["'self'"],
  // Cloudflare adds b0r3d.org's visitor-stats beacon to the live page. 'wasm-unsafe-eval' lets the
  // scanner (WebAssembly, from this site) compile; it allows no JavaScript eval.
  'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://static.cloudflareinsights.com'],
  // Styles come from the built stylesheet only; the page sets the few that change (sizes) through
  // element.style, which the policy allows.
  'style-src': ["'self'"],
  'img-src': ["'self'", 'blob:'],
  'font-src': ["'self'"],
  // The visitor-stats beacon reports back to Cloudflare.
  'connect-src': ["'self'", 'https://cloudflareinsights.com'],
  // The scanner runs in a worker built next to the page; the service worker is /sw.js.
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"]
}

function contentSecurityPolicy(): Plugin {
  return {
    name: 'b0r3d-content-security-policy',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        const hashes = inline.map(
          // Browsers turn CRLF into LF before hashing, so a Windows checkout (CRLF) has to be
          // hashed the same way.
          ([, code]) => `'sha256-${createHash('sha256').update(code.replace(/\r\n?/g, '\n')).digest('base64')}'`
        )
        const sources = { ...CSP_SOURCES, 'script-src': [...CSP_SOURCES['script-src'], ...hashes] }
        const policy = Object.entries(sources)
          .map(([directive, values]) => `${directive} ${values.join(' ')}`)
          .join('; ')
        return html.replace(/<head>/, `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`)
      }
    }
  }
}

// The footer's Licence and Notices links go to /LICENSE.txt and /THIRD-PARTY-NOTICES.txt, copies
// made at build time (and served by the dev server).
const TEXT_FILES: Record<string, string> = {
  '/LICENSE.txt': './LICENSE',
  '/THIRD-PARTY-NOTICES.txt': './THIRD-PARTY-NOTICES.txt'
}

function textFiles(): Plugin {
  const text = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
  return {
    name: 'b0r3d-text-files',
    configureServer(server) {
      for (const [path, file] of Object.entries(TEXT_FILES)) {
        server.middlewares.use(path, (_req, res) => {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(text(file))
        })
      }
    },
    generateBundle() {
      for (const [path, file] of Object.entries(TEXT_FILES)) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source: text(file) })
      }
    }
  }
}

// Files from public/ the offline copy keeps (the splash screens and the sharing picture aren't
// needed offline).
const PUBLIC_OFFLINE = [
  'favicon.ico',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'app_icons/web/icon-192.png',
  'app_icons/web/icon-192-maskable.png',
  'app_icons/web/icon-512.png',
  'app_icons/web/icon-512-maskable.png'
]

// /sw.js, made from src/sw/sw.ts with the list of the build's files and a cache name that changes
// whenever any of them does.
function serviceWorker(): Plugin {
  return {
    name: 'b0r3d-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const files = ['/']
        const hash = createHash('sha256')
        for (const name of Object.keys(bundle).sort()) {
          const item = bundle[name]
          if (name.endsWith('.map')) continue
          hash.update(name)
          hash.update(item.type === 'chunk' ? item.code : item.source)
          if (name !== 'index.html') files.push('/' + name)
        }
        for (const name of PUBLIC_OFFLINE) {
          hash.update(name)
          hash.update(readFileSync(new URL('./public/' + name, import.meta.url)))
          files.push('/' + name)
        }
        const source = readFileSync(new URL('./src/sw/sw.ts', import.meta.url), 'utf8')
        const { code } = await transformWithEsbuild(source, 'sw.ts', { loader: 'ts', format: 'iife', target: 'es2020' })
        const cache = 'b0r3d-qr-' + hash.digest('hex').slice(0, 16)
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: `const CACHE = ${JSON.stringify(cache)};\nconst FILES = ${JSON.stringify(files)};\n${code}`
        })
      }
    }
  }
}

export default defineConfig({
  // A missing file is a 404 in `vite dev` and `vite preview`, as on the live site with
  // public/404.html (see public/_headers).
  appType: 'mpa',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(commit)
  },
  build: {
    // Every asset stays a file of its own, so the policy above needs no data:.
    assetsInlineLimit: 0
  },
  worker: { format: 'es' },
  plugins: [contentSecurityPolicy(), textFiles(), serviceWorker()]
})
