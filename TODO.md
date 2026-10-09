# TODO

## Maybe

Ideas worth considering, not decided yet.

### Test the UTF-8 marker (ECI 26) on real phones

- **What:** since 1.0 the QR settings have an opt-in "Mark the text as
  UTF-8 (ECI 26)" (zint makes the grid, see `src/lib/qr-code/eci.ts`). It is
  off by default because some older readers mishandle ECI or show the
  designator as text.
- **To do:** scan marked codes with iOS Camera, Google Lens, Samsung Camera,
  a few older Android scanner apps and in-app scanners (WeChat, WhatsApp).
  If they all read it, consider turning it on by default for text that
  isn't plain ASCII.

### Vector PDF

- **What:** PDF exports are a lossless image at the print size. Bars and
  modules as PDF shapes would stay sharp at any size, like the SVG.
- **How:** barcodes are only rectangles and text, so they are easy. QR codes
  are harder: rounded dots and corners (SVG arcs to Bézier curves), logos
  (images) and frame captions (fonts to embed).

### Swiss QR-bill

The Swiss payment QR needs structured addresses, QR-IBAN/reference rules and
the Swiss cross in the middle; `swissqrbill` (MIT) could build and check it.
Left out for now as it's Switzerland-only.

### Not planned

Also looked at and left out: Micro QR and rectangular Micro QR (zint can make
them, but most phone cameras can't read them), structured append (phone
scanners ignore it), manual mask selection, and EPS or EMF exports (SVG and
PDF cover nearly everyone).
