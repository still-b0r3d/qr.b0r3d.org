# TODO

## Maybe

Ideas worth considering, not decided yet. Both came from comparing the app
with [zint](https://github.com/zint/zint).

### Mark non-Latin text as UTF-8 (ECI 26)

- **What:** the QR standard (ISO/IEC 18004) treats byte-mode data as
  ISO-8859-1 unless an ECI designator says otherwise. zint adds ECI 26 (UTF-8)
  whenever the text isn't Latin-1. This app sends UTF-8 bytes with no
  designator and relies on readers guessing the character set. That works in
  our tests (`pnpm verify:static` decodes emoji and CJK text byte for byte),
  but it is not what the standard asks for.
- **Why maybe:** standards-correct Unicode, and less risk of garbled text on
  readers that assume Latin-1 or Shift JIS.
- **Risk:** some older readers mishandle ECI or show the designator as text.
  Test on real phones before shipping: iOS Camera, Google Lens, Samsung
  Camera, a few older Android scanner apps and in-app scanners (WeChat,
  WhatsApp). Consider an opt-in setting rather than a default.
- **How:** only for data with non-ASCII characters; ASCII data stays exactly
  as it is. The current encoder (`qrcode-generator`) can't emit ECI segments,
  so this needs a small MIT-licensed encoder that can (for example
  `qrcodegen`) or zint. `src/lib/qr-code/matrix.ts` is the only place that
  talks to the encoder.
- **Done when:** the phone checks pass, `pnpm verify:static` still matches
  byte for byte, and a unit test asserts the ECI header for non-ASCII input.

### Other barcode types

- **What:** static barcodes other than QR: Data Matrix, Aztec, PDF417,
  Code 128 / GS1-128, EAN-13 / UPC-A, ITF-14. Useful for product labels,
  shipping, inventory and tickets.
- **Options:**
  - zint's encoding library (C, BSD-3-Clause, compatible with GPL-3.0)
    compiled to WebAssembly with Emscripten. The normal `pnpm build` has no
    Emscripten, so the `.wasm` would be committed together with a script that
    rebuilds it.
  - `bwip-js` (pure JavaScript, MIT, ~100 barcode types): no build step.
- **Decisions and costs:**
  - The site stops being only a QR generator.
  - The QR styling (dots, corners, logo, frame) doesn't apply; these would
    export plain black on white.
  - The encoder should load only when a non-QR type is picked, so the QR
    page doesn't get heavier.
  - The Scan page would need to recognise the new types too.
  - Both licenses require shipping the copyright notice (which names the
    library's author) with the site, e.g. a licenses file. That is an
    exception to the "no personal names" rule for visitor-facing material.
  - Everything stays bundled locally; `pnpm verify:site` must still report
    no requests to other sites.

### Not planned

Also looked at and left out: Micro QR and rectangular Micro QR (most phone
cameras, and our own Scan page, can't read them), structured append (phone
scanners ignore it), manual mask selection, and extra export formats such as
EPS and EMF (SVG covers nearly everyone; EPS or PDF for plain codes could be
added later without zint).
