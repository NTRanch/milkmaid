// tests.mjs — Milkmaid unit tests (node, assert-based; no framework).
// Estate split: half validation, half adversarial. Where an expectation
// is a number, it is derived by hand from the kernel contract in
// src/kernel.mojo — the derivation is in the comment, so a failure
// points at the side that drifted.
import assert from "node:assert/strict";
import {
  PHASE_LOST, PHASE_RUNNING, PHASE_WON, createState, efficiencyMilli,
  levelParams, stateDigest, stepState,
} from "../core/kernel.mjs";
import { INPUT, SCREEN, createGame } from "../web/game.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}
function steps(s, n, held, m = -1, sd = -1) {
  for (let i = 0; i < n; i++) stepState(s, held, m, sd);
}

// ============================ VALIDATION ============================

// Hand derivation (pinch, pressureRate 16): pressures after steps
// 1..10 are 16,32,...,160. Arousal gain per step is
// floor(pressure*16/1000): 0,0,0,1,1,1,1,2,2,2 — total 10.
test("validation: pinch pressure/arousal ramp matches the hand trace", () => {
  const s = createState(0);
  steps(s, 10, true, 0, 0);
  assert.equal(s.pressureMilli, 160);
  assert.equal(s.arousalMilli, 10);
  assert.equal(s.heatMilli[0], 100);
});

// Production is capped at capacity: an idle body stays exactly full.
test("validation: idle body stays at capacity, nothing yields", () => {
  const s = createState(0);
  steps(s, 500, false);
  assert.deepEqual(s.volumeUl, [90000, 90000]);
  assert.equal(s.yieldTotalUl, 0);
  assert.equal(s.roundStepsLeft, 9375 - 500);
});

// Conservation with production disabled (test mutates the level block,
// which is data): microlitres are never created or destroyed, only
// moved from a side into the yield ledger.
test("validation: yield accounting conserves volume exactly", () => {
  const s = createState(0);
  s.level = { ...s.level, prodRateUl: 0 };
  const script = [0, 2, 1, 3, 2, 0];
  for (let r = 0; r < 40; r++) {
    for (const m of script) steps(s, 90, true, m, r % 2);
    assert.equal(s.volumeUl[0] + s.volumeUl[1] + s.yieldTotalUl, 180000);
    assert.ok(s.volumeUl[0] >= 0 && s.volumeUl[1] >= 0);
  }
});

// The let-down record names the method active at the trigger, and
// growth is booked per addressed side (pinch: the addressed side only).
test("validation: let-down lands in the active method and is named; growth is per addressed side", () => {
  const s = createState(0);
  steps(s, 400, true, 1); // clamps: threshold 750, both-sides growth
  assert.ok(s.letdownCount >= 1);
  assert.equal(s.lastLetdownMethod, 1);
  assert.ok(s.letdownsByMethod[1] >= 1);
  assert.equal(s.capacityUl[0], 90000 + 350 * s.letdownsByMethod[1]);
  assert.equal(s.capacityUl[1], s.capacityUl[0]); // clamps growth addresses both sides
  const t = createState(0);
  steps(t, 300, true, 0, 0); // pinch on the left
  assert.ok(t.letdownCount >= 1);
  assert.equal(t.lastLetdownMethod, 0);
  assert.equal(t.capacityUl[0], 90000 + 350 * t.letdownCount);
  assert.equal(t.capacityUl[1], 90000); // right side untouched by pinch growth
});

// The cumulative yield line never runs backward, and every milli
// field stays inside its contract across a full grand round.
test("validation: timeline monotonicity + bounds over a full round", () => {
  const s = createState(2);
  let prevYield = 0;
  let i = 0;
  while (s.phase === PHASE_RUNNING && i < 13125) {
    const m = Math.floor(i / 300) % 4;
    stepState(s, true, m, m === 0 ? Math.floor(i / 1200) % 2 : -1);
    assert.ok(s.yieldTotalUl >= prevYield, "yield ran backward");
    prevYield = s.yieldTotalUl;
    for (const v of [s.arousalMilli, s.pressureMilli, ...s.heatMilli]) {
      assert.ok(v >= 0 && v <= 1000, `milli field out of contract: ${v}`);
    }
    i++;
  }
  assert.equal(s.phase, PHASE_WON);
});

// Chart accumulation across rounds (game layer): two demo rounds
// served back to back both land in the session chart, in order.
test("validation: session chart accumulates rounds across a sitting", () => {
  const game = createGame({ seed: 4242, level: 0, demo: true });
  for (const lvl of [0, 1]) {
    game.startLevel(lvl);
    let n = 0;
    while (game.screen() !== SCREEN.VICTORY && n < 22500) { game.step(0); n++; }
    assert.equal(game.screen(), SCREEN.VICTORY);
  }
  const chart = game.sessionChart();
  assert.equal(chart.length, 2);
  assert.equal(chart[0].level, 0);
  assert.equal(chart[1].level, 1);
  assert.ok(chart[0].won && chart[1].won);
  assert.ok(chart[1].yieldUl >= 420000);
});

