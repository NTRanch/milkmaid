# milkmaid/src/kernel.mojo — Milkmaid numerical kernel (Mojo).
#
# Tiger Style (tiger-style-mojo): explicit contracts, bounded work,
# disciplined ownership. This kernel is the REFERENCE implementation of
# the Milkmaid fluid-timeline model (canon core: Milk, Made Service).
# Mojo ships nothing to the player (no credible wasm target — book
# chapter "Engine Research" §5.1, program ruling D-335): the kernel
# authors the model, the method tables, and the golden conformance
# vectors; the shipped game is the JS transliteration in core/kernel.mjs,
# proven against the vectors by tools/conformance.mjs.
#
# NUMERICS CONTRACT (the reason conformance can be EXACT, not tolerant):
# every quantity is an integer. Volumes are microlitres (uL), rates are
# uL per fixed step, pressure/arousal/heat are milli-units 0..1000.
# The only divisions are floor divisions over non-negative operands,
# written so no negative numerator ever reaches a division. Mojo Int
# (64-bit) and JS Number (exact integers to 2^53) therefore agree
# bit-for-bit on every step. Transcendentals: none, by design.
#
# STEP CONTRACT: fixed dt (STEP_MS). Per step the kernel accepts one
# input record {held, method, side} and mutates one State value owned
# by the caller. No allocation inside step beyond the fixed state.
# Work per step is O(METHOD_COUNT + SIDE_COUNT) — bounded, named.
#
# TOOLCHAIN PIN: pixi.toml pins mojo ==0.25.6.1 (the pin of record from
# the engine-research chapter). Build evidence is recorded in the book
# (Build chapter) — including, honestly, when the kernel was authored
# but not executed because no toolchain was installed on the host.

from collections import InlineArray

# ---------------------------------------------------------------------------
# Constants (mirror: core/kernel.mjs — the transliteration is a checked
# copy; any drift fails tools/conformance.mjs against the vectors)
# ---------------------------------------------------------------------------

alias STEP_MS: Int = 16
alias SIDE_COUNT: Int = 2
alias METHOD_COUNT: Int = 4

alias SIDE_LEFT: Int = 0
alias SIDE_RIGHT: Int = 1

alias METHOD_PINCH: Int = 0
alias METHOD_CLAMPS: Int = 1
alias METHOD_PUMP: Int = 2
alias METHOD_CUPS: Int = 3

alias MILLI_MAX: Int = 1000
alias LETDOWN_THRESHOLD: Int = 850        # arousal milli at trigger
alias LETDOWN_THRESHOLD_CLAMPS: Int = 750 # clamps sit lower: they hold her there
alias LETDOWN_STEPS: Int = 240            # 3.84 s of flow per let-down
alias LETDOWN_RESIDUAL_AROUSAL: Int = 320 # arousal ceiling set at let-down end
alias PRESSURE_DECAY_PER_STEP: Int = 24
alias AROUSAL_DECAY_PER_STEP: Int = 3
alias AROUSAL_LETDOWN_DRAIN_PER_STEP: Int = 3
alias HEAT_DECAY_PER_STEP: Int = 5
alias GROWTH_PER_LETDOWN_UL: Int = 350    # capacity gained per addressed side

alias PHASE_RUNNING: Int = 0
alias PHASE_WON: Int = 1
alias PHASE_LOST: Int = 2

# ---------------------------------------------------------------------------
# Method table — the methods circuit from Just a Pinch, as data.
# Generated to tables/method-tables.json by the driver (main, below).
# ---------------------------------------------------------------------------

struct MethodParams:
    var pressure_rate: Int        # pressure milli gained per held step
    var trickle_rate_ul: Int      # uL per step per addressed side, pre-let-down
    var trickle_threshold: Int    # pressure milli needed for the trickle
    var trickle_both_sides: Bool  # else: the active side only
    var letdown_rate_ul: Int      # uL per step per addressed side in let-down
    var letdown_both_sides: Bool
    var heat_rate: Int            # heat milli gained per held step

    fn __init__(out self, pressure_rate: Int, trickle_rate_ul: Int,
                trickle_threshold: Int, trickle_both_sides: Bool,
                letdown_rate_ul: Int, letdown_both_sides: Bool,
                heat_rate: Int):
        self.pressure_rate = pressure_rate
        self.trickle_rate_ul = trickle_rate_ul
        self.trickle_threshold = trickle_threshold
        self.trickle_both_sides = trickle_both_sides
        self.letdown_rate_ul = letdown_rate_ul
        self.letdown_both_sides = letdown_both_sides
        self.heat_rate = heat_rate


