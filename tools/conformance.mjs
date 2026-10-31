// conformance.mjs — prove the shipped JS transliteration
// (core/kernel.mjs) reproduces the Mojo reference kernel's golden
// vectors EXACTLY. The model is integer-only, so there are no
// tolerances: any differing field, at any checkpoint, fails the gate.
//
// Also gated here: tables/method-tables.json must equal the kernel
// tables it was generated from (the shipped data is what the player
// experiences).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEVEL_TABLE, METHOD_TABLE, createState, efficiencyMilli, rngAdvance, rngNext,
  snapshotState, stateDigest, stepState,
} from "../core/kernel.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vectors = JSON.parse(readFileSync(join(root, "conformance/vectors.json"), "utf8"));

let failures = 0;
function fail(msg) {
  console.error(`conformance: ${msg}`);
  failures++;
}
function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// 1. Pure-function vectors: efficiency curve + RNG streams.
for (const v of vectors.efficiency) {
  const got = efficiencyMilli(v.heat);
  if (got !== v.eff) fail(`efficiency(${v.heat}) = ${got}, vector says ${v.eff}`);
}
for (const v of vectors.rng) {
  let st = v.seed >>> 0;
  for (let i = 0; i < v.stream.length; i++) {
    const got = rngNext(st);
    if (got !== v.stream[i]) fail(`rng(seed=${v.seed})[${i}] = ${got}, vector says ${v.stream[i]}`);
    st = rngAdvance(st);
  }
}
console.log(`conformance: pure functions ok (${vectors.efficiency.length} efficiency + ${vectors.rng.reduce((n, v) => n + v.stream.length, 0)} rng outputs)`);

// 2. Scenario vectors: replay the script, compare digest AND full
// snapshot at every recorded checkpoint.
let checkpoints = 0;
for (const sc of vectors.scenarios) {
  const s = createState(sc.level, sc.init ?? {});
  const wanted = new Map(sc.results.map((r) => [r.step, r]));
  let at = 0;
  outer: for (const seg of sc.segments) {
    for (let i = 0; i < seg.steps; i++) {
      stepState(s, seg.held, seg.method ?? -1, seg.side ?? -1);
      at += 1;
      const exp = wanted.get(at);
      if (exp) {
        checkpoints++;
        const d = stateDigest(s);
        if (d !== exp.digest) fail(`${sc.id}@${at}: digest ${d} != vector ${exp.digest}`);
        const snap = snapshotState(s);
        if (!deepEq(snap, exp.state)) {
          for (const k of Object.keys(exp.state)) {
            if (!deepEq(snap[k], exp.state[k])) {
              fail(`${sc.id}@${at}: field ${k} = ${JSON.stringify(snap[k])}, vector says ${JSON.stringify(exp.state[k])}`);
            }
          }
        }
      }
      if (s.phase !== 0) break outer;
    }
  }
  const lastExp = sc.results[sc.results.length - 1];
  if (at !== lastExp.step) fail(`${sc.id}: replay ended at step ${at}, vector ends at ${lastExp.step}`);
}
console.log(`conformance: ${vectors.scenarios.length} scenarios, ${checkpoints} checkpoints compared exactly`);

// 3. Tables identity: the generated JSON equals the kernel tables.
const tables = JSON.parse(readFileSync(join(root, "tables/method-tables.json"), "utf8"));
const methodsFromJson = tables.methods.map(({ index, name, ...rest }) => rest);
if (!deepEq(methodsFromJson, METHOD_TABLE)) fail("tables/method-tables.json methods differ from core/kernel.mjs METHOD_TABLE");
const levelsFromJson = tables.levels.map(({ index, ...rest }) => rest);
if (!deepEq(levelsFromJson, LEVEL_TABLE)) fail("tables/method-tables.json levels differ from core/kernel.mjs LEVEL_TABLE");
console.log("conformance: tables/method-tables.json identical to kernel tables");

if (failures) {
  console.error(`conformance: ${failures} failure(s)`);
  process.exit(1);
}
console.log("conformance: PASS — JS transliteration reproduces the kernel vectors exactly");
