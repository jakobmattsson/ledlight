# Module system contract

This contract defines the supported entry points for extracting the module
system into its own package. The production entry point is
`src/composition/index.ts`; the testing entry point is
`src/composition/testing.ts`. Neither is exported from the Ledlight package root.

## Module tree

`createRepositoryContainer(modulesRoot)` accepts an absolute or relative path
to a compiled CommonJS module tree. The directory contains:

- `dependencies.yaml` with `allowed-modules` and `allowed-external` mappings.
- `external.js`, a factory returning the available external services.
- A flat `interfaces/` directory with one `<module>.js` facade factory per module.
- An `implementations/<module>/` directory for each facade. Runtime JavaScript
  files in it export factories. Direct `list-<name>/` directories register frozen
  lists of their recursively discovered factories.

Module and factory filenames use lowercase kebab-case. The container converts
them to camelCase registration names. Every module appears in both policy
mappings and has an implementation directory. Module dependencies must exist
and form an acyclic graph. External services are available only to modules
that list them in `allowed-external`.

## Runtime

`createRepositoryContainer(modulesRoot)` returns a frozen object with one
method: `resolve(moduleName)`. It returns the frozen facade for that module.
Unknown module names fail. A module can use its own factories and the facades
of modules listed in its policy. The runtime container has no override method.

## Architecture output

`generateArchitecture({ modulesRoot, dependsOnPath, usedByPath, diagramPath })`
returns a promise. It validates the module policy and writes the two sorted
YAML dependency views and an SVG diagram to the exact paths supplied. It
creates parent directories when needed. Optional `ubiquitous` names in the
policy affect only diagram rendering.

## Testing

The separate testing entry point provides
`createTestRepositoryContainer(modulesRoot)`. Its container also exposes
`overrideExternals(values)`, `overrideInternal(moduleName, name, value)`,
`resolveInternal(moduleName, name)`, and `order`. Overrides accept plain values
and clear previously constructed modules so later resolutions use the
replacement.
These methods are for tests; production code uses the runtime entry point.
