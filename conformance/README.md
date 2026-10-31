# Conformance harness — Milkmaid

The shipped game logic is a JS transliteration of the Mojo kernel in
`src/kernel.mojo`. This harness proves they agree:

1. Generate golden vectors from the Mojo kernel (fixed seed, fixed inputs).
2. Run the same vectors through the JS transliteration.
3. Compare within the tolerance stated in `docs/BUILD.md`; any breach fails
   the week's gate and is filed in the breakage log.

Golden vectors land in `conformance/vectors/` at build time.
