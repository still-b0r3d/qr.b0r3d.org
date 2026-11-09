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
2. **The designer and every export.** *Done.*
3. **The data templates and Recent codes.** *Done.*
4. **The other barcodes and scanning (a picture, the clipboard, the camera).** *Done.*
5. **Batches and print sizes, with tests that the site and the PC app make the same files.** *Done.*

What's there so far:

- QR codes made exactly as before: the same text, level and size give the same modules as this
  site always made, and as the PC app makes (its tests carry 100 codes made by the earlier site).
- The designer: presets (Plain, Rounded, Dots, b0r3d Cup, Rukus) and Randomize; dot, corner square
  and corner dot shapes and colours; a background or none; rounded corners; a logo from a file, the
  clipboard, a drop or a web address, with its size and the space around it; a frame with a caption
  on any side, its colours, picture, lengths and one of 23 fonts; error correction, the size of the
  code (QR version), the UTF-8 marker, quiet zone and picture size.
- PNG, JPG, SVG, PDF and the code as text (three kinds, plain or Markdown), and copying the picture.
  Captions in PNG, JPG and PDF files are drawn in their real font. The SVG files, picture sizes and
  warnings are the PC app's, character for character.
- Design files (`qr-code-config.json`) both ways, byte for byte as the PC app writes them, and the
  last design kept in the browser where the site always kept it.
- 11 data templates (text, a web address, Wi-Fi, a contact card, email, phone, SMS, a place, an
  event, a SEPA payment, a GS1 Digital Link): each one's form writes its code, and a code's text
  fills its form again. Checks on the typed text with one-click fixes (spaces at the ends, a web
  address without https://, tracking parameters). The same texts and words as the PC app.
- Recent codes: the last 20 codes saved or copied, kept only in the browser (where the site has
  always kept them, so earlier ones are still there), to open again or delete; a Wi-Fi password
  is never shown in the list.
- The scan check: every change is drawn the way it's saved and read back by a scanner (zxing-wasm,
  in a worker), like a phone camera reading the saved file, with warnings for low contrast,
  inverted colours, a see-through background and a thin quiet zone, and "What's in this code".
- 13 other barcodes, picked in the Code type list: Data Matrix, GS1 DataMatrix, Aztec, PDF417,
  EAN-13, EAN-8, UPC-A, UPC-E, ISBN, Code 128, GS1-128, ITF-14 and Code 39. zint makes them (in
  zxing-wasm's barcode maker, in a worker), so they come out as the PC app makes them, SVG for SVG;
  each type's checks and messages are the PC app's, check digits are added, and each barcode gets
  its own scan check. Text under the bars, quiet zones, bar height, a rectangular Data Matrix,
  colours, a see-through background and the size; PNG, JPG, SVG and PDF; Recent codes keep
  barcodes too, with their settings.
- The Scan tab: codes read from pictures (opened, several at once, pasted, dropped anywhere on the
  page, or Ctrl+V) and from a camera, QR codes and the common barcodes, light on dark too. Each code
  found says what it is (a link, a Wi-Fi network, a product number...) without showing a password,
  and can be copied, opened (after a question that shows where the link goes) or made again on the
  Create tab. Pictures never leave the browser.
- Print sizes: a width on paper in millimetres or inches at 150, 300 or 600 DPI, for QR codes and
  for barcodes (every bar a whole number of pixels), with what it makes and a warning when modules
  or bars come out too small to print well; every PNG and JPG carries its resolution, the PDF's page
  and the SVG's lengths are the size on paper. Whole pixels per module for sharp squares. Both kept
  where the site has always kept them.
- Batch export: a CSV file (from a spreadsheet, or one of the examples) made into a file for every
  row, all in one zip: QR codes with the Create tab's design, each with its own caption and font if
  the file gives them, contact cards from a file of contacts, or barcodes with the barcode
  settings; PNG, JPG, SVG, PDF or text. The rows are read and the files named as this site always
  named them; the rows that can't be made are listed with why, each row can be looked at first, and
  every file is read back out of the finished zip and scanned.
- The same files as the PC app: its tests compare the site's batches (1,028 CSV files, their rows,
  names and plans) and its pictures (203 designs and barcodes at print sizes: their sizes,
  resolutions and PDF pages, and their pixels where both draw them sharp) with what the PC app
  makes.
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
