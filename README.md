# Ledlight

Ledlight is a standalone Ledger-compatible parser, SQLite store, and reporting
library.

Install the public package on Node.js 22.14 or later in the Node.js 22 release line:

```console
npm install @jakobm/ledlight
```

For repository development, install [Volta](https://volta.sh/) and run
`volta setup` so its shims are on your PATH. The `volta` settings in
`package.json` select Node.js 22.14.0 and npm 11.21.0 automatically in the
repository, new shells, and GitHub Actions.

New Codex worktrees require Volta to be installed. Their environment setup adds
its shims to PATH and installs dependencies with the same pinned toolchain.

Install dependencies and run the complete verification suite:

```console
npm install
npm test
```

The maintained source is TypeScript. Run `npm run build` after editing source to
generate CommonJS files and declarations under `dist/` for the tests, CLI, and
npm package. `npm test` checks the project configuration, builds automatically,
and includes strict type checking and linting. The generated `dist/` directory is ignored by Git.

The complete suite requires a Ledger 3 CLI executable named `ledger`. Set
`LEDGER_BIN` to another executable path when needed.

The full GitHub Actions test job shows total and per-file coverage in its run
summary and uploads a `coverage-report` artifact. Open its `index.html` to see
which source lines and branches ran. The same test run also uploads an Allure
report with individual test results and durations. Pushes to `main` publish
available reports at [coverage](https://jakobmattsson.github.io/ledlight/coverage/)
and [test results](https://jakobmattsson.github.io/ledlight/tests/) on the
existing `gh-pages` branch, alongside benchmark history in `dev/bench/`.
PR runs retain available reports even when tests fail. After merge, a separate
workflow publishes the successful PR run’s reports without rerunning tests.
Local `npm test` runs without coverage; use `npm run test:coverage` and open
`coverage/index.html` to inspect the report locally.

Run `ledlight` or `ledlight --help` to list the available commands. Run
`ledlight <command> --help` for the options accepted by one command. Run
`ledlight --version` for the package version.

Use the JavaScript API from the package root:

```js
const { openJournal } = require('@jakobm/ledlight');

const journal = openJournal('/path/to/books/main.ledger');
```

The package also includes TypeScript declarations for the public API:

```ts
import ledlight = require('@jakobm/ledlight');

const journal = ledlight.openJournal('/path/to/books/main.ledger');
const balances = journal.aggregate({ accounts: ['Assets:*'] });
```

Database operations take the path of the root journal directly. Ledlight stores
its derived SQLite database in the operating system's application cache
directory. The CLI accepts the root journal through `--file`, a `.ledlightrc`
file, or stdin. Pipe a journal into any command, or use `--file -` explicitly.
The JavaScript API continues to take the journal path directly and does not
read stdin. Both the CLI and API honor the cache directory set in the nearest
`.ledlightrc` or by `LEDLIGHT_CACHE_HOME`.

Run a complete example without creating a journal file:

```sh
ledlight aggregate --accounts 'Assets:*' --include-total <<'LEDGER'
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
reference](docs/api.md) for the complete consumer surface. The
[architecture diagram](architecture/architecture.svg) shows the repository's module
dependencies. The module system comes from `@jakobm/portico`.
Supported runtimes, module formats, native platforms, and
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
