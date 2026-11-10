> **Game page:** the full storefront page for this game lives at [docs/GAME-PAGE.md](docs/GAME-PAGE.md).

# Milkmaid

**Nice Thoughts Ranch** · Torogao Jam Program week 10 (Wave C — Mini-games: the Crescendo set) · Alma · **Mojo**

Milk, Made Service — the jam takes a shorter public name and keeps the canon game whole inside.

An 18+ game built for the weekly Gameotron jam on itch.io (NTRanch), as one
rung of the 14-week Torogao system-validation program (D-333/D-334/D-335/D-336).
The full planning book lives in [`book/`](book/) (mdBook, NTRanch theme);
this repo's bloch roadmap is [`.ai/roadmap.md`](.ai/roadmap.md).

- **Delivery:** one self-contained `index.html` (see `docs` in the book).
- **Cast/art law (D-292):** existing keeper art only; a missing asset is an
  abstract stand-in, logged — never a generation job.
- **Quality bar:** Laplace3D-class animation or the medium's equivalent
  (book chapter: Quality Bar).
- **Audio:** nothing is ever played aloud by an agent; the Owner presses play.

Status: **v1.0.0** (2026-10-30) — the full mechanism group playable in
`web/index.html`; bloch 22/23 (GJ-07, R-904, stays open until the live
itch entry). The jam clock for this entry starts on the Owner's word
for week 10.

## Play

Open `web/index.html` in a browser — no server, no build. Or serve the
folder: `python3 -m http.server -d web`.

You run a maid-service round. HOLD (canvas, or hold SPACE) to work the
active method; switch the circuit with keys **1–4** — pinch, clamps,
pump suction, cups — each with its own response curve on one stateful
body; **TAB** addresses the other side. Pressure builds, arousal
follows it upward through the heat-shaped efficiency curve, and when
she lets down, the flow lands in whichever method is active — and the
chart names it. Every let-down also grows her (+0.35 ml capacity per
addressed side), filed in the chart with the round's full fluid
timeline.

| Control | Action |
|---|---|
| Hold canvas / SPACE | Work the active method (also confirms menus) |
| 1 / 2 / 3 / 4 | Switch to pinch / clamps / pump suction / cups |
| TAB or Q | Address the other side |
| ↑ / ↓ | Menu cursor · round picker |
| ENTER | Confirm |
| P or ESC | Pause / back |

## The rounds

| # | Round | Clock | Yield target | Circuit required |
|---|---|---|---|---|
| 1 | Morning Round | 2:30 | 240.0 ml | — (learn her) |
| 2 | The Full Circuit | 3:00 | 420.0 ml | let-downs in ≥3 methods |
| 3 | Made Service, In Full | 3:30 | 600.0 ml | let-downs in all 4 methods |

Yield at target is not enough on rounds 2–3: the circuit requirement
is part of the win, judged on the trigger step itself. The chart
screen archives every round of the sitting; lifetime totals (rounds,
yield, let-downs, best round) persist in the browser.

## Previews

Demo-mode captures rendered from the shipped core (12 s each):

- [Round 1 — Morning Round](docs/previews/level-1-milkmaid.mp4)
- [Round 2 — The Full Circuit](docs/previews/level-2-milkmaid.mp4)
- [Round 3 — Made Service, In Full](docs/previews/level-3-milkmaid.mp4)

## Develop

The Mojo route (D-335): `src/kernel.mojo` is the reference kernel and
the source of record for the math; `core/kernel.mjs` is its shipped JS
transliteration, proven against the kernel by conformance vectors
(`conformance/vectors.json`, derived by an independent second
transcription). The Mojo kernel itself has not been executed — no
toolchain is installed — and that fact is recorded, not papered over
(`docs/BREAKAGE-LOG.md`, B-1).

```sh
just build     # assemble web/index.html
just check     # tables + vectors + conformance + tests + bridges + perf + playtest
just previews  # re-render docs/previews/*.mp4 from the shipped core
just book      # render the planning book
```

Gates at v1.0.0: conformance exact (14 scenarios, 30 checkpoints);
unit tests 14/14 (half validation, half adversarial); demo playtest
serves all three rounds; 0.010 ms/step; D-221 visual gate PASS
(`docs/PLAYTEST-2026-10-30.md`).
