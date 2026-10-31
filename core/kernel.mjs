// kernel.mjs — Milkmaid fluid-timeline kernel, JS transliteration.
//
// This file is a CHECKED COPY of the Mojo reference implementation in
// src/kernel.mojo: same constants, same operation order, same integer
// math. Any intentional change lands in the Mojo reference first, the
// vectors in conformance/vectors.json regenerate, and
// tools/conformance.mjs re-proves this copy. Do not "improve" here.
//
// Numerics: every quantity is an integer (microlitres, milli-units).
// All divisions are floor divisions over non-negative operands, written
// so no negative numerator reaches a division — Mojo Int and JS Number
// agree bit-for-bit. No transcendentals anywhere in the model.

export const STEP_MS = 16;
export const SIDE_COUNT = 2;
export const METHOD_COUNT = 4;

export const SIDE_LEFT = 0;
export const SIDE_RIGHT = 1;

export const METHOD_PINCH = 0;
export const METHOD_CLAMPS = 1;
export const METHOD_PUMP = 2;
export const METHOD_CUPS = 3;
export const METHOD_NAMES = ["PINCH", "CLAMPS", "PUMP", "CUPS"];
export const METHOD_FULL_NAMES = ["PINCH", "CLAMPS", "PUMP SUCTION", "CUPS"];

export const MILLI_MAX = 1000;
export const LETDOWN_THRESHOLD = 850;
export const LETDOWN_THRESHOLD_CLAMPS = 750;
export const LETDOWN_STEPS = 240;
export const LETDOWN_RESIDUAL_AROUSAL = 320;
export const PRESSURE_DECAY_PER_STEP = 24;
export const AROUSAL_DECAY_PER_STEP = 3;
export const AROUSAL_LETDOWN_DRAIN_PER_STEP = 3;
export const HEAT_DECAY_PER_STEP = 5;
export const GROWTH_PER_LETDOWN_UL = 350;

export const PHASE_RUNNING = 0;
export const PHASE_WON = 1;
export const PHASE_LOST = 2;

// The methods circuit from Just a Pinch, as data. Generated to
// tables/method-tables.json from this table (tools/gen-tables.mjs);
// a conformance check keeps the JSON and this table identical.
export const METHOD_TABLE = [
  // pressureRate, trickleUl, trickleThreshold, trickleBoth, letdownUl, letdownBoth, heatRate
  { pressureRate: 16, trickleRateUl: 6, trickleThreshold: 600, trickleBothSides: false, letdownRateUl: 110, letdownBothSides: false, heatRate: 10 },
  { pressureRate: 22, trickleRateUl: 4, trickleThreshold: 500, trickleBothSides: true, letdownRateUl: 60, letdownBothSides: true, heatRate: 6 },
  { pressureRate: 13, trickleRateUl: 10, trickleThreshold: 600, trickleBothSides: true, letdownRateUl: 88, letdownBothSides: true, heatRate: 9 },
  { pressureRate: 12, trickleRateUl: 7, trickleThreshold: 600, trickleBothSides: true, letdownRateUl: 66, letdownBothSides: true, heatRate: 7 },
];

export function methodParams(method) {
  // Contract: 0 <= method < 4; out-of-range returns the pinch row
  // (callers validate first).
  if (method === METHOD_CLAMPS) return METHOD_TABLE[1];
  if (method === METHOD_PUMP) return METHOD_TABLE[2];
  if (method === METHOD_CUPS) return METHOD_TABLE[3];
  return METHOD_TABLE[0];
}

// Efficiency curve — a method worked too long goes dull. Piecewise
// linear over heat milli; evaluated as
// (y0*(x1-h) + y1*(h-x0)) // (x1-x0) with all operands non-negative.
const EFF_X = [0, 300, 700, 850, 1000];
const EFF_Y = [700, 1000, 1000, 620, 260];

export function efficiencyMilli(heat) {
  let h = heat;
  if (h < 0) h = 0;
  if (h > 1000) h = 1000;
  for (let i = 0; i < 4; i++) {
    const x0 = EFF_X[i];
    const x1 = EFF_X[i + 1];
    if (h <= x1) {
      const y0 = EFF_Y[i];
      const y1 = EFF_Y[i + 1];
      return Math.floor((y0 * (x1 - h) + y1 * (h - x0)) / (x1 - x0));
    }
  }
  return 260;
}

