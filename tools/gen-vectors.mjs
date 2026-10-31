// gen-vectors.mjs — golden-vector driver for the Milkmaid kernel.
//
// This driver is a LINE TRANSCRIPTION of src/kernel.mojo (the Mojo
// reference), written independently of core/kernel.mjs on purpose: the
// conformance harness then compares two transcriptions of one spec. It
// exists because the pinned Mojo toolchain (pixi.toml) is not installed
// on this host tonight — see docs/BREAKAGE-LOG.md B-1. When the
// toolchain lands, src/kernel.mojo's own main() becomes the driver and
// this file is retired; the vector schema does not change.
//
// Usage: node tools/gen-vectors.mjs  (writes conformance/vectors.json)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- transcription of the Mojo kernel (constants re-read from the .mojo) ---
const THRESH = 850, THRESH_CLAMPS = 750, LD_STEPS = 240, RESIDUAL = 320;
const P_DECAY = 24, A_DECAY = 3, A_DRAIN = 3, H_DECAY = 5, GROWTH = 350;
const METHODS = [
  { pr: 16, tr: 6, tt: 600, tb: false, lr: 110, lb: false, hr: 10 },
  { pr: 22, tr: 4, tt: 500, tb: true, lr: 60, lb: true, hr: 6 },
  { pr: 13, tr: 10, tt: 600, tb: true, lr: 88, lb: true, hr: 9 },
  { pr: 12, tr: 7, tt: 600, tb: true, lr: 66, lb: true, hr: 7 },
];
const LEVELS = [
  { target: 240000, time: 9375, heatBonus: 0, prod: 20, distinct: 0 },
  { target: 420000, time: 11250, heatBonus: 0, prod: 22, distinct: 3 },
  { target: 600000, time: 13125, heatBonus: 3, prod: 28, distinct: 4 },
];
const EX = [0, 300, 700, 850, 1000], EY = [700, 1000, 1000, 620, 260];