fn method_params(method: Int) -> MethodParams:
    """The circuit, in circuit order. Contract: 0 <= method < 4;
    out-of-range indices return the pinch row (callers validate first)."""
    if method == METHOD_CLAMPS:
        return MethodParams(22, 4, 500, True, 60, True, 6)
    if method == METHOD_PUMP:
        return MethodParams(13, 10, 600, True, 88, True, 9)
    if method == METHOD_CUPS:
        return MethodParams(12, 7, 600, True, 66, True, 7)
    return MethodParams(16, 6, 600, False, 110, False, 10)  # pinch


fn method_addresses_both(method: Int, letdown: Bool) -> Bool:
    var p = method_params(method)
    return p.letdown_both_sides if letdown else p.trickle_both_sides


# ---------------------------------------------------------------------------
# Efficiency curve — a method worked too long goes dull. Piecewise
# linear over heat milli, control points:
#   (0,700) (300,1000) (700,1000) (850,620) (1000,260)
# Evaluated as (y0*(x1-h) + y1*(h-x0)) // (x1-x0): every operand is
# non-negative inside a segment, so floor division is unambiguous.
# ---------------------------------------------------------------------------

fn efficiency_milli(heat: Int) -> Int:
    var xs = InlineArray[Int, 5](0, 300, 700, 850, 1000)
    var ys = InlineArray[Int, 5](700, 1000, 1000, 620, 260)
    var h = heat
    if h < 0:
        h = 0
    if h > 1000:
        h = 1000
    for i in range(4):
        var x0 = xs[i]
        var x1 = xs[i + 1]
        if h <= x1:
            var y0 = ys[i]
            var y1 = ys[i + 1]
            return (y0 * (x1 - h) + y1 * (h - x0)) // (x1 - x0)
    return 260


# ---------------------------------------------------------------------------
# Deterministic RNG — splitmix32. Integer-only, so the stream is
# identical in Mojo and in JS (Math.imul). Used by the game layer for
# ambient visual phase only; the model itself consumes no randomness.
# ---------------------------------------------------------------------------

fn rng_next(state: Int) -> Int:
    """Returns the next stream value 0..2^32-1; advance via rng_advance."""
    var z = (state + 0x9E3779B9) & 0xFFFFFFFF
    z = ((z ^ (z >> 16)) * 0x21F0AAAD) & 0xFFFFFFFF
    z = ((z ^ (z >> 15)) * 0x735A2D97) & 0xFFFFFFFF
    return (z ^ (z >> 15)) & 0xFFFFFFFF


fn rng_advance(state: Int) -> Int:
    return (state + 0x9E3779B9) & 0xFFFFFFFF


# ---------------------------------------------------------------------------
# Level parameters — a service round, as data.
# ---------------------------------------------------------------------------

struct LevelParams:
    var target_ul: Int          # yield that completes the round
    var time_steps: Int         # round length in fixed steps
    var heat_bonus: Int         # added to every method's heat rate
    var prod_rate_ul: Int       # production per side per step
    var required_distinct: Int  # distinct let-down methods needed to win

    fn __init__(out self, target_ul: Int, time_steps: Int, heat_bonus: Int,
                prod_rate_ul: Int, required_distinct: Int):
        self.target_ul = target_ul
        self.time_steps = time_steps
        self.heat_bonus = heat_bonus
        self.prod_rate_ul = prod_rate_ul
        self.required_distinct = required_distinct


fn level_params(level: Int) -> LevelParams:
    """Contract: 0 <= level < 3; out-of-range returns round 1."""
    if level == 1:
        return LevelParams(420_000, 11_250, 0, 22, 3)   # The Full Circuit
    if level == 2:
        return LevelParams(600_000, 13_125, 3, 28, 4)   # Made Service, In Full
    return LevelParams(240_000, 9_375, 0, 20, 0)        # Morning Round


# ---------------------------------------------------------------------------
# State — the stateful anatomy + fluid timeline, explicit and whole.
# ---------------------------------------------------------------------------

