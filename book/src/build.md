# Build & Delivery — Milkmaid

**Language:** Mojo (tiger-style-mojo)

**Delivery shape:** Named seam: Mojo has no credible browser/wasm target. Mojo authors the numerical kernel as the reference implementation, generates the entry's data tables, and ships a JS transliteration checked against the Mojo reference by a conformance test. Toolchain home: sandbox.

**Jam rule:** one self-contained `index.html`, ≥6 screens (Title / Pause /
How to Play / Gameplay / Settings / Game Over-or-Victory), documented
process (GAMEOTRON orchestrates; the language build chain is part of the
documentation).

**Book:** `mdbook build book` renders this planning book to `book/html/`
with the NTRanch theme (dark background, hot pink).

## As built (v1.0.0, 2026-10-30)

- `src/kernel.mojo` — the reference kernel (Tiger Style Mojo): the
  seven-operation step, the method/level tables, the efficiency curve,
  the FNV-1a state digest. Authored as the source of record; **not
  executed** — no Mojo toolchain is installed in the sandbox (pixi pin
  `mojo ==0.25.6.1` recorded in `pixi.toml`). See breakage B-1.
- `core/kernel.mjs` — the shipped transliteration, a checked copy of
  the kernel: integer-only state, identical step order and tables.
- `tools/gen-vectors.mjs` — an independent second transcription that
  derives `conformance/vectors.json` from the kernel contract (14
  scenarios, 30 checkpoints, efficiency + RNG vectors).
  `tools/conformance.mjs` runs the shipped kernel against every vector
  and demands exact equality — that, plus hand-derived anchors in
  `tools/tests.mjs`, is the gate that makes the seam honest.
- `web/game.mjs` + `web/shell.html` — the game layer (9 screens,
  draw-list protocol on a 960×960 canvas, demo policy) and the
  browser shell (input, WebAudio cues answering input only,
  localStorage settings + chart archive through the core bridges).
  `tools/assemble.mjs` inlines both modules into `web/index.html`
  (39,470 B, no wasm — the capture loads the same `.mjs` modules the
  page inlines).
- Gates (`just check`): table/vector regeneration, conformance, 14
  unit tests, settings/archive bridge check, perf (0.010 ms/step),
  demo playtest (all three rounds served). Previews
  (`just previews`) render `docs/previews/level-<n>-milkmaid.mp4`
  from the shipped core's demo mode.