// ============================ ADVERSARIAL ===========================

// Out-of-contract method/side inputs are ignored, never trusted.
test("adversarial: hostile switch inputs change nothing", () => {
  const s = createState(0);
  stepState(s, true, 99, 7);
  assert.equal(s.method, 0);
  assert.equal(s.side, 0);
  stepState(s, true, -2, -5);
  assert.equal(s.method, 0);
  assert.equal(s.side, 0);
  stepState(s, true, 3, 1);
  assert.equal(s.method, 3);
  assert.equal(s.side, 1);
});

// A decided round is frozen: late inputs cannot rewrite the record.
test("adversarial: state is frozen after the verdict", () => {
  const s = createState(0);
  steps(s, 9375, false);
  assert.equal(s.phase, PHASE_LOST);
  const d = stateDigest(s);
  steps(s, 500, true, 2, 1);
  assert.equal(stateDigest(s), d);
});

// The clock is exact: still running at time_steps - 1, lost at
// time_steps, with zero yield on an untouched round.
test("adversarial: the round is lost on exactly the contracted step", () => {
  const s = createState(0);
  steps(s, 9374, false);
  assert.equal(s.phase, PHASE_RUNNING);
  assert.equal(s.roundStepsLeft, 1);
  steps(s, 1, false);
  assert.equal(s.phase, PHASE_LOST);
});

// Method switch ON the trigger step captures the culmination (the
// switch is operation 1, the trigger operation 6); a switch one step
// later does not rewrite it.
// Hand setup: pressure 1000, arousal 840 -> one held step adds
// floor(1000*16/1000) = 16 -> 856 >= 850, trigger fires that step.
test("adversarial: culmination boundary — same-step switch captures it, late switch does not", () => {
  const a = createState(0, { arousalMilli: 840, pressureMilli: 1000 });
  stepState(a, true, 2, -1); // switch to PUMP on the trigger step
  assert.equal(a.letdownCount, 1);
  assert.equal(a.lastLetdownMethod, 2);
  assert.equal(a.letdownsByMethod[0], 0);

  const b = createState(0, { arousalMilli: 840, pressureMilli: 1000 });
  stepState(b, true, -1, -1); // pinch triggers
  assert.equal(b.lastLetdownMethod, 0);
  stepState(b, true, 2, -1); // late switch: record stands
  assert.equal(b.lastLetdownMethod, 0);
  assert.equal(b.letdownsByMethod[2], 0);
});

// Yield at target is NOT a win while the circuit requirement is
// unmet — and meeting the circuit later completes the win on the
// trigger step itself.
test("adversarial: rotation requirement gates the win", () => {
  const s = createState(1, { yieldTotalUl: 419000, yieldByMethodUl: [0, 0, 419000, 0] });
  steps(s, 300, true, 2); // pump only: crosses target, distinct stays 1
  assert.ok(s.yieldTotalUl >= 420000);
  assert.equal(s.phase, PHASE_RUNNING);
  // File let-downs with two more methods; the win lands when the
  // third distinct method's let-down triggers.
  let guard = 0;
  while (s.phase === PHASE_RUNNING && guard < 6000) {
    const next = s.distinctMask === 0b0100 ? 0 : 1; // then pinch, then clamps
    stepState(s, true, next, 0);
    guard++;
  }
  assert.equal(s.phase, PHASE_WON);
});

// Degenerate pure-function inputs clamp instead of escaping.
test("adversarial: efficiency clamps out-of-range heat", () => {
  assert.equal(efficiencyMilli(-1000), 700);
  assert.equal(efficiencyMilli(0), 700);
  assert.equal(efficiencyMilli(100000), 260);
  assert.equal(efficiencyMilli(300), 1000);
  assert.equal(efficiencyMilli(850), 620);
});

// Degenerate construction: an out-of-range level falls back to round
// 1's parameters (contract), and the game layer refuses bad levels.
test("adversarial: degenerate level handling on both layers", () => {
  assert.deepEqual(levelParams(99), levelParams(0));
  assert.throws(() => createGame({ seed: 1, level: 99, demo: false }), /rejected/);
  const game = createGame({ seed: 1, level: 0, demo: false });
  assert.throws(() => game.startLevel(-1), /rejected/);
});

// Determinism: same seed + same input script -> identical draw lists
// at every sampled frame; the kernel digest agrees throughout.
test("adversarial: draw lists are deterministic per seed", () => {
  const run = () => {
    const game = createGame({ seed: 777, level: 1, demo: false });
    game.startLevel(1);
    const frames = [];
    for (let i = 0; i < 3000; i++) {
      const bits = i % 500 === 0 ? INPUT.mPump : i % 500 === 250 ? INPUT.mPinch : INPUT.tap;
      game.step(bits);
      if (i % 250 === 0) frames.push(JSON.stringify(game.frame().ops));
    }
    return { frames, digest: stateDigest(game.kernelState()) };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.frames, b.frames);
  assert.equal(a.digest, b.digest);
});

console.log(`tests: ${passed} passed, 0 failed (validation + adversarial)`);
