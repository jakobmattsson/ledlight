# Package support and versioning

Ledlight is distributed as the public `@jakobm/ledlight` npm package under the MIT
license. The package contains generated CommonJS runtime files, TypeScript
declarations, the CLI,
Portico module-system dependency, license, README, and consumer
documentation. Repository configuration, tests, fixtures, the Ohm-based
reference parser, and the improvement backlog are not published.

This integration branch uses a local `file:` dependency on Portico to review
the package boundary. Replace it with a registry version before publishing
Ledlight or running its package workflow on another machine.

## Releasing

Run `npm run release -- patch`, `npm run release -- minor`, or
`npm run release -- major` from this repository. `worktree-keeper` provides the
release command. It requires a clean working tree, a root package version, and
the expected GitHub Actions publish job. It checks out the default branch if
necessary and requires its local commit to match `origin` exactly. It then
increments the chosen version component by
one, updates `package.json` and any npm lockfile present, commits with the new
version as the entire commit message, and pushes that commit. Only after the
commit push succeeds does it create and push the matching `v<version>` tag.
The preflight lockfile check compares it with the current package version;
`npm version` updates it to the new version automatically.

The command waits for the publish job to succeed and then for the version to
become visible on the public npm registry. It reports the elapsed time from job
completion to registry visibility. A failed guard, push, job, or registry wait
stops the command and reports the last completed stage. Inspect the repository
and remote state before retrying an interrupted release. The command requires
Git and an authenticated GitHub CLI (`gh`) with repository and Actions access.

The `package.yml` GitHub Actions workflow publishes a tagged version only after
its full test suite and cross-platform package tests pass. The tag must match
the version in both package files. The publish job uses npm trusted publishing
through GitHub Actions OIDC. On npmjs.com, configure the package's trusted
publisher for this repository and the workflow filename `package.yml`, with
direct publishing enabled. The release job requires no npm access token.

## Module formats and exports

CommonJS is the canonical module format:

```js
const ledlight = require('@jakobm/ledlight');
```

Node.js ESM applications can import the CommonJS default export:

```js
import ledlight from '@jakobm/ledlight';
```

There is no separate native ESM build. The package root is the only exported
package path; source files and package metadata are implementation details and
cannot be imported through package subpaths.

The package publishes TypeScript declarations for the package root. Its
maintained source is TypeScript, compiled to CommonJS in `dist/` before packing
or publishing. Consumers can type-check calls to `openJournal`, `parseLedgerText`,
and the journal methods without a separate `@types` package. The Node.js API
reference remains the detailed description of runtime behavior and validation.

## Node.js and native platform support

Ledlight 0.1 supports Node.js 22.14 and later 22.x releases. The package uses
`better-sqlite3` 13.0.3. Earlier Node.js 22 releases can crash when opening a
database with that version on some platforms; see the
[upstream issue](https://github.com/WiseLibs/better-sqlite3/issues/1514).
Installation also requires a platform supported by that dependency. Its bundled
prebuilt binaries are used when available. On a platform without a matching
prebuilt binary, installation requires the compiler and system tooling needed
by `node-gyp`.

The supported operating-system families are 64-bit Linux, macOS, and Windows
where `better-sqlite3` installs successfully. Ledlight does not promise a
stable native ABI independently of `better-sqlite3`; consumers should install
dependencies for the exact Node.js runtime and target platform rather than
copying `node_modules` between runtimes or machines.

## Compatibility policy

The public Node.js API and CLI follow semantic versioning together. During the
initial `0.x` series, a minor release may contain breaking changes and a patch
release must remain backward compatible. Once the package reaches `1.0.0`,
breaking changes to documented API operations, result shapes, CLI commands, or
CLI option semantics require a major release.

Human-readable CLI layout is not a machine-readable compatibility interface;
JSON and CSV output changes follow the same semantic-versioning policy as the
Node.js result they represent.

The derived SQLite database is an internal cache, not a public storage API.
Its schema version may change in any release. Callers must access data through
the public Node.js API or CLI and must allow the installed Ledlight version to
migrate or rebuild the database. Direct SQL consumers and databases moved
between different Ledlight versions are not covered by compatibility promises.
