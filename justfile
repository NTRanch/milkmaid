# Milkmaid — task recipes (wired at the v1.0 build, 2026-10-30).
# The Mojo reference kernel has no toolchain in the sandbox and no
# browser target (breakage B-1): the build assembles the shipped JS
# transliteration, and the check gate proves the transliteration
# against the kernel's conformance vectors.

# Assemble the single-file jam entry: kernel + game inlined into the shell
build:
    node tools/assemble.mjs

# Run every gate: tables, vectors, conformance, tests, bridges, perf, playtest
check:
    node tools/gen-tables.mjs
    node tools/gen-vectors.mjs
    node tools/conformance.mjs
    node tools/tests.mjs
    node tools/assemble.mjs
    node tools/settings-check.mjs
    node tools/perf.mjs
    node tools/playtest.mjs

# Render the per-level preview videos from the shipped core (demo mode)
previews:
    node tools/capture.mjs 0 20264
    node tools/capture.mjs 1 20264
    node tools/capture.mjs 2 20264

# Build the planning book
book:
    mdbook build book
