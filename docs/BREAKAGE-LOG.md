# Breakage log — Milkmaid

Every breakage found in playtest or build lands here with: what broke, the
evidence, the bloch attempt id, and the fix or the filed finding. Copied to
bloch at the week's close (the log is the input, bloch is the record).

## B-1 — The Mojo kernel was authored but never executed (honesty entry)

`src/kernel.mojo` is the reference implementation and the source of
record for the game's math, but no Mojo toolchain is installed in the
sandbox (and Mojo has no wasm/browser target — D-335's named seam).
The kernel has NOT been run. What gates the shipped JS instead:
conformance vectors (`conformance/vectors.json`) produced by an
independent second transcription of the kernel, compared exactly by
`tools/conformance.mjs`, plus hand-derived numeric anchors inside the
unit tests. The pixi pin (`mojo ==0.25.6.1`) is recorded in
`pixi.toml`. Follow-up: when a Mojo toolchain lands in the estate, run
the kernel against the same vectors; any drift fails the seam loudly,
by design.

## B-2 — Seahawk playtest pass not run (primo-bound)

The closing ritual's seahawk pass (GJ-08) needs primo; the
sandbox→primo tunnel was down for the entire build night (last OK
2026-10-30 03:10 PDT). The sandbox automated playtest stands in as the
playtest of record (`docs/PLAYTEST-2026-10-30.md`); the seahawk pass
remains a named follow-up, not a silently skipped step.

## B-3 — GJ-07 / R-904 stays OPEN (live-entry-bound)

Setting the itch 18+ flag, listing content warnings, and passing the
itch ToS screen are live-entry acts taken on the Owner's word when
week 10's jam clock starts. The in-game 18+ gate ships as the first
screen; the entry-side acts are not this build's to take.

## B-4 — Round 3 retuned during gating (design point was unreachable)

As first designed, round 3 asked 650 ml at production 26 µL/step/side.
Model-exact simulation of the strongest rotation schedule totals
650,004 µL — the target sat exactly at the theoretical ceiling with
zero slack for a human player. Retuned before release: target
600,000 µL, production 28 µL/step/side. The demo policy now completes
the round at step 12,382 of 13,125 (94%), and the numbers are the ones
recorded in `src/kernel.mojo`, `tables/method-tables.json`, and the
design chapter's contract.

## B-5 — Gauge labels overlapped on the play screen (found at D-221, fixed)

First preview capture: the PRESSURE and AROUSAL gauge labels collided
("PRESS…SE"). Labels moved apart (x 430→410, 484→492) and set at 16 px;
previews re-rendered from the fixed build and re-inspected — PASS.
Filed under bloch R-303's gate.

## B-6 — Preview rasteriser renders "2" close to "5" (filed, not forked)

Frames from the final preview MP4s show the 420.0 ml target reading
as "450.0": the shared estate preview rasteriser's 5×7 bitmap "2" is
nearly a "5" at 480 px. The underlying data is proven correct
(conformance, playtest, unit tests), and the shipped page renders
text with a real canvas font, so players never see the bitmap font.
The rasteriser is shared by every jam entry's previews; it was copied
verbatim per the program contract and deliberately not forked for one
glyph.

## B-7 — Persistence scope (design ruling, recorded)

What persists across sittings: the two settings and the lifetime chart
aggregates (rounds, total yield, let-downs, best round). What does
not: an individual round — a service round is one sitting, held
in-core. This mirrors the program's other entries and is stated
plainly here so the port-back's save-model note rests on a ruling, not
an accident.
