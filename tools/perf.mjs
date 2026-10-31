// perf.mjs — gates R-401: one frame of simulation + draw-list emission
// must stay far inside the 16 ms step budget. Budget of record: 10,000
// steps (each producing a full draw list) in under 2 s on this machine
// (= 0.2 ms per step, 80x headroom). The shipped artefact is pure JS;
// its size is reported, not budgeted (no wasm this week).
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame } from "../web/game.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const game = createGame({ seed: 31, level: 2, demo: true });
game.startLevel(2);
const t0 = performance.now();
for (let i = 0; i < 10_000; i++) {
  game.step(0);
  game.frame();
}
const ms = performance.now() - t0;
const size = statSync(join(root, "web/index.html")).size;
console.log(`perf: 10000 steps+frames in ${ms.toFixed(1)} ms (${(ms / 10000).toFixed(3)} ms/step); web/index.html ${size} bytes`);
if (ms >= 2000) { console.error("perf: step budget exceeded"); process.exit(1); }
console.log("perf: within budget");
