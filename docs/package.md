# Package support and versioning

Ledlight is distributed as the public `ledlight` npm package under the MIT
license. The package contains the CommonJS entry point, CLI, runtime source,
license, README, and consumer documentation. Repository configuration, tests,
fixtures, the Ohm-based reference parser, and the improvement backlog are not
published.

## Module formats and exports

CommonJS is the canonical module format:

```js
const ledlight = require('ledlight');
```

Node.js ESM applications can import the CommonJS default export:

```js
import ledlight from 'ledlight';
```

There is no separate native ESM build. The package root is the only exported
package path; source files and package metadata are implementation details and
cannot be imported through package subpaths.

## Node.js and native platform support

Ledlight 0.1 supports Node.js 22 LTS. The package uses `better-sqlite3` 11.7.0,
so installation also requires a platform supported by that dependency. Its
prebuilt binaries are preferred. On a platform without a matching prebuilt
binary, installation requires the compiler and system tooling needed by
`node-gyp`.

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
