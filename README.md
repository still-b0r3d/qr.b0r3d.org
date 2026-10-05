# qr.b0r3d.org

**b0r3d QR** is b0r3d's QR code generator and scanner: <https://qr.b0r3d.org>.

It makes **static QR codes only**. Whatever you type is encoded straight into
the pattern, so there is no redirect link, no account and nothing that can ever
expire. The app runs entirely in your browser: codes are drawn and exported on
your device, and the page loads nothing from any other site.

- Text, URLs, email, phone, SMS, Wi-Fi, vCard, location, calendar events and
  EPC (SEPA) payments
- Export to PNG, JPG, SVG and plain-text QR codes, or copy to the clipboard
- Batch export from a CSV file
- Frames with captions, logos, colours and dot styles; save and load settings
- Scan codes from an image, the clipboard or the camera
- Installs as an offline app; available in 30+ languages

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
- **Fixes.** The seven type errors in upstream's `vue-tsc` check are fixed, and
  tests were added for the local presets and fonts.
- **Repository.** Upstream's GitHub workflows, Docker and nginx files,
  contributor docs and translation-service config were not carried over.

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

## Building for production

`pnpm build` writes a fully static site to `dist/`, meant to be served from the
root of the domain. The production defaults live in `.env.production` (no
secrets); `.env.example` lists the other build-time options. `public/_headers`
holds the response header rules and is copied to `dist/_headers`.