struct State:
    var arousal_milli: Int
    var capacity_ul: InlineArray[Int, 2]
    var distinct_mask: Int
    var growth_total_ul: Int
    var heat_milli: InlineArray[Int, 4]
    var last_letdown_method: Int   # -1 = none yet; the record names it
    var letdown_count: Int
    var letdowns_by_method: InlineArray[Int, 4]
    var letdown_steps_left: Int
    var level: LevelParams
    var method: Int                # active method, 0..3
    var phase: Int                 # PHASE_*
    var pressure_milli: Int
    var round_steps_elapsed: Int
    var round_steps_left: Int
    var side: Int                  # active side, 0..1
    var volume_ul: InlineArray[Int, 2]
    var yield_by_method_ul: InlineArray[Int, 4]
    var yield_total_ul: Int

    fn __init__(out self, level: LevelParams):
        self.arousal_milli = 0
        self.capacity_ul = InlineArray[Int, 2](90_000, 90_000)
        self.distinct_mask = 0
        self.growth_total_ul = 0
        self.heat_milli = InlineArray[Int, 4](0, 0, 0, 0)
        self.last_letdown_method = -1
        self.letdown_count = 0
        self.letdowns_by_method = InlineArray[Int, 4](0, 0, 0, 0)
        self.letdown_steps_left = 0
        self.level = level
        self.method = METHOD_PINCH
        self.phase = PHASE_RUNNING
        self.pressure_milli = 0
        self.round_steps_elapsed = 0
        self.round_steps_left = level.time_steps
        self.side = SIDE_LEFT
        self.volume_ul = InlineArray[Int, 2](90_000, 90_000)
        self.yield_by_method_ul = InlineArray[Int, 4](0, 0, 0, 0)
        self.yield_total_ul = 0


fn _clamp_milli(v: Int) -> Int:
    if v < 0:
        return 0
    if v > MILLI_MAX:
        return MILLI_MAX
    return v


fn _extract(inout s: State, side: Int, want_ul: Int):
    """Move up to want_ul from one side into the yield ledger.
    Conservation is structural: never more than the side holds, so
    volume is never negative and every microlitre is accounted."""
    var got = want_ul
    if got > s.volume_ul[side]:
        got = s.volume_ul[side]
    if got < 0:
        got = 0
    s.volume_ul[side] -= got
    s.yield_total_ul += got
    s.yield_by_method_ul[s.method] += got


