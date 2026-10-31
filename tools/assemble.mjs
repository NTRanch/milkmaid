// assemble.mjs — build the single-file jam entry web/index.html from
// core/kernel.mjs + web/game.mjs + web/shell.html. The shipped core is
// pure JS (the Mojo reference has no browser target — D-335 seam), so
// assembly is concatenation with module syntax stripped, kernel first.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kernelMjs = readFileSync(join(root, "core/kernel.mjs"), "utf8")
  .replace(/^export /gm, "");
const gameMjs = readFileSync(join(root, "web/game.mjs"), "utf8")
  .replace(/import \{[^}]*\} from "[^"]+";/s, "")
  .replace(/^export /gm, "");
const shell = readFileSync(join(root, "web/shell.html"), "utf8");

const out = shell
  .replace("/*__KERNEL_MJS__*/", () => kernelMjs)
  .replace("/*__GAME_MJS__*/", () => gameMjs);
if (out === shell) throw new Error("shell placeholders not found — nothing assembled");
if (out.includes("__KERNEL_MJS__") || out.includes("__GAME_MJS__")) {
  throw new Error("a placeholder survived assembly");
}
writeFileSync(join(root, "web/index.html"), out);
console.log(`assembled web/index.html (${out.length} bytes, kernel ${kernelMjs.length} chars, game ${gameMjs.length} chars)`);
