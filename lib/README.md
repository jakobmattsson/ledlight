# Local Awilix replacement

`awilix.js` is a local drop-in implementation of the Awilix API used by
Ledlight. It supports value and function registrations, proxy injection,
singleton lifetime, and the module discovery patterns used by the repository.
It does not implement the full Awilix package.

We replaced the npm dependency because its `fast-glob` → `micromatch` →
`braces` dependency chain produced a high-severity
[audit advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), with no
patched `braces` release available at the time. Keeping the small API locally
lets the composition code retain its Awilix-style calls without pulling in that
dependency chain.

When composition code needs another Awilix feature, add only the required
behavior here and cover it with a test in `tests/conventions/awilix.test.js`.
