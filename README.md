# qr.b0r3d.org

**b0r3d QR** is b0r3d's QR code generator and scanner: <https://qr.b0r3d.org>.
It also makes and reads other barcodes (Data Matrix, EAN, Code 128 and more),
tucked behind one "Code type" menu so the page stays a QR generator first.

It makes **static QR codes only**. Whatever you type is encoded straight into
the pattern, so there is no redirect link, no account and nothing that can ever
expire. The app runs entirely in your browser: codes are drawn and exported on
your device, and the app loads nothing from any other site (except a logo
address you enter yourself). Like the rest of b0r3d.org, the site counts
visits; that never includes what you type.

- Text, URLs, email, phone, SMS, Wi-Fi, vCard, location, calendar events,
  EPC (SEPA) payments and GS1 Digital Link product links
- Other barcodes: Data Matrix, GS1 DataMatrix, Aztec, PDF417, EAN-13, EAN-8,
  UPC-A, Code 128, GS1-128, ITF-14 and Code 39, with check digits added for
  you and GS1 data checked
- Export to PNG, JPG, SVG and plain-text QR codes, or copy to the clipboard
- Batch export from a CSV file
- Frames with captions, logos, colours and dot styles; save and load settings
- Recent codes: the last 20 codes you download, copy or save, kept in your
  browser so you can open them again
- Compact encoding (numbers and capitals take fewer modules) and an optional
  fixed size, so every code in a batch matches
- Checks that each code scans (a test decode in your browser) and warns about
  low contrast, inverted colours and a missing quiet zone
- Shows exactly what a code stores, and flags links without `https://`,
  tracking parameters and stray spaces, with one-click fixes
- Export at a print size (mm or inches) and DPI, with module-size and
  scanning-distance guidance
- Scan QR codes and barcodes from an image, the clipboard or the camera
- Installs as an offline app

## Based on Mini QR