// Deterministic RNG — splitmix32, integer-only (Math.imul), identical
// to the Mojo kernel's stream. Ambient visual phase only; the model
// consumes no randomness.
export function rngNext(state) {
  let z = (state + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

export function rngAdvance(state) {
  return (state + 0x9e3779b9) >>> 0;
}

// Service rounds, as data.
export const LEVEL_TABLE = [
  { name: "MORNING ROUND", targetUl: 240000, timeSteps: 9375, heatBonus: 0, prodRateUl: 20, requiredDistinct: 0 },
  { name: "THE FULL CIRCUIT", targetUl: 420000, timeSteps: 11250, heatBonus: 0, prodRateUl: 22, requiredDistinct: 3 },
  { name: "MADE SERVICE, IN FULL", targetUl: 600000, timeSteps: 13125, heatBonus: 3, prodRateUl: 28, requiredDistinct: 4 },
];

export function levelParams(level) {
  // Contract: 0 <= level < 3; out-of-range returns round 1.
  if (level === 1) return LEVEL_TABLE[1];
  if (level === 2) return LEVEL_TABLE[2];
  return LEVEL_TABLE[0];
}

export function createState(level, overrides = {}) {
  const lp = levelParams(level);
  const s = {
    arousalMilli: 0,
    capacityUl: [90000, 90000],
    distinctMask: 0,
    growthTotalUl: 0,
    heatMilli: [0, 0, 0, 0],
    lastLetdownMethod: -1,
    letdownCount: 0,
    letdownsByMethod: [0, 0, 0, 0],
    letdownStepsLeft: 0,
    level: lp,
    method: METHOD_PINCH,
    phase: PHASE_RUNNING,
    pressureMilli: 0,
    roundStepsElapsed: 0,
    roundStepsLeft: lp.timeSteps,
    side: SIDE_LEFT,
    volumeUl: [90000, 90000],
    yieldByMethodUl: [0, 0, 0, 0],
    yieldTotalUl: 0,
  };
  // Vector-schema overrides: a partial state for boundary vectors.
  // Only known scalar/array fields, validated by the driver.
  for (const k of Object.keys(overrides)) {
    if (k === "level") continue;
    if (!(k in s)) throw new Error(`unknown state override: ${k}`);
    s[k] = overrides[k];
  }
  return s;
}

function clampMilli(v) {
  if (v < 0) return 0;
  if (v > MILLI_MAX) return MILLI_MAX;
  return v;
}

function extract(s, side, wantUl) {
  // Conservation is structural: never more than the side holds.
  let got = wantUl;
  if (got > s.volumeUl[side]) got = s.volumeUl[side];
  if (got < 0) got = 0;
  s.volumeUl[side] -= got;
  s.yieldTotalUl += got;
  s.yieldByMethodUl[s.method] += got;
}

// Advance the model one fixed step. Input contract: methodIn is -1
// (keep) or 0..3 (switch); sideIn is -1 (keep) or 0..1 (address that
// side). Out-of-contract values are ignored, never trusted. Once
// phase != PHASE_RUNNING the state is frozen: step is a no-op.
// Order of operations is the contract the vectors encode; see the Mojo
// reference, step(), for the numbered list.
export function stepState(s, held, methodIn, sideIn) {
  if (s.phase !== PHASE_RUNNING) return;

  // 1. Switches.
  if (methodIn >= 0 && methodIn < METHOD_COUNT) s.method = methodIn;
  if (sideIn >= 0 && sideIn < SIDE_COUNT) s.side = sideIn;
  const p = methodParams(s.method);

  // 2. Production.
  for (let sd = 0; sd < SIDE_COUNT; sd++) {
    let v = s.volumeUl[sd] + s.level.prodRateUl;
    if (v > s.capacityUl[sd]) v = s.capacityUl[sd];
    s.volumeUl[sd] = v;
  }

  // 3. Heat.
  for (let m = 0; m < METHOD_COUNT; m++) {
    if (m === s.method && held) {
      s.heatMilli[m] = clampMilli(s.heatMilli[m] + p.heatRate + s.level.heatBonus);
    } else {
      s.heatMilli[m] = clampMilli(s.heatMilli[m] - HEAT_DECAY_PER_STEP);
    }
  }

  // 4. Pressure.
  if (held) s.pressureMilli = clampMilli(s.pressureMilli + p.pressureRate);
  else s.pressureMilli = clampMilli(s.pressureMilli - PRESSURE_DECAY_PER_STEP);

  // 5. Arousal.
  if (held) s.arousalMilli = clampMilli(s.arousalMilli + Math.floor((s.pressureMilli * 16) / 1000));
  else s.arousalMilli = clampMilli(s.arousalMilli - AROUSAL_DECAY_PER_STEP);

  // 6. Let-down trigger: culmination lands in the ACTIVE method and
  // the record names it.
  let threshold = LETDOWN_THRESHOLD;
  if (s.method === METHOD_CLAMPS) threshold = LETDOWN_THRESHOLD_CLAMPS;
  if (s.letdownStepsLeft === 0 && s.arousalMilli >= threshold) {
    s.letdownStepsLeft = LETDOWN_STEPS;
    s.letdownCount += 1;
    s.letdownsByMethod[s.method] += 1;
    s.distinctMask |= 1 << s.method;
    s.lastLetdownMethod = s.method;
    if (p.letdownBothSides) {
      for (let sd = 0; sd < SIDE_COUNT; sd++) {
        s.capacityUl[sd] += GROWTH_PER_LETDOWN_UL;
        s.growthTotalUl += GROWTH_PER_LETDOWN_UL;
      }
    } else {
      s.capacityUl[s.side] += GROWTH_PER_LETDOWN_UL;
      s.growthTotalUl += GROWTH_PER_LETDOWN_UL;
    }
  }

  // 7. Extraction.
  const eff = efficiencyMilli(s.heatMilli[s.method]);
  if (s.letdownStepsLeft > 0) {
    s.arousalMilli = clampMilli(s.arousalMilli - AROUSAL_LETDOWN_DRAIN_PER_STEP);
    const want = Math.floor((p.letdownRateUl * eff) / 1000);
    if (p.letdownBothSides) {
      for (let sd = 0; sd < SIDE_COUNT; sd++) extract(s, sd, want);
    } else {
      extract(s, s.side, want);
    }
    s.letdownStepsLeft -= 1;
    if (s.letdownStepsLeft === 0 && s.arousalMilli > LETDOWN_RESIDUAL_AROUSAL) {
      s.arousalMilli = LETDOWN_RESIDUAL_AROUSAL;
    }
  } else if (held && s.pressureMilli >= p.trickleThreshold) {
    const want = Math.floor((p.trickleRateUl * eff) / 1000);
    if (p.trickleBothSides) {
      for (let sd = 0; sd < SIDE_COUNT; sd++) extract(s, sd, want);
    } else {
      extract(s, s.side, want);
    }
  }

  // 8. Timer + judgement. Yield is judged before the clock; the
  // rotation requirement is part of the win.
  s.roundStepsLeft -= 1;
  s.roundStepsElapsed += 1;
  let distinct = 0;
  for (let m = 0; m < METHOD_COUNT; m++) {
    if (((s.distinctMask >> m) & 1) === 1) distinct += 1;
  }
  if (s.yieldTotalUl >= s.level.targetUl && distinct >= s.level.requiredDistinct) {
    s.phase = PHASE_WON;
  } else if (s.roundStepsLeft <= 0) {
    s.phase = PHASE_LOST;
  }
}

// FNV-1a over the state fields, in declared order (mirrors the Mojo
// kernel's state_digest, field for field).
export function stateDigest(s) {
  const fields = [
    s.arousalMilli, s.capacityUl[0], s.capacityUl[1],
    s.distinctMask, s.growthTotalUl,
    s.heatMilli[0], s.heatMilli[1], s.heatMilli[2], s.heatMilli[3],
    s.lastLetdownMethod + 1, s.letdownCount,
    s.letdownsByMethod[0], s.letdownsByMethod[1],
    s.letdownsByMethod[2], s.letdownsByMethod[3],
    s.letdownStepsLeft, s.method, s.phase, s.pressureMilli,
    s.roundStepsElapsed, s.side,
    s.volumeUl[0], s.volumeUl[1], s.yieldTotalUl,
  ];
  let h = 2166136261;
  for (const v of fields) {
    h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
  }
  return h >>> 0;
}

// Field-level snapshot for vector expectations: the full observable
// state, excluding the level parameter block (carried by the vector).
export function snapshotState(s) {
  return {
    arousalMilli: s.arousalMilli,
    capacityUl: [...s.capacityUl],
    distinctMask: s.distinctMask,
    growthTotalUl: s.growthTotalUl,
    heatMilli: [...s.heatMilli],
    lastLetdownMethod: s.lastLetdownMethod,
    letdownCount: s.letdownCount,
    letdownsByMethod: [...s.letdownsByMethod],
    letdownStepsLeft: s.letdownStepsLeft,
    method: s.method,
    phase: s.phase,
    pressureMilli: s.pressureMilli,
    roundStepsElapsed: s.roundStepsElapsed,
    roundStepsLeft: s.roundStepsLeft,
    side: s.side,
    volumeUl: [...s.volumeUl],
    yieldByMethodUl: [...s.yieldByMethodUl],
    yieldTotalUl: s.yieldTotalUl,
  };
}
