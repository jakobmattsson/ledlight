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
release command. It requires a clean working tree, an authenticated GitHub CLI
(`gh`), and enforced branch protection. It prepares a same-repository
`release/v<version>` pull request, waits for the required checks, merges it, and
tags the tested merge commit. Use this command instead of creating release tags
manually. Inspect the reported local and remote state before retrying an
interrupted release.

The required checks in `package.yml` are `Full test suite`, `Package on macOS`,
`Package on Linux`, and `Package on Windows`. Keep these names aligned with
`git.releaseRequiredChecks` in `worktree-keeper.config.json` and GitHub's branch
protection. Require branches to be up to date and enforce checks for
administrators without bypass. Run
`npm exec --no -- worktree-keeper verify-release-protection` to verify the online
policy. `npm test` runs `check-project` to validate the local configuration.

Before publishing, `verify-release` checks branch protection, matching
package/tag/lockfile versions, the merged release PR, and successful required
jobs in its latest PR workflow run. The publish job then uses npm trusted
publishing through GitHub Actions OIDC. On npmjs.com, configure the package's
trusted publisher for this repository and workflow filename `package.yml`, with
direct publishing enabled. No npm access token is required.

The verification step uses the Actions secret `RELEASE_POLICY_TOKEN` as
`GH_TOKEN`. Use a fine-grained PAT or GitHub App token with repository access
and Administration read, Contents read, Pull requests read, and Actions read
permissions. Repository rulesets additionally require Administration write to
inspect bypass actors; inherited organization rulesets require appropriate
organization access. Rotate the secret when its token expires. Never expose it
to fork PR code through `pull_request_target`.

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
