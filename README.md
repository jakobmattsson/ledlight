# Ledlight

Ledlight is a standalone Ledger-compatible parser, SQLite store, and reporting
library extracted from the Fonden project.

Install dependencies and run the complete verification suite:

```console
npm install
npm test
```

The complete suite requires a Ledger 3 CLI executable named `ledger`. Set
`LEDGER_BIN` to another executable path when needed.

Use the JavaScript API from the package root:

```js
const { openProject, parse } = require('ledlight');

const document = parse('account Assets:Cash\n', { source: '<input>' });
const project = openProject('/path/to/ledger/project');
```

A Ledger project is a directory containing a `.ledgerrc` with exactly one
`--file` option. Ledlight stores its derived SQLite database in
`tmp/ledger.sqlite` below that directory.

See [the Ledlight documentation](docs/ledlight.md) for the supported syntax,
API, reports, and CLI.
