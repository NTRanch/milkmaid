# Mojo — game-development libraries & tooling research

| | |
|---|---|
| **Language** | Mojo (Modular) — installed per-project via pixi (`pixi.toml` pins the compiler), or via the `mojo` PyPI package: https://pypi.org/project/mojo/0.25.6.1/ |
| **Role in the program** | **Authoring-time numerical kernels only — Mojo ships nothing.** W3 *Blushline*: the channel response-curve kernel (blush ramp + gaze channels) and its fit against the D-4 measurements. W10 *Milkmaid*: the fluid-timeline / stateful-anatomy simulation kernel. In both weeks Mojo is the **reference implementation**: it generates the game's data tables and the golden conformance vectors; the shipped game is a JS transliteration of the kernel, proven against Mojo's outputs by the conformance harness (§2h). |
| **Delivery shape** | No Mojo artifact reaches the player. Outputs of a Mojo week: (1) Mojo kernel source (the reference, kept in the repo), (2) generated data tables (JSON), (3) golden input→output vectors, (4) the JS transliteration + harness report. The single-file `index.html` contains only the JS side. |
| **Researched** | 2026-10-30, against Modular's official docs and project pages, the PyPI distribution page, and Modular's open-source repository (URLs inline). |

**Verdict up front.** Mojo is a compiled systems/AI language — Python-shaped syntax, MLIR/LLVM compilation, first-class SIMD and GPU kernel programming — that has been fully open-sourced under Apache 2.0 (with LLVM exceptions), compiler and tooling included (https://pan.parallax.kr/article/mojo-programming-language-now-fully-open-source; source: https://github.com/modular/modular.git). It is genuinely excellent at the one thing we ask of it — small, fast, inspectable numerical kernels — and it has **no game stack at all**: no renderer, no audio, no UI, no asset pipeline, and **no credible WebAssembly target** (§5.1). That is not a deficiency in this program's design; it is the design. Mojo weeks are measurement-and-model weeks whose outputs are data.

A maturity warning that shapes everything below: Mojo is young and fast-moving — it reached a 1.0 beta line in 2026 and "the standard library still changes between releases" (https://amitxshukla.github.io/Mojo/gettingstarted.html). Every Mojo artifact is therefore pinned to an exact compiler version in `pixi.toml`, and the conformance vectors — not the source — are the durable contract.

---

## 2. Parts matrix

For each part of a full game: the concrete Mojo answer, or **NONE** stated plainly.

### (a) Rendering 2D

**NONE. Mojo renders nothing.** There is no window, canvas, sprite, or draw API in Mojo or its standard library, and no game-oriented rendering library in its ecosystem. The official installation story is a compiler for macOS/Linux hosts (Windows only via WSL; the PyPI page notes "Not available for Windows" — https://pypi.org/project/mojo/0.25.6.1/). In W3 and W10 the pixels belong to the JS shell and the estate's presentation layer; Mojo's curves arrive as tables the shell interpolates. Any architecture that needs Mojo *in* the render loop is dead on arrival — see §5.1.

### (b) Sprite & skeletal animation playback

**NONE.** No animation runtime, no rig format support (no Spine/DragonBones/Live2D loaders), no tween library. Mojo's contribution to animation is one step removed: the **curves** that animation systems evaluate — easing/response functions fitted and tabulated by the kernel, then baked into tables at a stated sample rate so the JS side needs nothing but lerp (see the face-channel register, §3).

### (c) Audio

**NONE — not applicable, by design.** No audio I/O of any kind. Mojo also does not *analyse* audio for this program: W8's audio-reactive sync is a Zig week, and estate audio verification is file-metrics work in established tooling. If a future week wanted Mojo-fitted *envelope curves* for audio-reactive animation, that is the same table-generation pattern as §2e — the kernel would fit numbers, never touch sound.

### (d) UI / dialogue

**NONE.** No GUI toolkit ships with Mojo, and no Mojo UI library was verified in this research. Dialogue is doubly out of scope: the words, the face codes and the scene semantics are canon content authored in the game's own pipeline. Mojo never sees a line of dialogue.

### (e) State machines & simulation — **the one real row**

This is Mojo's actual job in the program. There is no simulation *framework*; there is a language unusually well-equipped to write the kernels a simulation is made of:

| Capability | Concrete source | Notes for our kernels |
|---|---|---|
| Typed scalar/vector numerics | Mojo standard library: `SIMD` vector types with hardware width queryable at compile time (`simdwidthof`), a full `math` module (`Mojo/stdlib/std/math/` in the open repo — surveyed at https://deepwiki.com/modular/modular/2-mojo-language-core) | Response curves and fluid integration are elementwise math over channel vectors — a natural SIMD shape, though at our table sizes (hundreds of samples) raw speed is irrelevant; **clarity and exactness** are the reasons for Mojo, not throughput. |
| Vectorisation / parallelisation | stdlib `algorithm`: `vectorize`, `parallelize` higher-order functions (usage surveyed at https://puzzles.modular.com/puzzle_23/benchmarking.html and the matmul walkthrough at https://nbviewer.org/github/hainm/mojo/blob/main/examples/notebooks/Matmul.ipynb) | Available if a fit ever gets large. **Conformance caution**: parallel reductions can reorder floating-point operations run-to-run; table generation therefore runs in a fixed evaluation order (scalar or fixed-width vectorised, single-threaded) so the golden vectors are reproducible bit-for-bit on one machine, and stable to tolerance across machines (§2h). |
| Compile-time specialisation | Mojo parameters (`@parameter`, parametric functions/types) | Curve families are specialised per channel at compile time (blush vs gaze-x vs gaze-y share one parametric kernel, three instantiations) — the kernel source stays a single readable reference. |
| State-machine structure | Hand-written, in the kernel: explicit state structs + a `step` function over a fixed dt | Deliberately boring. The W10 fluid model is a small state vector integrated stepwise; Mojo gives us typed structs, value semantics and no hidden allocation behaviour to write it in. No library is wanted — a framework would only obscure the reference. |
| Deterministic RNG (for jitter/perturbation studies in fitting) | **Write it in-kernel** (splitmix64 / LCG, ~20 lines, seeded) | A design rule, not a gap complaint: conformance demands the *same* seed produce the *same* stream in Mojo and in JS. A hand-rolled integer RNG is exactly reproducible in both; any stdlib random source is an unverifiable black box across the language boundary. |

### (f) Persistence

**Not applicable at runtime; trivial at authoring time.** The kernel's inputs and outputs are files: parameter sets in, tables and golden vectors out. Mojo's file I/O plus its Python interoperability (Mojo can import and call Python modules — interoperability is a headline design goal; see Modular's FAQ at https://docs.modular.com/mojo/faq/#why-not-make-julia-better) cover JSON reading/writing without ceremony. The pragmatic split used by both Mojo weeks: **Mojo computes; a thin Python or Mojo driver emits JSON** in the exact schema the JS harness consumes. The schema is ours (§3) and versioned with the kernel.

### (g) Asset pipeline

**Mojo's pipeline role is table generation, full stop.** The flow for both Mojo weeks:

```
canon parameters / D-4 measurements (JSON in)
        │
        ▼
Mojo kernel  ──►  fitted curves ──►  sampled tables (JSON) ──► shipped in index.html
        │                                    │
        └──►  golden vectors (JSON) ──► conformance harness (§2h)
```

No image, audio, or rig asset passes through Mojo. Table format rules (ours): sample rate and range stated in the file header; values emitted at full `Float64` precision, rounded only by the consumer; every table carries the kernel's source hash and Mojo version, so a stale table is detectable at a glance.

### (h) Build tooling, testing, conformance

| Piece | Concrete tool | Notes |
|---|---|---|
| Project & version pin | **pixi** — `pixi init -c https://conda.modular.com/max/ -c conda-forge`, `pixi add mojo`; the compiler version is pinned in `pixi.toml` per project (https://amitxshukla.github.io/Mojo/gettingstarted.html; Modular's own projects drive everything through pixi tasks — https://puzzles.modular.com/howto.html) | The pin is load-bearing: stdlib churn (§1) means an unpinned Mojo kernel is a future conformance failure. The `mojo` PyPI package (https://pypi.org/project/mojo/0.25.6.1/) is the alternative install for Python-heavy hosts; pixi is the estate default. |
| Build / run | The `mojo` CLI: `mojo run file.mojo`, `mojo build` (native executable), `mojo format`, `mojo doc`, `mojo package` (`.mojopkg`) — command surface per https://amitxshukla.github.io/Mojo/gettingstarted.html | Kernels ship as source + a built driver binary for regeneration; nobody needs the binary to *play* anything. |
| Testing the kernel | **`mojo test`** (CLI) with the stdlib `testing` assertions; Modular's own puzzle suite is organised as per-problem tests run via pixi tasks (https://puzzles.modular.com/howto.html) | Kernel unit tests cover: curve endpoints and monotonicity (blush is monotonic — D-4 measured it so), conservation-style invariants for the fluid model (volume never negative, rates bounded), and fixed-seed reproducibility (same inputs → identical table hash). |
| Benchmarking | stdlib `benchmark` module (`Bench`/`Bencher`/`BenchConfig`) — https://puzzles.modular.com/puzzle_23/benchmarking.html | Used once per kernel to record that table generation is comfortably cheap (whole W10 regeneration should be seconds, not minutes); performance is *not* a selection criterion here and the chapter does not pretend otherwise. |
| **Conformance harness (estate-built, the week's real deliverable)** | A Node test runner (plain JS, no framework dependency beyond the week's shell) that: loads the golden vectors; runs the JS transliteration on each input; compares per-channel with stated tolerances | Tolerances are **per quantity, stated in the vector file**: fitted-curve outputs (both sides `Float64`, same operation order mandated in the transliteration style guide) — absolute 1e-9 / relative 1e-6 as the starting gate, loosened only with a written reason; fluid-timeline state after N steps — relative 1e-6 per state variable, plus hard invariants (non-negativity, monotonic cumulative totals) checked exactly. The harness also checks the *tables* against the kernel outputs directly (the shipped data is what the player experiences; the transliteration is only the fallback path where a curve must be evaluated live). A harness failure blocks the week exactly like a failed gate anywhere else in the estate. |
| Style gate | The estate's Tiger Style Mojo guide applies to all kernel code; `mojo format` is the formatter of record | Kernels are reference implementations — they are read more than they are run, and are held to reference readability. |

---

## 3. Write-from-scratch register

In Mojo's case the register is inverted: **the kernels are the from-scratch work**, and the rest of the game's systems are explicitly *not* Mojo's. Both halves are recorded.

### Written from scratch *in Mojo*

| System | Why from scratch | Layer | Rides on |
|---|---|---|---|
| **Channel response curves** (W3: blush ramp; gaze toward/away/downcast channel responses; the fit against D-4 E1 measurements under the ratified §1.7 full-disc-centre gaze definition) | The channels, their definitions and the measurements are estate research artifacts. No curve library knows what the blush channel *is*, and the fit targets (monotonic blush with a measured 0.0 noise floor; gaze scored under §1.7) come from our own instrument record. | Kernel: parametric curve family (monotone piecewise / logistic blends) fitted by least squares over the measurement set; outputs sampled tables + fit residuals report. | Stdlib `math` + SIMD types (§2e); the fit report is a gate artifact — residuals ship with the tables, so a bad fit is visible, not silent. Consumed by: the face-state system (Rust/JS presentation — see the Rust chapter). |
| **Stateful anatomy + fluid timeline model** (W10: the 8473238 specificity floor — volumes, production/let-down rates, method-dependent culmination routing, a continuous fluid timeline) | The specificity floor is an estate canon requirement measured from reference work; no simulation library models it, in any language. This kernel *is* the model of record: `Milkmaid` and any later consumer fit to it. | Kernel: fixed-step integrator over an explicit state struct (per-method state, volumes, rates, timeline event log); culmination lands in whichever method is active and the record names it — that rule is implemented here, in the reference, first. | Stdlib numerics; fixed evaluation order for reproducibility (§2e); golden vectors include full-timeline replays, not just point samples, because timeline drift is the failure mode that matters. |
| **Deterministic seeded RNG** (in-kernel) | Cross-language bit-exactness (Mojo reference vs JS transliteration) cannot ride on either side's stdlib random. | Kernel utility (~20 lines, splitmix64). | Integer arithmetic only — identical in Mojo and JS (with JS `BigInt` or a 32-bit variant chosen at W3 preflight and recorded; the choice is part of the harness spec). |
| **Table emitter + vector emitter** | The schemas (headers, precision, source hash, tolerance block) are estate contracts; generic serializers don't know them. | Driver code around the kernels (Mojo + Python interop for JSON, §2f). | The harness (§2h) is the schema's enforcement. |

### Explicitly **not** Mojo's (recorded so nobody goes looking)

| System | Where it actually lives |
|---|---|
| Face-state system (F-codes, channel *presentation*) | Rust/JS presentation layers evaluating Mojo-supplied curves (Rust chapter §3). |
| arousal-engine/1 (tiers T1–T4, exactly-once culmination package) | Engine-free Rust crate in the main-game line; Mojo may *fit constants* for it in a future week, but the engine is not re-implemented in Mojo. |
| Sex-scene staging & two-body contact | A research problem in the rig/animation pipeline (lumen); no Mojo involvement. |
| Signature-tool control laws (the Governor's cut-and-latch, etc.) | Rust (W11 is the reference week). The law is a page of arithmetic in the shipping language, on purpose. |
| Ledgers (exposure / development / appraisal) | The game's domain layer (Rust chapter §3) over its persistence store. Mojo generates no ledger data. |
| Lactation *presentation* (charting UI, growth/yield archive rendering) | The game's UI layer; Mojo supplies the model's numbers only. |

---

## 4. Quality bar — Laplace3D-class minimum

The bar (estate standard): **60 fps; motion on every frame; secondary-motion lag ≤ 17 ms; humanized jitter; expressions readable at presentation size; loop seams ≤ 1.1; audio/animation sync +12 ms ± 25 ms; deterministic fixed-step simulation.** Mojo touches this bar at exactly three points — and at those points it is the strongest tool in the program:

| Bar item | Mojo's part | Helps / fights |
|---|---|---|
| Deterministic fixed-step | The kernels *define* the numerical behaviour the shipping side must match; fixed-step integration with a fixed evaluation order makes "deterministic" a testable property of the model, not a hope about the runtime. | **Helps, decisively** — with one fight: floating-point determinism across languages is earned, not free. Mojo computes in `Float64`; JS numbers are also `Float64`, but operation *order* and library `math` functions (transcendentals!) can differ in the last bits. Hence the harness tolerances (§2h) and the rule that shipped behaviour comes from **tables** (identical data both sides) wherever possible, with live transliteration only where a curve must be evaluated off-table. |
| Expression readability (blush/gaze channels) | The W3 fit is where readability is *won or lost numerically*: a blush curve that saturates too early or a gaze response that undershoots reads as a broken face at any render quality. D-4's measurements (blush monotonic, noise floor 0.0; gaze y-axis the historically weak channel) are the fit targets. | **Helps**: fitting against measurements, with residuals reported, beats hand-tuned constants — the estate has the receipts for what hand-tuning missed (the §1.7 y-axis failure was three stacked defects, none visible until measured). **Fights**: nothing in Mojo *shows* you the face — the fit is blind numbers until the presentation layer renders it, so the D-221 visual gate on final-artifact crops remains the verdict; Mojo evidence is supporting, never sufficient. |
| Humanized jitter / secondary lag | Jitter spectra and lag curves are numerical objects; if a future week wants them fitted rather than hand-set, the kernel pattern extends directly (seeded RNG, §3). | Neutral for W3/W10 as scoped: jitter and lag live in the presentation sim (Rust chapter §4). Mojo's absence from the runtime means **zero** runtime risk to the 60 fps / lag budgets — an authoring tool cannot drop a frame. |

Honest summary: Mojo's contribution to the quality bar is *correctness of the numbers*, verified by conformance. Frame rate, seams and sync are earned in the shipping stacks and are untouched by anything in this chapter — positively or negatively.

---

## 5. Risks & seams

1. **No WebAssembly target — front and centre, as established fact of the program.** Modular's official materials document native CPU/GPU compilation only; the install story is macOS/Linux hosts (Windows via WSL — https://pypi.org/project/mojo/0.25.6.1/), and no wasm target appears in the official toolchain documentation. Secondary comparisons state it flatly ("WebAssembly / Browsers: Rust — excellent… Mojo — no WASM support yet", https://an4t.com/mojo-vs-rust/). Occasional community experiments claiming Mojo→wasm routes exist in the wild; **none is a Modular-supported target, none was verified as credible in this research, and the program's D-335 ruling stands unchanged: Mojo weeks ship a conformance-checked JS transliteration, never Mojo itself.** The seam is a reported finding of the program, not a workaround it hides.
2. **Standard-library and language churn.** A 1.0-beta-era language whose stdlib "still changes between releases" (https://amitxshukla.github.io/Mojo/gettingstarted.html) will break kernel source eventually. Mitigations: exact version pin in `pixi.toml`; kernels kept small and dependency-free (stdlib `math`/`algorithm`/`benchmark`/`testing` only); the **golden vectors are the contract** — if a future Mojo version changes a result, the harness catches it at regeneration time, in the open.
3. **Transcendental-function divergence across languages.** `exp`/`log`/trig implementations differ between Mojo's libm lineage and JS engines at the ULP level. Curve families are therefore chosen to minimise transcendentals in the *live* path (polynomial/piecewise fits over raw logistic evaluation where the fit quality allows), and what remains is tolerance-gated (§2h). This is a known, budgeted risk — not a surprise waiting at W10.
4. **The transliteration is a second implementation, and can drift.** The W3 harness pattern is deliberately reused at W10 (its cost is measured at W3, per the program doc) and the style rule is mechanical: same operation order, same constants at full precision, no "improvements" in the JS version. Any intentional change goes in the Mojo reference first, vectors regenerate, harness re-runs. The reference is the single source of truth; the JS is a checked copy.
5. **Talent/tooling thinness.** Mojo has a language server and debugger in the distribution (per the PyPI page), and Modular now ships official agent skills for the language — but the estate's Diver gate apparatus (LuaLS/stylua-class per-file gates) has no Mojo equivalent yet. Kernel gating is `mojo test` + `mojo format` + the conformance harness; that is honestly thinner than the Rust gate stack and is recorded as such.
6. **Scope creep toward the runtime.** The standing temptation — "the kernel is fast, why not run more in Mojo" — has a hard answer: there is no Mojo runtime in the player's browser, full stop (§5.1). Anything Mojo computes must be computable **at authoring time** into tables/vectors, or transliterable into a page of JS. A proposed Mojo use that fails that test is rejected at design review, not discovered at packaging.


## How the research applies to Milkmaid

- Language: **Mojo** under tiger-style-mojo.
- Canon core: Milk, Made Service — the jam takes a shorter public name and keeps the canon game whole inside.
- The parts matrix in the dossier names, for every part of the full game
  (rendering, animation, audio, dialogue/UI, state, persistence, assets,
  build), the library or tool this entry pins — or states plainly that the
  part is written from scratch (see the next chapter).
