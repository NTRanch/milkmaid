# Changelog — Milkmaid

All notable changes, newest first. Format: Keep a Changelog.

## [1.0.0] — 2026-10-30

"Milk, Made Service", playable end to end in one self-contained
`web/index.html` (39,470 B, no wasm — the Mojo route's named seam).

- **The service round:** hold to work the active method; switch among
  pinch, clamps, pump suction, and cups (keys 1–4), each with its own
  response curve — pressure rate, trickle, let-down share, heat gain,
  arousal threshold, addressing — acting on one stateful body:
  per-side volume and capacity, production, heat-shaped efficiency.
- **Let-down in-body:** when arousal crosses the active method's
  threshold, the culmination lands in that method for 3.84 s; the
  session record, the banner, and the chart all name the method, and
  each let-down grows her (+350 µL capacity per addressed side).
- **The fluid timeline:** yield is an integer microlitre ledger,
  sampled live into the round's own curve on the play screen and
  archived per round on the chart screen; lifetime totals persist.
- **Three rounds:** Morning Round (240 ml), The Full Circuit (420 ml,
  ≥3 methods), Made Service, In Full (600 ml, all 4 methods) — the
  circuit requirement is part of the win, judged on the trigger step.
- **Nine screens:** 18+ gate, title, how to serve, play, pause,
  settings (unhurried clock, large text — never gated), victory,
  game over, the chart. Settings + lifetime chart archive persist via
  core bridges; generated WebAudio cues answer input only.
- **Mojo kernel of record:** `src/kernel.mojo` (Tiger Style Mojo)
  defines the math; the shipped JS transliteration is proven against
  it by conformance vectors (14 scenarios, 30 checkpoints, exact) —
  the kernel itself is unexecuted (no toolchain in the sandbox),
  recorded honestly in `docs/BREAKAGE-LOG.md` B-1.
- **Gates:** 14 unit tests (half validation, half adversarial, incl.
  exact volume conservation and culmination-boundary switch
  semantics); demo playtest serves all three rounds; 0.010 ms/step;
  per-round preview MP4s; D-221 visual gate PASS.

## [Unreleased]

- Repo scaffolded 2026-10-30: bloch roadmap (kind=game, lane=restricted),
  planning, per-game skill, baseline Mojo config, NTRanch-themed mdBook,
  brand-asset slots.
