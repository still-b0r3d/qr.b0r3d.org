# qr.b0r3d.org

**b0r3d QR** is b0r3d's QR code generator and scanner: <https://qr.b0r3d.org>.

It makes **static QR codes only**. Whatever you type is encoded straight into
the pattern, so there is no redirect link, no account and nothing that can ever
expire. The app runs entirely in your browser: codes are drawn and exported on
your device, and the app loads nothing from any other site (except a logo
address you enter yourself). Like the rest of b0r3d.org, the site counts
visits; that never includes what you type.

- Text, URLs, email, phone, SMS, Wi-Fi, vCard, location, calendar events and
  EPC (SEPA) payments
- Export to PNG, JPG, SVG and plain-text QR codes, or copy to the clipboard
- Batch export from a CSV file
- Frames with captions, logos, colours and dot styles; save and load settings
- Compact encoding (numbers and capitals take fewer modules) and an optional
  fixed size, so every code in a batch matches
- Checks that each code scans (a test decode in your browser) and warns about
  low contrast, inverted colours and a missing quiet zone
- Shows exactly what a code stores, and flags links without `https://`,
  tracking parameters and stray spaces, with one-click fixes
- Export at a print size (mm or inches) and DPI, with module-size and
  scanning-distance guidance
- Scan codes from an image, the clipboard or the camera
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
- **Footer.** Links back to b0r3d.org and credits Mini QR, the license and this
  source code. It is shown on every screen size and cannot be turned off.
- **Build and hosting.** Production settings in `.env.production`, Node version
  in `.node-version`, response headers (caching and security) in
  `public/_headers`. The service worker no longer precaches fonts, start-up
  images or screenshots.
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
from, linked to its source on GitHub. The build is filled in automatically
and is never bumped by hand.

| Version          | Date       | What changed                           |
| ---------------- | ---------- | -------------------------------------- |
| `0.33.0+b0r3d.1` | 2026-10-04 | First release on qr.b0r3d.org          |
| `0.33.0+b0r3d.2` | 2026-10-05 | Logos from a web address, English only |
| `0.33.0+b0r3d.3` | 2026-10-05 | Version and build shown in the footer  |

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
                      # every export, scanning; fails on any request to another site
```

Without an argument they serve `dist/` themselves; pass a URL (for example
`pnpm verify:site https://qr.b0r3d.org`) to check a deployed copy instead.

## Building for production

`pnpm build` writes a fully static site to `dist/`, meant to be served from the
root of the domain. The production defaults live in `.env.production` (no
secrets); `.env.example` lists the other build-time options. `public/_headers`
holds the response header rules and is copied to `dist/_headers`.
