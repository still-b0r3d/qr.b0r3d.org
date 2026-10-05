// Shared helpers for scripts/verify-static.mjs and scripts/verify-site.mjs.
import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import process from 'process'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import sharp from 'sharp'

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')

/** A fresh output folder under test-results/ (git-ignored). */
export function outputDir(name) {
  const dir = path.join(ROOT, 'test-results', name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function waitFor(url, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`${url} did not come up within ${timeoutMs / 1000}s`)
}

/**
 * Runs `fn(baseUrl)` against the URL given on the command line, or, without
 * one, against dist/ served by `vite preview` from the site root.
 */
export async function withSite(fn) {
  const given = process.argv[2]
  if (given) return fn(given.endsWith('/') ? given : `${given}/`)

  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    throw new Error('dist/ not found. Run `pnpm build` first, or pass a URL.')
  }
  const port = await freePort()
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(
    process.execPath,
    [vite, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' }
  )
  const base = `http://127.0.0.1:${port}/`
  try {
    await waitFor(base)
    return await fn(base)
  } finally {
    server.kill()
  }
}

/** Decodes the QR code in a PNG; returns the raw payload bytes. */
export function decodePng(buffer) {
  const png = PNG.sync.read(buffer)
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  if (!result) return null
  return { bytes: Buffer.from(result.binaryData), width: png.width, height: png.height }
}

/** Renders an SVG at 4x on white, the way a viewer shows it, then decodes it. */
export async function decodeSvg(file) {
  const png = await sharp(file, { density: 384 })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer()
  return decodePng(png)
}
