// settings-check.mjs — gates R-202/R-203/R-403: the settings bridge
// and the chart-archive bridge round-trip, and the settings screen is
// reachable from boot with no progression (safety/accessibility
// options are never gated).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, INPUT } from "../web/game.mjs";

void dirname; void join; void fileURLToPath;
const game = createGame({ seed: 7, level: 0, demo: false });

function steps(n, bits = 0) { for (let i = 0; i < n; i++) game.step(bits); }
function fail(msg) { console.error(`settings-check: ${msg}`); process.exit(1); }

if (game.screen() !== 0) fail("boot screen is not the 18+ gate");
game.applySettings(true, false);
if (game.settingsBits() !== 1) fail("applySettings(unhurried) did not round-trip");
game.applySettings(false, true);
if (game.settingsBits() !== 2) fail("applySettings(text_large) did not round-trip");
game.applySettings(true, true);

// The archive bridge: lifetime chart totals restore before any round.
game.applyArchive(123456, 7, 3, 50000);
const bits = game.archiveBits();
if (bits.yieldUl !== 123456 || bits.letdowns !== 7 || bits.rounds !== 3 || bits.bestUl !== 50000) {
  fail(`applyArchive did not round-trip: ${JSON.stringify(bits)}`);
}
game.applyArchive(-5, -1, -2, -9);
const clamped = game.archiveBits();
if (clamped.yieldUl !== 0 || clamped.rounds !== 0) fail("applyArchive did not clamp hostile values");

// Navigate gate -> title -> settings with plain input, no play first.
steps(1, INPUT.confirm);
if (game.screen() !== 1) fail("confirm did not leave the gate");
steps(1, INPUT.down); steps(1, INPUT.down); steps(1, INPUT.down);
steps(1, INPUT.confirm);
if (game.screen() !== 5) fail(`settings not reachable from title (screen=${game.screen()})`);
steps(2);
if (!game.frameText().includes("UNHURRIED")) fail("settings screen does not name the UNHURRIED option");
if (!game.frameText().includes("LARGE")) fail("settings screen does not show restored LARGE text");
console.log("settings-check: settings + archive bridges round-trip; settings reachable ungated; restored values render");