This is a modified version of [Mini QR](https://github.com/lyqht/mini-qr) by
Estee Tey, imported from release **v0.33.0** (commit
`fe46504853c597e44b2e39d3decb5df2184c6605`). Thank you to Estee and the Mini QR
contributors for the app this is built on.

## License

GPL-3.0, the same as Mini QR. See [LICENSE](LICENSE). You can use, study, share
and change this program under the terms of the GNU General Public License,
version 3. It comes with no warranty.

Barcodes other than QR are made with [zint](https://sourceforge.net/projects/zint/)
(BSD-3-Clause) and read with [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp)
(Apache-2.0), both from the [zxing-wasm](https://github.com/Sec-ant/zxing-wasm)
build (MIT). Their licence texts and copyright notices ship with the site in
[`third-party-licenses.txt`](public/third-party-licenses.txt), linked from the
barcode view.

The frame fonts come from [Fontsource](https://fontsource.org) packages and are
licensed under the SIL Open Font License 1.1; the font files keep their embedded
license metadata. Icon credits (Tabler Icons, Myna UI Icons) are kept in the
source next to the icons.

## Modifications

Changed by b0r3d from Mini QR v0.33.0 on **2026-10-05**:

- **No requests to other sites.** Removed Vercel Analytics and every other
  runtime request to another host: preset logos are bundled with the app and
  the frame fonts are self-hosted instead of loaded from Google Fonts. Removed
  the changelog dialog, which showed upstream's changelog.
- **Presets.** Replaced upstream's brand presets with four local ones: Plain
  (the default, black on white with a 4-module quiet zone), Rounded, Dots and
  b0r3d Cup. `VITE_DEFAULT_PRESET` is matched case-insensitively.
- **Rebrand.** Name, page title, share tags, PWA manifest, favicon, app icons,
  iOS start-up images, share image and PWA screenshots are now b0r3d QR's, made
  from the b0r3d cup (`pnpm generate-brand-assets`). Upstream's marketing media,
  icon sets and sponsor/star links were removed. Example data and the
  batch-export sample CSVs use `https://b0r3d.org` and reserved
  `example.com` addresses instead of upstream's personal links, and feedback
  links point to this repository.
- **Look.** b0r3d.org's dark palette, Courier headings, glowing title with the
  cup logo, faint scanlines behind the app, and a line saying codes are static
  and never expire. Dark mode is the default; the light/dark/system toggle
  stays. The QR code itself is never tinted by the theme.
- **Footer.** Links back to b0r3d.org and shows the version and build, with
  links to this source code and the license. It is shown on every screen size
  and cannot be turned off. Mini QR is credited here in the README rather than
  on screen (from `0.33.0+b0r3d.4`); its own footer carried no license notice
  and could be hidden with `VITE_HIDE_CREDITS`.
- **Build and hosting.** Production settings in `.env.production`, Node version
  in `.node-version`, response headers (caching and security) in
  `public/_headers`. The service worker no longer precaches fonts, start-up
  images or screenshots. Hashed files under `assets/` keep the host's default
  caching (revalidate every load) rather than a one-year `immutable` rule:
  that rule once cached the page's fallback HTML in place of the app's script
  right after a deploy, leaving a blank page (fixed in `0.33.0+b0r3d.6`).
- **Encoding.** ASCII text is split into numeric, alphanumeric and byte
  segments, whichever is shortest, so numbers, IDs and capitals produce
  smaller codes; text with non-ASCII characters is encoded exactly as before.
  A new "Size (QR version)" setting fixes the version (1-40) so batch exports
  come out the same size, growing only when the data doesn't fit.
- **Scan check.** Every change renders the code as a PNG export would and
  decodes it with the bundled scanner, showing whether it reads back exactly.
  Colour and quiet-zone warnings flag what phone cameras tend to struggle with.
- **What's in this code.** A panel shows the exact stored text, its size in
  bytes, the QR version, error correction and encoding modes. The data field
  warns about web addresses without `https://`, tracking parameters (`utm_*`,
  `fbclid`, `gclid` and similar) and leading or trailing whitespace, each with
  a fix button.
- **Print size.** PNG, JPG and SVG exports (batch included) can be sized in mm
  or inches at 150, 300 or 600 DPI. The DPI is written into the PNG and JPEG
  files and the SVG gets a physical width and height. The panel shows the
  module size and a rough scanning distance, and warns below 0.4 mm modules.
- **Rukus preset.** Rukus the cat (from b0r3d.org's favicon art) joins the
  b0r3d Cup as a logo preset.
- **Logos from a web address** (2026-10-05). Upstream showed a remote logo in
  the preview but silently left it out of downloads when its site doesn't
  allow other sites to use its images (no CORS headers). Now the address is
  fetched once and the image copied in, so downloads always include it; if
  the site refuses, the logo is left out of the preview too and a message
  under the field says to save the image and use Upload image. Saved settings
  keep the address as typed.
- **English only** (2026-10-05). The language picker is gone and the app no
  longer follows a saved or browser language, so nobody can get stuck in a
  language they can't read. Upstream's translations stay in `locales/` but
  aren't loaded.
- **Version in the footer** (2026-10-05). The footer shows the version and
  the build; see Versioning below.
- **Fixes.** The seven type errors in upstream's `vue-tsc` check are fixed, and
  tests were added for the local presets and fonts.
- **Repository.** Upstream's GitHub workflows, Docker and nginx files,
  contributor docs and translation-service config were not carried over.

- **Other barcode types** (2026-10-05). A "Code type" menu above the
  settings (QR code by default) swaps the QR editor for a plain barcode one:
  Data Matrix, GS1 DataMatrix, Aztec, PDF417, EAN-13, EAN-8, UPC-A, Code 128,
  GS1-128, ITF-14 and Code 39. Check digits are added, or checked when typed;
  GS1 data is checked for its syntax and check digits; problems are explained
  under the field. Each code gets the same test decode as QR codes, colours,
  PNG/JPG/SVG downloads, copy, and print sizes with whole-pixel bars. The
  encoder (zxing-wasm, ~730 KB gzipped) is served from this site and loads only
  when a barcode type is picked; the service worker keeps it for offline use.
- **Scanning with ZXing-C++** (2026-10-05). The Scan page used html5-qrcode,
  unmaintained since 2023; it now uses the same zxing-wasm build, so every type
  the app makes scans back, from files, the clipboard or the camera. A scanned
  barcode can be recreated as the same type, and results are labelled using
  the same parser as Data templates (product numbers are never offered as
  phone numbers).
- **Data templates** (2026-10-05). Opening the editor on existing data no
  longer damages it: Wi-Fi security type and escaped characters, SMS messages
  with colons, vCard commas and semicolons, and event times all come back as
  they were. New: GS1 Digital Link product links, IBAN check-digit checks on
  SEPA payments, WPA3-only Wi-Fi. vCard 2.1 marks non-ASCII text as UTF-8,
  company cards get a name (FN), events get a UID, and batch vCards honour
  "4.0" and "2.1" as written in the CSV.
- **Fixes** (2026-10-05). The app keeps working when the browser blocks or
  fills its storage (it used to show a blank page or throw on every edit);
  uploaded logos and backgrounds are shrunk to 1024 / 2048 px; the Background
  checkbox can be turned back on after reloading a transparent code; batch
  export no longer waits a second per row and leaves the editor on the
  previewed row; CSVs separated by semicolons or tabs, or saved in
  Windows-1252, are read correctly; the Scan page no longer adds a paste
  listener on every visit.
- **Lighter page** (2026-10-05). The scanner and JSZip load only when used:
  the main script is 642 KB instead of 1,058 KB (225 KB gzipped instead of
  348 KB).
- **Content-Security-Policy** (2026-10-05). The built page carries a policy
  that only allows scripts from this site (plus the visitor-stats beacon), so
  the browser enforces "nothing from other sites"; `public/_headers` adds a
  Permissions-Policy (camera only) and COOP. The bot-detection snippet the
  host adds to every b0r3d.org page is blocked by it on purpose; `verify:site`
  lists those blocks without failing.
- **Recent codes** (2026-10-07). The last 20 codes you download, copy or
  save (QR codes and other barcodes, not batch exports) are kept in this
  browser and listed under "Recent codes", where each can be opened again
  with its data and settings, deleted, or all cleared. Making the same data
  again replaces the older entry, so the list holds 20 different codes.
  They live in IndexedDB, not localStorage: localStorage holds about 5
  million characters per site and already keeps the current design, so a
  few codes with logos would fill it. Each entry is a few KB plus its logo
  (logos and frame backgrounds over 2 MB aren't kept). Nothing is sent
  anywhere. The first code added shows a note saying so, with a button to
  stop; the list has the same switch. A Wi-Fi code with a password is listed
  by network name only, with no picture of the code. The browser may still
  delete the list (clearing site data, closing a private window, or Safari
  after days without a visit), and the list says so. The saved design no
  longer includes the data, which was never read back, so clearing the list
  removes every code kept. `VITE_DISABLE_LOCAL_STORAGE=true` turns Recent
  codes off too. Also fixed along the way: opening two framed configs in a
  row lost the frame, a loaded config could keep the previous frame's
  background image or font, and a download within half a second of typing
  exported the previous data.
- **Space around logos** (2026-10-06). A "Logo space (modules)" setting, 1
  module by default, leaves blank space between a centre logo and the dots.
  It replaces "Image margin (px)", which defaulted to none and was measured in
  pixels of the preview rather than modules of the code. The space comes out
  of the square cleared for the logo instead of being added around it: in
  test decodes, clearing one more module on each side made every version 1
  and 2 code at level Q unreadable. A note under the field gives the logo's
  size in modules; a larger Size (QR version) makes room for a bigger logo
  with the same space. Configs saved before load as before, with the default
  space.

Ideas under consideration are in [TODO.md](TODO.md).

## Versioning

Versions look like `0.33.0+b0r3d.3`: the Mini QR release this is built on,
then b0r3d's own release count on top of it. The `+` is semver's build
metadata, meaning "0.33.0 with these changes", not a release before or after
it.

- Each release of this site bumps the number after `b0r3d.` in
  `package.json`.
- Moving to a newer Mini QR changes the first part and starts the count again
  at 1, e.g. `0.34.0+b0r3d.1`.

The footer shows the version and the **build**: the commit the site was built
from. The build is filled in automatically and is never bumped by hand. The
footer's Source link goes to this repository.

| Version          | Date       | What changed                                                   |
| ---------------- | ---------- | -------------------------------------------------------------- |
| `0.33.0+b0r3d.1` | 2026-10-04 | First release on qr.b0r3d.org                                  |
| `0.33.0+b0r3d.2` | 2026-10-05 | Logos from a web address, English only                         |
| `0.33.0+b0r3d.3` | 2026-10-05 | Version and build shown in the footer                          |
| `0.33.0+b0r3d.4` | 2026-10-05 | Footer trimmed to one line, Mini QR credit moved to the README |
| `0.33.0+b0r3d.5` | 2026-10-05 | Other barcode types, ZXing-C++ scanning, data template fixes   |
| `0.33.0+b0r3d.6` | 2026-10-05 | Fix a blank page after deploys (asset caching)                 |
| `0.33.0+b0r3d.7` | 2026-10-07 | Recent codes, clear space around centre logos                  |
| `0.33.0+b0r3d.8` | 2026-10-08 | The build number in the footer is plain text (Source links the code) |
| `0.33.0+b0r3d.9` | 2026-10-09 | Data templates dropdown menu next to presets                   |

## Development

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm dev              # http://localhost:5173
pnpm lint
pnpm type-check
pnpm vitest run       # unit tests (some run in headless Chromium)
pnpm test:e2e         # Playwright end-to-end tests
pnpm build            # production build in dist/
```

`pnpm generate-brand-assets` rebuilds the icons, start-up images, share image
and cup preset logo from `b0r3d-brand/cup.png`.

Two end-to-end checks run against a production build in headless Chromium:

```sh
pnpm build
pnpm verify:static    # exports a URL, emoji text and Wi-Fi as PNG + SVG and
                      # checks the decoded payloads match the input byte for byte
pnpm verify:site      # manifest, service worker, offline reload, presets, fonts,
                      # every export, scanning, a barcode made and scanned back,
                      # Content-Security-Policy; fails on any request to another site
```

Without an argument they serve `dist/` themselves; pass a URL (for example
`pnpm verify:site https://qr.b0r3d.org`) to check a deployed copy instead.

## Building for production

`pnpm build` writes a fully static site to `dist/`, meant to be served from the
root of the domain. The production defaults live in `.env.production` (no
secrets); `.env.example` lists the other build-time options. `public/_headers`
holds the response header rules and is copied to `dist/_headers`.