fn step(inout s: State, held: Bool, method_in: Int, side_in: Int):
    """Advance the model one fixed step.

    Input contract: method_in is -1 (keep) or 0..3 (switch); side_in is
    -1 (keep) or 0..1 (address that side). Out-of-contract values are
    ignored, never trusted. Once phase != PHASE_RUNNING the state is
    frozen: step is a no-op, so late inputs cannot rewrite a record.

    Order of operations (the contract the vectors encode):
      1. switches   2. production   3. heat   4. pressure   5. arousal
      6. let-down trigger (+growth, +ledger)   7. extraction
      8. round timer + win/lose judgement
    """
    if s.phase != PHASE_RUNNING:
        return

    # 1. Switches.
    if 0 <= method_in and method_in < METHOD_COUNT:
        s.method = method_in
    if 0 <= side_in and side_in < SIDE_COUNT:
        s.side = side_in
    var p = method_params(s.method)

    # 2. Production: her body refills toward capacity, always.
    for sd in range(SIDE_COUNT):
        var v = s.volume_ul[sd] + s.level.prod_rate_ul
        if v > s.capacity_ul[sd]:
            v = s.capacity_ul[sd]
        s.volume_ul[sd] = v

    # 3. Heat: the worked method heats; the rest cool.
    for m in range(METHOD_COUNT):
        if m == s.method and held:
            s.heat_milli[m] = _clamp_milli(
                s.heat_milli[m] + p.heat_rate + s.level.heat_bonus)
        else:
            s.heat_milli[m] = _clamp_milli(s.heat_milli[m] - HEAT_DECAY_PER_STEP)

    # 4. Pressure.
    if held:
        s.pressure_milli = _clamp_milli(s.pressure_milli + p.pressure_rate)
    else:
        s.pressure_milli = _clamp_milli(s.pressure_milli - PRESSURE_DECAY_PER_STEP)

    # 5. Arousal: pressure, integrated. (pressure*16)//1000, non-negative.
    if held:
        s.arousal_milli = _clamp_milli(
            s.arousal_milli + (s.pressure_milli * 16) // 1000)
    else:
        s.arousal_milli = _clamp_milli(s.arousal_milli - AROUSAL_DECAY_PER_STEP)

    # 6. Let-down trigger: culmination lands in the ACTIVE method and
    # the record names it. Growth is booked at the trigger, per
    # addressed side — the anatomy is stateful across the whole round.
    var threshold = LETDOWN_THRESHOLD
    if s.method == METHOD_CLAMPS:
        threshold = LETDOWN_THRESHOLD_CLAMPS
    if s.letdown_steps_left == 0 and s.arousal_milli >= threshold:
        s.letdown_steps_left = LETDOWN_STEPS
        s.letdown_count += 1
        s.letdowns_by_method[s.method] += 1
        s.distinct_mask |= 1 << s.method
        s.last_letdown_method = s.method
        if method_addresses_both(s.method, True):
            for sd in range(SIDE_COUNT):
                s.capacity_ul[sd] += GROWTH_PER_LETDOWN_UL
                s.growth_total_ul += GROWTH_PER_LETDOWN_UL
        else:
            s.capacity_ul[s.side] += GROWTH_PER_LETDOWN_UL
            s.growth_total_ul += GROWTH_PER_LETDOWN_UL

    # 7. Extraction. During let-down she drains at the let-down rate and
    # arousal bleeds off; otherwise a held, pressurised method trickles.
    var eff = efficiency_milli(s.heat_milli[s.method])
    if s.letdown_steps_left > 0:
        s.arousal_milli = _clamp_milli(
            s.arousal_milli - AROUSAL_LETDOWN_DRAIN_PER_STEP)
        var want = (p.letdown_rate_ul * eff) // 1000
        if p.letdown_both_sides:
            for sd in range(SIDE_COUNT):
                _extract(s, sd, want)
        else:
            _extract(s, s.side, want)
        s.letdown_steps_left -= 1
        if s.letdown_steps_left == 0 and s.arousal_milli > LETDOWN_RESIDUAL_AROUSAL:
            s.arousal_milli = LETDOWN_RESIDUAL_AROUSAL
    elif held and s.pressure_milli >= p.trickle_threshold:
        var want = (p.trickle_rate_ul * eff) // 1000
        if p.trickle_both_sides:
            for sd in range(SIDE_COUNT):
                _extract(s, sd, want)
        else:
            _extract(s, s.side, want)

    # 8. Timer + judgement. Yield is judged before the clock: a round
    # completed on its final step is a completed round. The rotation
    # requirement is part of the win, not a garnish.
    s.round_steps_left -= 1
    s.round_steps_elapsed += 1
    var distinct = 0
    for m in range(METHOD_COUNT):
        if (s.distinct_mask >> m) & 1 == 1:
            distinct += 1
    if s.yield_total_ul >= s.level.target_ul and distinct >= s.level.required_distinct:
        s.phase = PHASE_WON
    elif s.round_steps_left <= 0:
        s.phase = PHASE_LOST


fn state_digest(s: State) -> Int:
    """FNV-1a over the state fields, in declared order. The digest is a
    conformance checkpoint, not a hash of record: collisions would show
    as vector failures against the field-level expectations, which the
    vectors also carry."""
    var fields = InlineArray[Int, 24](
        s.arousal_milli, s.capacity_ul[0], s.capacity_ul[1],
        s.distinct_mask, s.growth_total_ul,
        s.heat_milli[0], s.heat_milli[1], s.heat_milli[2], s.heat_milli[3],
        s.last_letdown_method + 1, s.letdown_count,
        s.letdowns_by_method[0], s.letdowns_by_method[1],
        s.letdowns_by_method[2], s.letdowns_by_method[3],
        s.letdown_steps_left, s.method, s.phase, s.pressure_milli,
        s.round_steps_elapsed, s.side,
        s.volume_ul[0], s.volume_ul[1], s.yield_total_ul)
    var h = 2166136261
    for i in range(24):
        h = ((h ^ (fields[i] & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    return h


fn main() raises:
    # Driver entry (authoring time only): emit the method tables and
    # the golden vectors as JSON on stdout for the repo's tables/ and
    # conformance/ directories. The JS-side driver of record tonight is
    # tools/gen-vectors.mjs — a line transcription of this file — until
    # the pinned Mojo toolchain is installed and this main runs; the
    # switch is recorded in the book (Build chapter) and the breakage
    # log, never silently.
    print("milkmaid kernel: table/vector generation entry point")
    print("see tools/gen-vectors.mjs (transcription driver) and conformance/")
