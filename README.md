# Ledlight

Ledlight is a standalone Ledger-compatible parser, SQLite store, and reporting
library.

Install the public package on Node.js 22.12 or later in the Node.js 22 release line:

```console
npm install ledlight
```

For repository development, install and select the latest Node.js 22 release
with [nvm](https://github.com/nvm-sh/nvm):

```console
nvm install
nvm use
node --version
```

The repository's `.nvmrc` selects Node.js 22 for this shell; it does not change
your nvm default. Run `nvm use` again when you open a new shell in the repository.

Install dependencies and run the complete verification suite:

```console
npm install
npm test
```

The complete suite requires a Ledger 3 CLI executable named `ledger`. Set
`LEDGER_BIN` to another executable path when needed.

The full GitHub Actions test job shows total and per-file coverage in its run
summary and uploads a `coverage-report` artifact. Open its `index.html` to see
which source lines and branches ran. Successful pushes to `main` also publish
the report at [GitHub Pages](https://jakobmattsson.github.io/ledlight/coverage/).
The report lives in `coverage/` on the existing `gh-pages` branch alongside
benchmark history in `dev/bench/`; no Pages source change is required.
Local `npm test` runs without coverage; use `npm run test:coverage` and open
`coverage/index.html` to inspect the report locally.

Run `ledlight` or `ledlight --help` to list the available commands. Run
`ledlight <command> --help` for the options accepted by one command. Run
`ledlight --version` for the package version.

Use the JavaScript API from the package root:

```js
const { openJournal } = require('ledlight');

const journal = openJournal('/path/to/books/main.ledger');
```

Database operations take the path of the root journal directly. Ledlight stores
its derived SQLite database in the operating system's application cache
directory. The CLI accepts the root journal through `--file`, a `.ledlightrc`
file, or stdin. Pipe a journal into any command, or use `--file -` explicitly.
The JavaScript API continues to take the path directly and does not read
configuration files or stdin.

Run a complete example without creating a journal file:

```sh
ledlight aggregate --accounts '^Assets:' --include-total <<'LEDGER'
commodity SEK
  default
  format 1,000.00 SEK
account Assets:Cash
account Equity:Opening

2024-01-01 Opening balance
  Assets:Cash  100 SEK
  Equity:Opening
LEDGER
```

Read [why Ledlight exists](docs/why-ledlight.md) for the product's purpose,
strengths, and limits. See [the Ledlight documentation](docs/ledlight.md) for
the supported syntax, reports, and CLI, and the [Node.js API
reference](docs/api.md) for the complete consumer surface. Supported runtimes,
module formats, native platforms, and
compatibility guarantees are defined in the
[package support policy](docs/package.md). The
[Ledger CLI equivalence matrix](docs/ledger-cli-equivalence.md) shows which
commands can be compared and provides a script for checking any journal.
See the [benchmark history](https://jakobmattsson.github.io/ledlight/dev/bench/)
for CI performance trends and the [benchmark notes](docs/benchmark.md) for the
fixture and measurement method.
The [acquisition-cost allocation guide](docs/allocation-feasibility.md) explains
how Ledlight checks whether recorded sales have a feasible cost basis.
Proposed follow-up work is tracked in the
[improvement backlog](docs/improvements.md).

Ledlight is available under the [MIT License](LICENSE).
