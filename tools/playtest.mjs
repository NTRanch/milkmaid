// playtest.mjs — automated playtest: the demo policy serves every
// round to victory against the shipped JS core, meeting each round's
// circuit requirement. This is the sandbox playtest of record; the
// seahawk pass on primo is the follow-up named in docs/BREAKAGE-LOG.md.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame } from "../web/game.mjs";
import { LEVEL_TABLE } from "../core/kernel.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
void root;
const SCREENS = ["gate", "title", "howto", "play", "pause", "settings", "victory", "gameover", "chart"];

let failures = 0;
for (let level = 0; level < 3; level++) {
  const game = createGame({ seed: 9000 + level, level, demo: true });
  game.startLevel(level);
  let steps = 0;
  const maxSteps = (6 * 60 * 1000) / 16;
  while (game.screen() !== 6 && steps < maxSteps) {
    game.step(0);
    steps++;
  }
  const won = game.screen() === 6;
  const rec = game.lastRound();
  const circuitOk = rec && rec.distinct >= LEVEL_TABLE[level].requiredDistinct;
  console.log(`level ${level + 1}: screen=${SCREENS[game.screen()]} steps=${steps} yield=${rec ? (rec.yieldUl / 1000).toFixed(1) : "?"}ml letdowns=${rec ? rec.letdowns : "?"} distinct=${rec ? rec.distinct : "?"} ${won && circuitOk ? "VICTORY" : "FAIL"}`);
  if (!won || !circuitOk) failures++;
}
if (failures) {
  console.error(`playtest: ${failures} level(s) not cleanly completed by the demo policy`);
  process.exit(1);
}
console.log("playtest: all 3 levels completed, circuit requirements met");
