# Build & Delivery — Milkmaid

**Language:** Mojo (tiger-style-mojo)

**Delivery shape:** Named seam: Mojo has no credible browser/wasm target. Mojo authors the numerical kernel as the reference implementation, generates the entry's data tables, and ships a JS transliteration checked against the Mojo reference by a conformance test. Toolchain home: sandbox.

**Jam rule:** one self-contained `index.html`, ≥6 screens (Title / Pause /
How to Play / Gameplay / Settings / Game Over-or-Victory), documented
process (GAMEOTRON orchestrates; the language build chain is part of the
documentation).

**Book:** `mdbook build book` renders this planning book to `book/html/`
with the NTRanch theme (dark background, hot pink).
