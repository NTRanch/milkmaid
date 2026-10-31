// game.mjs — Milkmaid game layer over the fluid-timeline kernel.
// Shared verbatim by the shipped page (inlined by tools/assemble.mjs)
// and the node capture/playtest harnesses. The kernel (core/kernel.mjs,
// the JS transliteration of the Mojo reference in src/kernel.mojo)
// owns the model; this layer owns screens, input, the demo policy, the
// service chart, and the draw list.
import {
  LEVEL_TABLE, METHOD_FULL_NAMES, METHOD_NAMES, PHASE_LOST, PHASE_WON,
  createState, levelParams, methodParams, stepState,
} from "../core/kernel.mjs";

export const PALETTE = [
  "#0d0208", "#ff2e88", "#f8f0ed", "#ac9393", "#540e46",
  "#ec8584", "#eaeaea", "#68636c", "#ffd166", "#1a0510",
];

export const INPUT = {
  tap: 1, confirm: 2, back: 4, pause: 8, up: 16, down: 32, side: 64,
  mPinch: 128, mClamps: 256, mPump: 512, mCups: 1024,
};
const METHOD_BITS = [INPUT.mPinch, INPUT.mClamps, INPUT.mPump, INPUT.mCups];

export const SCREEN = {
  GATE: 0, TITLE: 1, HOWTO: 2, PLAY: 3, PAUSE: 4, SETTINGS: 5,
  VICTORY: 6, GAMEOVER: 7, CHART: 8,
};

// Sonified event codes (shell maps them; audio answers input only).
export const EVENT = { NONE: 0, LETDOWN: 1, SWITCH: 2, VICTORY: 3, GAMEOVER: 4, SIDE: 5, START: 6 };

const SAMPLE_EVERY_STEPS = 30;
const SAMPLES_MAX = 56;
const SESSION_ROUNDS_MAX = 32;

function ml(ul) {
  return (ul / 1000).toFixed(1);
}

