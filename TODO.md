# TODO

## Maybe

Ideas worth considering, not decided yet.

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
- **How:** zint now ships with the app (zxing-wasm, used for the other
  barcode types), and its writer takes an `eci=26` option; with no option it
  adds ECI 26 by itself for text that isn't Latin-1, and uses Kanji mode for
  Japanese. Writing with `scale: 1, addQuietZones: false` returns the bare
  module grid, which the QR styling could draw from in place of
  `qrcode-generator` (`src/lib/qr-code/matrix.ts` is the only place that talks
  to the encoder). The catch: zint then loads with the QR page, about 350 KB
  gzipped for the writer alone, so only do it for non-ASCII text, loaded on
  demand.
- **Done when:** the phone checks pass, `pnpm verify:static` still matches
  byte for byte, and a unit test asserts the ECI header for non-ASCII input.

### More for the other barcode types

- **Batch export** from a CSV, as QR codes have.
- **UPC-E and ISBN**: zint makes both; UPC-E needs its own check-digit rules
  for the test decode, and ISBN-10 input is converted to a 978 EAN-13.
- **Bar height** for 1D codes (zint's default is 50 modules; GS1's EAN-13
  spec is taller). zxing-wasm doesn't pass a height option through, so it
  would mean scaling the SVG's bars, not its text.
- **Swiss QR-bill**: the Swiss payment QR needs structured addresses,
  QR-IBAN/reference rules and the Swiss cross in the middle; `swissqrbill`
  (MIT) could build and check it. Left out for now as it's Switzerland-only.

### Not planned

Also looked at and left out: Micro QR and rectangular Micro QR (zint can make
them, but most phone cameras can't read them), structured append (phone
scanners ignore it), manual mask selection, and extra export formats such as
EPS and EMF (SVG covers nearly everyone; EPS or PDF for plain codes could be
added later).
