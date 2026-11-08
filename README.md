# qr.b0r3d.org

**b0r3d QR** is b0r3d's QR code generator and scanner: <https://qr.b0r3d.org>.

It makes **static QR codes only**. Whatever you type is encoded straight into the pattern, so there
is no redirect link, no account and nothing that can ever expire. The app runs entirely in your
browser: codes are drawn and saved on your device, and the app loads nothing from any other site.
Like the rest of b0r3d.org, the site counts visits; that never includes what you type.

b0r3d QR is also a Windows program, [b0r3d QR for PC](https://github.com/still-b0r3d/b0r3d-QR-PC).
Both make the same codes and the same files, and share one version number.

## This branch: the site on b0r3d's own code

The site is being rebuilt on b0r3d's own code, written for b0r3d QR for PC and brought over to the
web, so it no longer carries Mini QR. The layout, the design files and what visitors have kept in
their browsers stay as they are. It's built in stages:

1. **The page, a plain QR code, PNG and SVG, and the scan check.** *Done.* The page installs as an
   offline app.
2. The designer and every export.
3. The data templates and Recent codes.
4. The other barcodes and scanning (a picture, the clipboard, the camera).
5. Batches and print sizes, with tests that the site and the PC app make the same files.

What's there so far:

- QR codes made exactly as before: the same text, level and size give the same modules as this
  site always made, and as the PC app makes (its tests carry 100 codes made by the earlier site).
- Error correction, quiet zone and picture size.
- PNG and SVG files; the SVG is character for character the PC app's.
- The scan check: every change is drawn the way it's saved and read back by a scanner (zxing-wasm,
  in a worker), like a phone camera reading the saved file. A thin quiet zone gets a warning.
- Dark and light looks (dark by default), kept as before.
- Works offline once visited, and installs as an app.

## Licence

**MIT + Commons Clause**, licensor b0r3d.org: free to use, change and share, not to sell. See
[LICENSE](LICENSE), the same licence as b0r3d QR for PC. The site's third-party parts and their
licences are in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt), linked from the footer.

Versions up to `0.33.0+b0r3d.1.2` were a modified copy of [Mini QR](https://github.com/lyqht/mini-qr)
by Estee Tey, under the GNU General Public License v3.0. That code stays under the GPL-3.0 in this
repository's history; none of it is in the new site.

## Versioning

From the release of the rebuilt site the version is a plain number shared with b0r3d QR for PC: the
same release of both carries the same number. The footer shows it as `v1.3` (`1.3.0` in
`package.json`) and the **build** apart from it: the commit the site was built from, filled in by the
hosting build (a copy built on your own computer says `Build: dev`).

Until then `package.json` keeps the live site's `0.33.0+b0r3d.1.2`.

| Version            | Date       | What changed                                                   |
| ------------------ | ---------- | -------------------------------------------------------------- |
| `0.33.0+b0r3d.1`   | 2026-10-04 | First release on qr.b0r3d.org                                  |
| `0.33.0+b0r3d.2`   | 2026-10-05 | Logos from a web address, English only                         |
| `0.33.0+b0r3d.3`   | 2026-10-05 | Version and build shown in the footer                          |
| `0.33.0+b0r3d.4`   | 2026-10-05 | Footer trimmed to one line                                     |
| `0.33.0+b0r3d.5`   | 2026-10-05 | Other barcode types, ZXing-C++ scanning, data template fixes   |
| `0.33.0+b0r3d.6`   | 2026-10-05 | Fix a blank page after deploys (asset caching)                 |
| `0.33.0+b0r3d.7`   | 2026-10-07 | Recent codes, clear space around centre logos                  |
| `0.33.0+b0r3d.8`   | 2026-10-08 | The build number in the footer is plain text                   |
| `0.33.0+b0r3d.9`   | 2026-10-09 | Data templates dropdown menu next to presets                   |
| `0.33.0+b0r3d.98`  | 2026-10-09 | UPC-E, ISBN, bar height/quiet zones, barcode CSV batch, PDF export, camera torch/cycling, ECI 26, schema v1 |
| `0.33.0+b0r3d.1.0` | 2026-10-09 | 1.0: review fixes (UTF-8 marker, PDF, ITF-14, ISBN, barcode batches, camera switch) |
| `0.33.0+b0r3d.1.1` | 2026-10-15 | The new b0r3d cup: logo, cup preset, favicon, app icons, splash screens and share image |
| `0.33.0+b0r3d.1.2` | 2026-11-01 | ZXing-C++ update (zxing-wasm 3.1.6): scanning fixes; the codes it makes are unchanged |

## Development

Node 22 and pnpm 10 (`npx -y pnpm@10.0.0 …` works without installing pnpm).

```sh
pnpm install
pnpm dev                 # the page at http://localhost:5173
pnpm check               # types, lint and unit tests
pnpm test:e2e            # the page in Chromium, a phone and WebKit (Safari's engine)
pnpm build               # the site in dist/
pnpm verify:site         # the built site checked in Chromium (or pass the live address)
```

The offline copy only exists in a built site: build it, run `pnpm preview --port 4175`, then
`E2E_BASE_URL=http://127.0.0.1:4175/ pnpm test:e2e --project=chromium` runs every check against it,
the offline ones included.

The site is a static build (Vite and TypeScript, no framework). `public/_headers` sets the response
headers on the host; the page's Content-Security-Policy is a `<meta>` tag made in `vite.config.ts`,
which also writes the service worker (`src/sw/sw.ts`) with the build's list of files.