export function createGame({ seed = 1, level = 0, demo = false } = {}) {
  if (!Number.isInteger(level) || level < 0 || level >= LEVEL_TABLE.length) {
    throw new Error(`core init rejected level ${level}`);
  }
  const g = {
    demo,
    eventCode: EVENT.NONE,
    frameCount: 0,
    kernel: null,
    lastLetdownCount: 0,
    levelIdx: level,
    lifetime: { bestUl: 0, letdowns: 0, rounds: 0, yieldUl: 0 },
    menuCursor: 0,
    motes: [],
    pendingMethod: -1,
    roundRecorded: true,
    samples: [],
    screenNow: SCREEN.GATE,
    screenSteps: 0,
    seed: seed >>> 0,
    sessionChart: [],
    settings: { textLarge: false, unhurried: false },
    titleLevel: level,
  };
  // Ambient motes: positions from the seeded stream, generated once.
  let st = g.seed;
  for (let i = 0; i < 24; i++) {
    st = (st + 0x9e3779b9) >>> 0;
    let z = Math.imul(st ^ (st >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    z = (z ^ (z >>> 15)) >>> 0;
    const x = 20 + (z % 920);
    st = (st + 0x9e3779b9) >>> 0;
    let w = Math.imul(st ^ (st >>> 16), 0x21f0aaad) >>> 0;
    w = Math.imul(w ^ (w >>> 15), 0x735a2d97) >>> 0;
    w = (w ^ (w >>> 15)) >>> 0;
    g.motes.push([x, 20 + (w % 920)]);
  }

  function textSize(base) {
    return g.settings.textLarge ? Math.round(base * 1.25) : base;
  }

  function setScreen(s) {
    g.screenNow = s;
    g.screenSteps = 0;
    g.menuCursor = 0;
  }

  function startLevel(l) {
    if (!Number.isInteger(l) || l < 0 || l >= LEVEL_TABLE.length) {
      throw new Error(`core start_level rejected ${l}`);
    }
    g.levelIdx = l;
    g.kernel = createState(l);
    if (g.settings.unhurried) {
      // Accessibility: an unhurried round is a longer round. The
      // kernel's level block is data; the bridge adjusts the clock
      // before the first step and the record says so.
      const lp = g.kernel.level;
      g.kernel.level = { ...lp, timeSteps: Math.round(lp.timeSteps * 1.5) };
      g.kernel.roundStepsLeft = g.kernel.level.timeSteps;
    }
    g.lastLetdownCount = 0;
    g.pendingMethod = -1;
    g.roundRecorded = false;
    g.samples = [0];
    g.eventCode = EVENT.START;
    setScreen(SCREEN.PLAY);
  }

  function recordRound() {
    const k = g.kernel;
    const rec = {
      byMethodUl: [...k.yieldByMethodUl],
      distinct: [0, 1, 2, 3].filter((m) => ((k.distinctMask >> m) & 1) === 1).length,
      letdowns: k.letdownCount,
      level: g.levelIdx,
      stepsUsed: k.roundStepsElapsed,
      unhurried: g.settings.unhurried,
      won: k.phase === PHASE_WON,
      yieldUl: k.yieldTotalUl,
    };
    g.sessionChart.push(rec);
    if (g.sessionChart.length > SESSION_ROUNDS_MAX) g.sessionChart.shift();
    g.roundRecorded = true;
    return rec;
  }

  // The demo policy: a scripted maid's hand inside the game layer.
  // Ride each let-down out; between let-downs, work the circuit —
  // advance whenever the active method runs hot — and address the
  // fuller side with the pinch.
  function demoPolicy() {
    const k = g.kernel;
    let methodIn = -1;
    let sideIn = -1;
    if (k.letdownStepsLeft === 0 && k.heatMilli[k.method] >= 700) {
      methodIn = (k.method + 1) % 4;
    }
    if (k.method === 0 || methodIn === 0) {
      sideIn = k.volumeUl[0] >= k.volumeUl[1] ? 0 : 1;
    }
    return { held: true, methodIn, sideIn };
  }

  function stepPlay(bits) {
    const k = g.kernel;
    let held = (bits & INPUT.tap) !== 0;
    let methodIn = g.pendingMethod;
    let sideIn = -1;
    g.pendingMethod = -1;
    for (let m = 0; m < 4; m++) {
      if (bits & METHOD_BITS[m]) methodIn = m;
    }
    if (bits & INPUT.side) {
      sideIn = k.side === 0 ? 1 : 0;
      g.eventCode = EVENT.SIDE;
    }
    if (g.demo) {
      const p = demoPolicy();
      held = p.held;
      if (p.methodIn >= 0) methodIn = p.methodIn;
      if (p.sideIn >= 0) sideIn = p.sideIn;
    }
    const prevMethod = k.method;
    stepState(k, held, methodIn, sideIn);
    if (k.method !== prevMethod) g.eventCode = EVENT.SWITCH;
    if (k.letdownCount !== g.lastLetdownCount) {
      g.lastLetdownCount = k.letdownCount;
      g.eventCode = EVENT.LETDOWN;
    }
    if (k.roundStepsElapsed % SAMPLE_EVERY_STEPS === 0) {
      g.samples.push(k.yieldTotalUl);
      if (g.samples.length > SAMPLES_MAX) g.samples.shift();
    }
    if (k.phase !== 0 && !g.roundRecorded) {
      recordRound();
      if (k.phase === PHASE_WON) {
        g.eventCode = EVENT.VICTORY;
        setScreen(SCREEN.VICTORY);
      } else if (k.phase === PHASE_LOST) {
        g.eventCode = EVENT.GAMEOVER;
        setScreen(SCREEN.GAMEOVER);
      }
    }
  }

  function stepMenu(bits, rows, onConfirm) {
    if (bits & INPUT.down) g.menuCursor = Math.min(g.menuCursor + 1, rows - 1);
    if (bits & INPUT.up) g.menuCursor = Math.max(g.menuCursor - 1, 0);
    if (bits & (INPUT.confirm | INPUT.tap)) onConfirm(g.menuCursor);
  }

  function step(bits) {
    g.eventCode = EVENT.NONE;
    g.frameCount++;
    g.screenSteps++;
    switch (g.screenNow) {
      case SCREEN.GATE:
        if (g.demo && g.screenSteps > 37) setScreen(SCREEN.TITLE);
        else if (bits & (INPUT.confirm | INPUT.tap)) setScreen(SCREEN.TITLE);
        break;
      case SCREEN.TITLE:
        if (g.demo && g.screenSteps > 44) { startLevel(g.titleLevel); break; }
        stepMenu(bits, 5, (row) => {
          if (row === 0) startLevel(g.titleLevel);
          else if (row === 1) setScreen(SCREEN.HOWTO);
          else if (row === 2) setScreen(SCREEN.CHART);
          else if (row === 3) setScreen(SCREEN.SETTINGS);
          else g.titleLevel = (g.titleLevel + 1) % LEVEL_TABLE.length;
        });
        break;
      case SCREEN.HOWTO:
      case SCREEN.CHART:
        if (bits & (INPUT.back | INPUT.confirm)) setScreen(SCREEN.TITLE);
        break;
      case SCREEN.PLAY:
        if (bits & INPUT.pause) { setScreen(SCREEN.PAUSE); break; }
        stepPlay(bits);
        break;
      case SCREEN.PAUSE:
        if (bits & INPUT.pause) { setScreen(SCREEN.PLAY); break; }
        stepMenu(bits, 3, (row) => {
          if (row === 0) setScreen(SCREEN.PLAY);
          else if (row === 1) startLevel(g.levelIdx);
          else setScreen(SCREEN.TITLE);
        });
        break;
      case SCREEN.SETTINGS:
        if (bits & INPUT.back) { setScreen(SCREEN.TITLE); break; }
        stepMenu(bits, 3, (row) => {
          if (row === 0) g.settings.unhurried = !g.settings.unhurried;
          else if (row === 1) g.settings.textLarge = !g.settings.textLarge;
          else setScreen(SCREEN.TITLE);
        });
        break;
      case SCREEN.VICTORY:
        if (g.demo && g.screenSteps > 94) { setScreen(SCREEN.TITLE); break; }
        if (bits & (INPUT.confirm | INPUT.tap)) setScreen(SCREEN.CHART);
        else if (bits & INPUT.back) setScreen(SCREEN.TITLE);
        break;
      case SCREEN.GAMEOVER:
        if (g.demo && g.screenSteps > 94) { setScreen(SCREEN.TITLE); break; }
        if (bits & (INPUT.confirm | INPUT.tap | INPUT.back)) setScreen(SCREEN.TITLE);
        break;
      default:
        break;
    }
  }

  // --- persistence bridges (the shell owns localStorage) ---
  function applySettings(unhurried, textLarge) {
    g.settings.unhurried = !!unhurried;
    g.settings.textLarge = !!textLarge;
  }
  function settingsBits() {
    return (g.settings.unhurried ? 1 : 0) | (g.settings.textLarge ? 2 : 0);
  }
  function applyArchive(yieldUl, letdowns, rounds, bestUl) {
    g.lifetime = {
      bestUl: Math.max(0, bestUl | 0),
      letdowns: Math.max(0, letdowns | 0),
      rounds: Math.max(0, rounds | 0),
      yieldUl: Math.max(0, yieldUl | 0),
    };
  }
  function archiveBits() {
    return { ...g.lifetime };
  }
  function sessionChart() {
    return g.sessionChart.map((r) => ({ ...r, byMethodUl: [...r.byMethodUl] }));
  }
  function lastRound() {
    const r = g.sessionChart[g.sessionChart.length - 1];
    return r ? { ...r, byMethodUl: [...r.byMethodUl] } : null;
  }

  // --- draw list ---
  function frame() {
    const ops = [];
    const R = (x, y, w, h, c) => ops.push(["r", x, y, w, h, c]);
    const C = (x, y, r, c) => ops.push(["c", x, y, r, c]);
    const L = (x1, y1, x2, y2, w, c) => ops.push(["l", x1, y1, x2, y2, w, c]);
    const P = (x1, y1, x2, y2, x3, y3, c) => ops.push(["p", x1, y1, x2, y2, x3, y3, c]);
    const T = (x, y, size, c, s) => ops.push(["t", x, y, textSize(size), c, s]);
    R(0, 0, 960, 960, 0);
    for (let i = 0; i < g.motes.length; i++) {
      if (((g.frameCount >> 4) + i) % 5 === 0) continue;
      C(g.motes[i][0], g.motes[i][1], 2, 7);
    }
    switch (g.screenNow) {
      case SCREEN.GATE: drawGate(T); break;
      case SCREEN.TITLE: drawTitle(T, R); break;
      case SCREEN.HOWTO: drawHowto(T); break;
      case SCREEN.PLAY: drawPlay({ C, L, P, R, T }); break;
      case SCREEN.PAUSE: drawPlay({ C, L, P, R, T }); drawPause(T, R); break;
      case SCREEN.SETTINGS: drawSettings(T); break;
      case SCREEN.VICTORY: drawEnd(T, true); break;
      case SCREEN.GAMEOVER: drawEnd(T, false); break;
      case SCREEN.CHART: drawChart(T, R); break;
      default: break;
    }
    return { palette: PALETTE, ops };
  }

  function drawGate(T) {
    T(240, 250, 64, 1, "MILKMAID");
    T(240, 350, 26, 6, "18+ ONLY BEYOND THIS GATE");
    T(240, 410, 22, 3, "AN ADULT GAME OF SERVICE, BY NICE THOUGHTS RANCH.");
    T(240, 445, 22, 3, "LACTATION AND MAID SERVICE, PRESENTED IN THE ABSTRACT.");
    T(240, 480, 22, 3, "EVERYTHING IS SYMBOLIC. NO ONE IS REAL.");
    T(240, 560, 24, 8, "PRESS ENTER OR TAP TO CONFIRM YOU ARE 18+");
  }

  function menuRows(T, x, y0, dy, rows, cursor) {
    rows.forEach((label, i) => {
      const y = y0 + i * dy;
      if (i === cursor) T(x - 40, y, 34, 1, ">");
      T(x, y, 34, i === cursor ? 1 : 6, label);
    });
  }

  function drawTitle(T, R) {
    T(240, 110, 72, 1, "MILKMAID");
    T(240, 205, 24, 3, "MILK, MADE SERVICE - ALMA KEEPS THE CHART");
    menuRows(T, 240, 320, 62, ["BEGIN SERVICE", "HOW TO SERVE", "THE CHART", "SETTINGS"], g.menuCursor);
    const y = 320 + 4 * 62;
    if (g.menuCursor === 4) T(200, y, 34, 1, ">");
    const lp = LEVEL_TABLE[g.titleLevel];
    T(240, y, 34, g.menuCursor === 4 ? 1 : 6, `ROUND: ${lp.name}`);
    T(240, y + 46, 20, 3, `TARGET ${ml(lp.targetUl)} ML - ${(lp.timeSteps * 16 / 1000) | 0}S - CIRCUIT ${lp.requiredDistinct === 0 ? "FREE" : lp.requiredDistinct + " METHODS"} - TAP ROW TO CHANGE`);
    if (g.lifetime.rounds > 0) {
      T(240, 700, 22, 8, `THE ARCHIVE: ${g.lifetime.rounds} ROUNDS - ${ml(g.lifetime.yieldUl)} ML - ${g.lifetime.letdowns} LET-DOWNS`);
    }
    T(240, 880, 20, 7, "ARROWS CHOOSE - ENTER CONFIRMS");
    void R;
  }

  function drawHowto(T) {
    T(110, 100, 40, 1, "HOW TO SERVE");
    const lines = [
      "HOLD (OR HOLD SPACE) TO WORK THE ACTIVE METHOD.",
      "PRESSURE BUILDS. AROUSAL FOLLOWS IT UPWARD.",
      "AT THE THRESHOLD SHE LETS DOWN - AND THE FLOW",
      "LANDS IN WHICHEVER METHOD IS ACTIVE. THE CHART",
      "NAMES IT. THERE IS NO OTHER WAY IT IS COUNTED.",
      "",
      "KEYS 1-4 SWITCH THE CIRCUIT: PINCH, CLAMPS,",
      "PUMP SUCTION, CUPS. TAB ADDRESSES THE OTHER SIDE.",
      "A METHOD WORKED TOO LONG GOES DULL - WATCH ITS",
      "HEAT. ROTATE. LATER ROUNDS REQUIRE THE CIRCUIT:",
      "LET-DOWNS LANDED WITH 3, THEN ALL 4, METHODS.",
      "",
      "HER BODY REFILLS AND GROWS: EVERY LET-DOWN ADDS",
      "CAPACITY, AND THE CHART KEEPS ALL OF IT.",
    ];
    lines.forEach((s, i) => T(110, 190 + i * 44, 24, 6, s));
    T(110, 850, 22, 8, "ENTER OR ESC TO RETURN");
  }

  function drawSettings(T) {
    T(240, 160, 44, 1, "SETTINGS");
    const rows = [
      `UNHURRIED ROUNDS: ${g.settings.unhurried ? "ON" : "OFF"}`,
      `TEXT: ${g.settings.textLarge ? "LARGE" : "NORMAL"}`,
      "BACK",
    ];
    menuRows(T, 240, 300, 70, rows, g.menuCursor);
    T(240, 560, 20, 3, "SETTINGS ARE NEVER GATED. THEY APPLY AT ONCE");
    T(240, 590, 20, 3, "AND ARE REMEMBERED BETWEEN VISITS.");
  }

  function drawPause(T, R) {
    R(230, 260, 500, 400, 9);
    T(330, 300, 44, 1, "HELD");
    menuRows(T, 340, 400, 64, ["RESUME", "RESTART ROUND", "QUIT TO TITLE"], g.menuCursor);
  }

  function drawPlay({ C, L, P, R, T }) {
    const k = g.kernel;
    if (!k) return;
    const lp = k.level;
    // Header: the round, and the clock, counted down in the open.
    T(36, 28, 26, 6, LEVEL_TABLE[g.levelIdx].name);
    T(36, 62, 20, 3, "MILK, MADE SERVICE");
    const secsLeft = Math.ceil((k.roundStepsLeft * 16) / 1000);
    T(700, 20, 84, secsLeft <= 15 ? 1 : 6, String(secsLeft));
    T(706, 8, 18, 3, "SECONDS OF SERVICE");
    // Yield target bar.
    T(36, 118, 24, 1, `YIELD ${ml(k.yieldTotalUl)} / ${ml(lp.targetUl)} ML`);
    R(36, 152, 888, 16, 9);
    R(36, 152, Math.min(888, Math.round((888 * k.yieldTotalUl) / lp.targetUl)), 16, 1);
    // The circuit requirement, as pips.
    if (lp.requiredDistinct > 0) {
      T(560, 118, 22, 3, "CIRCUIT");
      for (let m = 0; m < 4; m++) {
        const done = ((k.distinctMask >> m) & 1) === 1;
        C(716 + m * 34, 130, 11, done ? 1 : 7);
      }
    }
    drawTank({ C, L, R, T }, 0, 150);
    drawTank({ C, L, R, T }, 1, 590);
    drawGauges({ L, R, T });
    // Let-down banner: the culmination, named.
    if (k.letdownStepsLeft > 0) {
      T(268, 226, 34, 8, `LET-DOWN - ${METHOD_FULL_NAMES[k.lastLetdownMethod]}`);
      L(370, 420, 460, 640, 3, 1);
      L(590, 420, 500, 640, 3, 1);
    } else if (k.lastLetdownMethod >= 0) {
      T(36, 226, 20, 3, `LAST LET-DOWN LANDED IN: ${METHOD_FULL_NAMES[k.lastLetdownMethod]} (X${k.letdownCount})`);
    }
    drawMethodRow({ L, R, T });
    drawTimeline({ L, R, T });
    T(36, 922, 18, 7, "HOLD TO SERVE - 1-4 METHODS - TAB SIDE - P PAUSE");
    void P;
  }

  function drawTank({ C, L, R, T }, side, x) {
    const k = g.kernel;
    const y = 300, w = 220, h = 300;
    const frac = k.capacityUl[side] > 0 ? k.volumeUl[side] / k.capacityUl[side] : 0;
    R(x, y + h - Math.round(h * frac), w, Math.round(h * frac), 2);
    L(x, y, x + w, y, 2, 6);
    L(x, y, x, y + h, 2, 6);
    L(x + w, y, x + w, y + h, 2, 6);
    L(x, y + h, x + w, y + h, 2, 6);
    T(x + 52, y + h + 12, 22, 6, side === 0 ? "LEFT" : "RIGHT");
    T(x + 8, y + h + 44, 20, 3, `${ml(k.volumeUl[side])} / ${ml(k.capacityUl[side])} ML`);
    if (k.side === side) {
      // Dotted ring of attention around the addressed side.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + g.frameCount * 0.01;
        C(x + w / 2 + Math.cos(a) * (w / 2 + 18), y + h / 2 + Math.sin(a) * (h / 2 + 18), 4, 1);
      }
      T(x + 30, y - 32, 20, 1, "IN SERVICE");
    }
  }

  function drawGauges({ L, R, T }) {
    const k = g.kernel;
    const y = 300, h = 300;
    // Pressure (rose), arousal (gold) with its threshold tick.
    R(448, y + h - Math.round((h * k.pressureMilli) / 1000), 26, Math.round((h * k.pressureMilli) / 1000), 5);
    L(448, y, 448, y + h, 1, 7);
    L(474, y, 474, y + h, 1, 7);
    T(410, y + h + 12, 16, 3, "PRESS");
    R(496, y + h - Math.round((h * k.arousalMilli) / 1000), 26, Math.round((h * k.arousalMilli) / 1000), 8);
    L(496, y, 496, y + h, 1, 7);
    L(522, y, 522, y + h, 1, 7);
    const th = k.method === 1 ? 750 : 850;
    const ty = y + h - Math.round((h * th) / 1000);
    L(488, ty, 530, ty, 3, 1);
    T(492, y + h + 12, 16, 3, "RISE");
  }

  function drawMethodRow({ L, R, T }) {
    const k = g.kernel;
    for (let m = 0; m < 4; m++) {
      const x = 36 + m * 228;
      const y = 668;
      const active = k.method === m;
      R(x, y, 204, 96, active ? 4 : 9);
      if (active) {
        L(x, y, x + 204, y, 3, 1);
        L(x, y + 96, x + 204, y + 96, 3, 1);
      }
      T(x + 14, y + 12, 24, active ? 1 : 6, METHOD_NAMES[m]);
      // Heat: the dullness of a method worked too long.
      R(x + 14, y + 56, 176, 10, 0);
      R(x + 14, y + 56, Math.round((176 * k.heatMilli[m]) / 1000), 10, k.heatMilli[m] >= 850 ? 1 : 5);
      T(x + 14, y + 70, 16, 3, `X${k.letdownsByMethod[m]} LET-DOWNS`);
    }
  }

  function drawTimeline({ L, R, T }) {
    const k = g.kernel;
    T(36, 792, 20, 3, "THE FLUID TIMELINE - YIELD AS IT CAME");
    T(620, 792, 20, 8, `GROWN +${ml(k.growthTotalUl)} ML`);
    const x0 = 36, y0 = 884, w = 888, h = 64;
    L(x0, y0, x0 + w, y0, 1, 7);
    const n = g.samples.length;
    if (n > 1) {
      const peak = Math.max(1, g.samples[n - 1]);
      for (let i = 1; i < n; i++) {
        const xa = x0 + Math.round((w * (i - 1)) / (SAMPLES_MAX - 1));
        const xb = x0 + Math.round((w * i) / (SAMPLES_MAX - 1));
        const ya = y0 - Math.round((h * g.samples[i - 1]) / peak);
        const yb = y0 - Math.round((h * g.samples[i]) / peak);
        L(xa, ya, xb, yb, 2, 1);
      }
    }
    void R;
  }

  function roundRecordLines(T, rec, x, y) {
    const lp = LEVEL_TABLE[rec.level];
    T(x, y, 26, 6, `${lp.name} - ${rec.won ? "SERVED IN FULL" : "UNFINISHED"}`);
    T(x, y + 42, 22, 3, `YIELD ${ml(rec.yieldUl)} ML - ${rec.letdowns} LET-DOWNS - ${(rec.stepsUsed * 16 / 1000).toFixed(0)}S OF SERVICE${rec.unhurried ? " - UNHURRIED" : ""}`);
    const parts = METHOD_NAMES.map((n, m) => `${n} ${ml(rec.byMethodUl[m])}`);
    T(x, y + 78, 20, 3, `BY METHOD: ${parts.join(" - ")}`);
  }

  function drawEnd(T, won) {
    const rec = g.sessionChart[g.sessionChart.length - 1];
    if (won) {
      T(180, 220, 52, 1, "SERVICE COMPLETE");
      T(180, 300, 26, 6, "THE ROUND IS SERVED, AND THE CHART KEEPS IT.");
    } else {
      T(180, 220, 52, 6, "THE ROUND SLIPS AWAY");
      T(180, 300, 26, 3, "THE SERVICE WAS REAL. THE TARGET WAS NOT MET.");
    }
    if (rec) roundRecordLines(T, rec, 180, 400);
    T(180, 640, 24, 8, won ? "ENTER: READ THE CHART - ESC: TITLE" : "ENTER OR TAP TO RETURN");
  }

  function drawChart(T, R) {
    T(80, 70, 44, 1, "THE CHART");
    T(80, 130, 22, 3, "GROWTH AND YIELD ARCHIVE - THE PUMP'S FULL CHARTING");
    T(80, 180, 24, 6, `LIFETIME: ${g.lifetime.rounds} ROUNDS - ${ml(g.lifetime.yieldUl)} ML - ${g.lifetime.letdowns} LET-DOWNS - BEST ${ml(g.lifetime.bestUl)} ML`);
    T(80, 240, 24, 1, "THIS SESSION");
    const rounds = [...g.sessionChart].reverse().slice(0, 5);
    if (rounds.length === 0) T(80, 290, 22, 3, "NO ROUNDS SERVED YET. THE CHART WAITS.");
    rounds.forEach((rec, i) => {
      const y = 290 + i * 106;
      T(80, y, 22, rec.won ? 1 : 3, `R${g.sessionChart.length - i} - ${LEVEL_TABLE[rec.level].name}`);
      T(80, y + 32, 20, 6, `${ml(rec.yieldUl)} ML - ${rec.letdowns} LET-DOWNS - CIRCUIT ${rec.distinct}/4${rec.unhurried ? " - UNHURRIED" : ""}`);
      const peak = Math.max(1, ...rec.byMethodUl);
      rec.byMethodUl.forEach((v, m) => {
        R(80 + m * 210, y + 66, Math.round((180 * v) / peak), 12, m === rec.byMethodUl.indexOf(peak) ? 1 : 4);
      });
    });
    T(80, 880, 20, 7, "ENTER OR ESC TO RETURN");
  }

  function frameText() {
    const { ops } = frame();
    return ops.map((op) => {
      if (op[0] === "t") return `t ${op[1]} ${op[2]} ${op[3]} ${op[4]} ${op[5]}`;
      return op.join(" ");
    }).join("\n");
  }

  return {
    applyArchive,
    applySettings,
    archiveBits,
    event: () => g.eventCode,
    frame,
    frameText,
    lastRound,
    levelIdx: () => g.levelIdx,
    screen: () => g.screenNow,
    sessionChart,
    settingsBits,
    startLevel,
    step,
    // Test-facing surface (the node harnesses use the same doors).
    kernelState: () => g.kernel,
    setPendingMethod: (m) => { g.pendingMethod = m; },
  };
}