function eff(heat) {
  let h = Math.max(0, Math.min(1000, heat));
  for (let i = 0; i < 4; i++) {
    if (h <= EX[i + 1]) return Math.floor((EY[i] * (EX[i + 1] - h) + EY[i + 1] * (h - EX[i])) / (EX[i + 1] - EX[i]));
  }
  return 260;
}
function rngNext(st) {
  let z = (st + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}
function rngAdvance(st) { return (st + 0x9e3779b9) >>> 0; }

function newState(levelIdx, overrides = {}) {
  const lv = LEVELS[levelIdx];
  const s = {
    arousalMilli: 0, capacityUl: [90000, 90000], distinctMask: 0, growthTotalUl: 0,
    heatMilli: [0, 0, 0, 0], lastLetdownMethod: -1, letdownCount: 0,
    letdownsByMethod: [0, 0, 0, 0], letdownStepsLeft: 0,
    level: { targetUl: lv.target, timeSteps: lv.time, heatBonus: lv.heatBonus, prodRateUl: lv.prod, requiredDistinct: lv.distinct },
    method: 0, phase: 0, pressureMilli: 0, roundStepsElapsed: 0, roundStepsLeft: lv.time,
    side: 0, volumeUl: [90000, 90000], yieldByMethodUl: [0, 0, 0, 0], yieldTotalUl: 0,
  };
  for (const k of Object.keys(overrides)) s[k] = overrides[k];
  return s;
}
const clamp = (v) => Math.max(0, Math.min(1000, v));
function extract(s, side, want) {
  let got = Math.max(0, Math.min(want, s.volumeUl[side]));
  s.volumeUl[side] -= got;
  s.yieldTotalUl += got;
  s.yieldByMethodUl[s.method] += got;
}
function step(s, held, mIn, sIn) {
  if (s.phase !== 0) return;
  if (mIn >= 0 && mIn < 4) s.method = mIn;
  if (sIn >= 0 && sIn < 2) s.side = sIn;
  const p = METHODS[s.method];
  for (let sd = 0; sd < 2; sd++) s.volumeUl[sd] = Math.min(s.capacityUl[sd], s.volumeUl[sd] + s.level.prodRateUl);
  for (let m = 0; m < 4; m++) {
    s.heatMilli[m] = clamp(s.heatMilli[m] + ((m === s.method && held) ? p.hr + s.level.heatBonus : -H_DECAY));
  }
  s.pressureMilli = clamp(s.pressureMilli + (held ? p.pr : -P_DECAY));
  s.arousalMilli = clamp(s.arousalMilli + (held ? Math.floor((s.pressureMilli * 16) / 1000) : -A_DECAY));
  const th = s.method === 1 ? THRESH_CLAMPS : THRESH;
  if (s.letdownStepsLeft === 0 && s.arousalMilli >= th) {
    s.letdownStepsLeft = LD_STEPS;
    s.letdownCount += 1;
    s.letdownsByMethod[s.method] += 1;
    s.distinctMask |= 1 << s.method;
    s.lastLetdownMethod = s.method;
    const sides = p.lb ? [0, 1] : [s.side];
    for (const sd of sides) { s.capacityUl[sd] += GROWTH; s.growthTotalUl += GROWTH; }
  }
  const e = eff(s.heatMilli[s.method]);
  if (s.letdownStepsLeft > 0) {
    s.arousalMilli = clamp(s.arousalMilli - A_DRAIN);
    const want = Math.floor((p.lr * e) / 1000);
    if (p.lb) { extract(s, 0, want); extract(s, 1, want); } else extract(s, s.side, want);
    s.letdownStepsLeft -= 1;
    if (s.letdownStepsLeft === 0 && s.arousalMilli > RESIDUAL) s.arousalMilli = RESIDUAL;
  } else if (held && s.pressureMilli >= p.tt) {
    const want = Math.floor((p.tr * e) / 1000);
    if (p.tb) { extract(s, 0, want); extract(s, 1, want); } else extract(s, s.side, want);
  }
  s.roundStepsLeft -= 1;
  s.roundStepsElapsed += 1;
  let distinct = 0;
  for (let m = 0; m < 4; m++) if (((s.distinctMask >> m) & 1) === 1) distinct += 1;
  if (s.yieldTotalUl >= s.level.targetUl && distinct >= s.level.requiredDistinct) s.phase = 1;
  else if (s.roundStepsLeft <= 0) s.phase = 2;
}

function digest(s) {
  const f = [
    s.arousalMilli, s.capacityUl[0], s.capacityUl[1], s.distinctMask, s.growthTotalUl,
    s.heatMilli[0], s.heatMilli[1], s.heatMilli[2], s.heatMilli[3],
    s.lastLetdownMethod + 1, s.letdownCount,
    s.letdownsByMethod[0], s.letdownsByMethod[1], s.letdownsByMethod[2], s.letdownsByMethod[3],
    s.letdownStepsLeft, s.method, s.phase, s.pressureMilli, s.roundStepsElapsed, s.side,
    s.volumeUl[0], s.volumeUl[1], s.yieldTotalUl,
  ];
  let h = 2166136261;
  for (const v of f) h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
  return h >>> 0;
}
function snap(s) {
  return {
    arousalMilli: s.arousalMilli, capacityUl: [...s.capacityUl], distinctMask: s.distinctMask,
    growthTotalUl: s.growthTotalUl, heatMilli: [...s.heatMilli], lastLetdownMethod: s.lastLetdownMethod,
    letdownCount: s.letdownCount, letdownsByMethod: [...s.letdownsByMethod],
    letdownStepsLeft: s.letdownStepsLeft, method: s.method, phase: s.phase,
    pressureMilli: s.pressureMilli, roundStepsElapsed: s.roundStepsElapsed,
    roundStepsLeft: s.roundStepsLeft, side: s.side, volumeUl: [...s.volumeUl],
    yieldByMethodUl: [...s.yieldByMethodUl], yieldTotalUl: s.yieldTotalUl,
  };
}

// Run one scenario: segments applied in order; checkpoints recorded at
// absolute step counts (digest + full snapshot).
function runScenario(sc) {
  const s = newState(sc.level, sc.init ?? {});
  const wanted = new Set(sc.checkpoints);
  const got = [];
  let at = 0;
  outer: for (const seg of sc.segments) {
    for (let i = 0; i < seg.steps; i++) {
      step(s, seg.held, seg.method ?? -1, seg.side ?? -1);
      at += 1;
      if (wanted.has(at)) got.push({ step: at, digest: digest(s), state: snap(s) });
      if (s.phase !== 0) break outer; // frozen thereafter; the record ends at the verdict
    }
  }
  // Final checkpoint is always present.
  if (!got.length || got[got.length - 1].step !== at) {
    got.push({ step: at, digest: digest(s), state: snap(s) });
  }
  return { ...sc, checkpoints: undefined, results: got };
}

const rotation = (segSteps, total, startSide = 0) => {
  // Circuit script: rotate methods every segSteps, alternate the
  // addressed side on each pinch engagement.
  const segs = [];
  let left = total;
  let round = 0;
  while (left > 0) {
    const n = Math.min(segSteps, left);
    const method = round % 4;
    segs.push({ steps: n, held: true, method, side: method === 0 ? (round >> 2) % 2 : startSide });
    left -= n;
    round += 1;
  }
  return segs;
};

const scenarios = [
  { id: "idle-100", level: 0, segments: [{ steps: 100, held: false }], checkpoints: [100] },
  { id: "pinch-build-200", level: 0, segments: [{ steps: 200, held: true, method: 0, side: 0 }], checkpoints: [63, 100, 200] },
  { id: "pump-marathon-1500", level: 0, segments: [{ steps: 1500, held: true, method: 2 }], checkpoints: [500, 1000, 1500] },
  { id: "clamps-threshold-400", level: 0, segments: [{ steps: 400, held: true, method: 1 }], checkpoints: [60, 61, 400] },
  { id: "boundary-below-850", level: 0, init: { arousalMilli: 833, pressureMilli: 1000 }, segments: [{ steps: 4, held: true, method: 0 }], checkpoints: [1, 2, 4] },
  { id: "boundary-clamps-750", level: 0, init: { arousalMilli: 733, pressureMilli: 1000 }, segments: [{ steps: 4, held: true, method: 1 }], checkpoints: [1, 2, 4] },
  { id: "release-decay-100", level: 0, init: { arousalMilli: 800, pressureMilli: 900 }, segments: [{ steps: 100, held: false }], checkpoints: [37, 100] },
  { id: "side-targeting-500", level: 0, segments: [{ steps: 500, held: true, method: 0, side: 1 }], checkpoints: [500] },
  { id: "heat-soak-1200", level: 2, segments: [{ steps: 1200, held: true, method: 0, side: 0 }], checkpoints: [76, 77, 1200] },
  { id: "rotation-circuit-2400", level: 1, segments: rotation(300, 2400), checkpoints: [300, 1200, 2400] },
  { id: "full-round-win", level: 0, segments: rotation(350, 9375), checkpoints: [9375] },
  { id: "circuit-win", level: 1, segments: rotation(300, 11250), checkpoints: [11250] },
  { id: "grand-win", level: 2, segments: rotation(300, 13125), checkpoints: [13125] },
  { id: "full-round-lose", level: 0, segments: [{ steps: 9375, held: false }], checkpoints: [9374, 9375] },
];

const out = {
  schema: "milkmaid-kernel-vectors/1",
  source: "src/kernel.mojo (reference) via tools/gen-vectors.mjs (transcription driver)",
  tolerance: "exact — integer model, no tolerances",
  efficiency: [0, 150, 300, 500, 700, 775, 850, 925, 1000, -5, 1200].map((h) => ({ heat: h, eff: eff(h) })),
  rng: [
    { seed: 12345, stream: (() => { let st = 12345; const r = []; for (let i = 0; i < 8; i++) { r.push(rngNext(st)); st = rngAdvance(st); } return r; })() },
    { seed: 0, stream: (() => { let st = 0; const r = []; for (let i = 0; i < 4; i++) { r.push(rngNext(st)); st = rngAdvance(st); } return r; })() },
  ],
  scenarios: scenarios.map(runScenario),
};

writeFileSync(join(root, "conformance/vectors.json"), JSON.stringify(out, null, 1) + "\n");
for (const sc of out.scenarios) {
  const last = sc.results[sc.results.length - 1];
  console.log(`${sc.id}: final step ${last.step} phase=${last.state.phase} yield=${last.state.yieldTotalUl} letdowns=${last.state.letdownCount} digest=${last.digest}`);
}
console.log(`gen-vectors: wrote conformance/vectors.json (${out.scenarios.length} scenarios)`);
