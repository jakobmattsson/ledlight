# Ledlight

Ledlight is a standalone Ledger-compatible parser, SQLite store, and reporting
library extracted from the Fonden project.

Install the public package on Node.js 22 LTS:

```console
npm install ledlight
```

Install dependencies and run the complete verification suite:

```console
npm install
npm test
```

The complete suite requires a Ledger 3 CLI executable named `ledger`. Set
`LEDGER_BIN` to another executable path when needed.

Run `ledlight` or `ledlight --help` to list the available commands. Run
`ledlight <command> --help` for the options accepted by one command. Run
`ledlight --version` for the package version.

Use the JavaScript API from the package root:

```js
const { openProject } = require('ledlight');

const project = openProject('/path/to/ledger/project');
```

A Ledger project is a directory containing a `.ledgerrc` with exactly one
`--file` option. Ledlight stores its derived SQLite database in
`tmp/ledger.sqlite` below that directory.

See [the Ledlight documentation](docs/ledlight.md) for the supported syntax,
reports, and CLI, and the [Node.js API reference](docs/api.md) for the complete
consumer surface. Supported runtimes, module formats, native platforms, and
compatibility guarantees are defined in the
[package support policy](docs/package.md). Proposed follow-up work is tracked
in the [improvement backlog](docs/improvements.md).

Ledlight is available under the [MIT License](LICENSE).
