// gen-tables.mjs — emit tables/method-tables.json from the kernel's
// method + level tables (the kernel generates the entry's data tables;
// the JSON is the shipped-data artifact the book and any future
// consumer read). Regenerate with: node tools/gen-tables.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVEL_TABLE, METHOD_FULL_NAMES, METHOD_TABLE } from "../core/kernel.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = {
  schema: "milkmaid-tables/1",
  source: "src/kernel.mojo via core/kernel.mjs (checked copy); regenerate: node tools/gen-tables.mjs",
  units: "volumes microlitres (uL); rates uL per 16 ms step; pressure/arousal/heat milli-units 0..1000",
  methods: METHOD_TABLE.map((m, i) => ({ index: i, name: METHOD_FULL_NAMES[i], ...m })),
  levels: LEVEL_TABLE.map((l, i) => ({ index: i, ...l })),
};
writeFileSync(join(root, "tables/method-tables.json"), JSON.stringify(out, null, 1) + "\n");
console.log("gen-tables: wrote tables/method-tables.json");
