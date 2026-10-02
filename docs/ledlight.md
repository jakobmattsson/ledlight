# Ledlight

Ledlight is a small, fast subset of Ledger that reads Ledger-compatible
accounting data into a database-friendly syntax tree and a queryable SQLite
database.

The current implementation provides:

- a readable Ohm grammar for the supported Ledger constructs;
- an Ohm reference parser plus a faster, dependency-free runtime parser that
  must produce the same syntax tree;
- exact decimal strings, avoiding binary floating-point loss during import;
- source locations and syntax errors;
- recursive `include` handling, including the repository's `*.txt` glob; and
- a SHA-256 manifest of all source files loaded through the include tree.

The public API is exported by `src/ledlight/index.js`:

```js
const { loadJournal, parse } = require('ledlight');

const document = parse(sourceText, { source: 'example.ledger' });
const journal = loadJournal('journal.ledger');
```

The package entry point loads the parser and journal reader immediately, but
loads the native SQLite dependency only when a database or report operation is
called. Consumers that only parse source text therefore do not initialize the
storage layer.

To get the exact text printed by a CLI report from Node, pass the same arguments
to `runReportCommand`. Open a project once when running several reports so the
source freshness check runs once:

```js
const { openProject, runReportCommand } = require('ledlight');

const project = openProject();
const balance = runReportCommand(['aggregate', '--to', '2024-12-31'], { project });
const history = runReportCommand(['balance-history', '--csv'], { project });
```

The function returns the report as a string and throws on invalid arguments.
Without `project`, it opens the project from the current directory; use
`startDirectory` to select another project root.

## Architecture

The implementation is organized by responsibility under `src/ledlight`:

- `syntax` contains the optimized parser, syntax errors, and the normative Ohm
  reference implementation;
- `journal` handles include traversal, glob expansion, source hashing, and
  manifest-only scans;
- `accounting` provides exact decimal arithmetic, semantic validation, and
  posting resolution;
- `sqlite` owns schema migration, freshness checks, and journal persistence;
- `reports` separates aggregate SQL queries from price selection and exact
  valuation-commodity
  rate resolution;
- `application` composes project paths, database freshness, and reports; and
- `cli` contains argument parsing, output formatting, and the executable runner.

Dependencies point inward: syntax and accounting contain no project or SQLite
dependency, while application and CLI compose the lower-level modules.

## Supported grammar

The parser currently supports account, tag, commodity, price, and include
directives; commodity properties; transaction status, code, payee/narration,
and comments; postings with omitted or explicit amounts; unit
and total costs; balance assignments; and balance assertions.

This intentionally remains a subset of Ledger. Unsupported syntax fails with a
source location instead of being silently ignored. The runtime parser has no I/O
or database dependency; `loadJournal` is the thin layer responsible for file
I/O, include expansion, and hashing.

Before persistence, semantic validation requires commodities on explicit
posting amounts, costs, balance assertions, and prices. Implicit postings and
balance assignments may still infer their commodity. Explicit transactions
must balance, allowing Ledger-style two-commodity exchanges and the precision
tolerance associated with calculated unit costs.

`src/ledlight/syntax/reference/ledger.ohm` is the normative description of the
supported language. Ohm keeps this pure grammar separate from the AST-building
semantics in `src/ledlight/syntax/reference/parser.js`. Tests parse representative
documents with both Ohm and the optimized runtime parser and compare the
resulting syntax trees. This keeps the grammar reviewable without adding
parser-framework overhead to production imports.

Ohm is only a development dependency. The optimized parser has no runtime
dependency on Ohm.

## SQLite database

SQLite is the default storage engine. The database always lives at
`tmp/ledger.sqlite`, relative to the project root containing `.ledgerrc`. The
root journal is always read from the `--file` option in `.ledgerrc`; neither
path is a command-line setting. Rebuilding the database replaces its contents
in one transaction.

```js
const { ensureProjectDatabaseCurrent } = require('ledlight');

const result = ensureProjectDatabaseCurrent();
```

`source_files` stores every resolved source path, its byte size, its SHA-256
hash, and its traversal order. `checkDatabaseSync` rebuilds the current source
manifest and reports added, removed, and changed files.

The main query tables are `transactions`, `postings`, `transaction_notes`,
`prices`, `valuation_prices`, the three declaration tables, and
`commodity_properties`. `valuation_prices` is derived from `prices` at the end of
each database build and is not an independent journal source.
`journal_entries` preserves the global source order and source location shared
by all entry types. Quantities are stored as `TEXT`, exactly as parsed, so SQL
storage never rounds an accounting value through binary floating point.

Each posting has a non-null `report_date`: its explicit posting date when one
is present, otherwise the transaction's primary date. This preserves source
timing for reconciliation. Balance reports use this posting date by default.
Callers can instead select the transaction's primary date so all postings in a
transaction take effect atomically.

Balance assignments and implicit balancing postings are resolved during the
database build and stored in `resolved_posting_amounts`. This makes aggregate
reports a direct SQL operation rather than a replay of Ledger semantics at
query time.

## Aggregate report

`aggregateReport` returns every non-zero account total in an optional inclusive
date interval. Omit `from` to include all earlier postings, omit `to` to include
all later postings, and omit both to aggregate the complete journal. Repeated
account prefixes are combined with OR and matched literally. Prefixes are
translated into lexicographic ranges so SQLite can use the account index rather
than evaluate a string function for every posting. By default there is one row
per account and commodity:

```js
const { aggregateReport } = require('ledlight');

const balanceSheet = aggregateReport({
  to: '2024-12-31',
  accounts: ['Assets:', 'Liabilities:'],
  dateBasis: 'transaction',
});
const valuedIncomeStatement = aggregateReport({
  from: '2024-01-01',
  to: '2024-12-31',
  accounts: ['Income:', 'Expenses:'],
  inValuationCommodity: true,
});
```

The command-line equivalent is:

```console
node src/ledlight/cli/run.js aggregate --to 2024-12-31
node src/ledlight/cli/run.js aggregate --to 2024-12-31 --date-basis transaction
node src/ledlight/cli/run.js aggregate --from 2024-01-01 --to 2024-12-31 \
  --accounts "Income:" --accounts "Expenses:" --value --invert
node src/ledlight/cli/run.js aggregate --to 2024-12-31 --accounts "Assets:" --csv
```

By default, the command prints right-aligned account names followed by amounts
with comma thousands separators and aligned decimal points, then a left-aligned
commodity column. With `--value`, human-readable output converts every amount to
the journal's default commodity and ends with an exact total. `--csv` omits the
total and instead prints RFC-style escaped CSV with the columns
`account,amount,commodity`. With `--value`, amounts in either format are rounded
exactly to two decimal places without binary floating-point conversion.
`--invert` negates every reported amount, including the human-readable total.

Before every CLI aggregate report, Ledlight compares the current source manifest
with `source_files`. This scan follows include directives and computes file
hashes, but does not parse transactions. If the manifest has changed, Ledlight
parses the journal and rebuilds the database before running the report. If it
has not changed, the report proceeds directly against the existing database.

This is also the first-build command. If `tmp/ledger.sqlite` does not exist,
Ledlight creates its directory, reads the journal path from `.ledgerrc`, and
builds the database before producing the report.

The valuation report selects the latest price on or before `to`. When `to` is
omitted, it uses the latest available price. The single valuation commodity is
the last commodity marked `default` by a commodity declaration:

```ledger
commodity USD
  format 1,000.00 USD
  default
```

This `commodity` property is the only supported way to declare the valuation
commodity. There is no API or command-line option for choosing another target.
Price chains can pass through intermediate commodities. Missing and circular
price chains are errors. Results remain exact decimal strings and are not
rounded for display.

Price chains intentionally work in one direction only. Every price directive
used for valuation must describe the value of the held commodity in its quote
commodity and eventually lead to the journal default. If USD is the default,
for example, `P 2024-01-01 FUND 10 USD` can value a FUND holding, while the
mathematically equivalent inverse quote `P 2024-01-01 USD 0.1 FUND` cannot.
Ledlight deliberately does not infer or calculate reciprocal prices; requiring
one canonical direction keeps price selection and chained valuation simple and
predictable.

The SQLite connection registers `decimal_sum`, `decimal_mul`, and
`decimal_cmp`. `decimal_sum` is used by both report variants, so values are
never converted to binary floating point during aggregation or valuation.

## Balance history

`balanceHistoryReport` returns one row for every calendar day from the first
selected posting or transaction date, according to `dateBasis`, through the
report end. Each row contains `date`, `commodity`, and the exact total market
value of the accounts' holdings in the journal default commodity on that day.
Days without changes remain in the result
because their market value can still change. The `dateBasis` option is either
`posting` (the default) or `transaction`.

```js
const { balanceHistoryReport } = require('ledlight');

const history = balanceHistoryReport({
  accounts: ['Assets:', 'Liabilities:'],
});
```

Code callers can also provide `accountFactors`, keyed by exact account name.
The report then includes a `factoredAmount` beside each unmodified `amount`.
This supports views such as after-tax balances without losing the single daily
query for an account group:

```js
const history = balanceHistoryReport({
  accounts: ['Assets:', 'Liabilities:'],
  accountFactors: {
    'Assets:Pension': '0.7',
    'Liabilities:DeferredTax': '0.75',
  },
});
```

Accounts without an explicit factor use `1`. Factors apply only to exact
account names even though `accounts` continues to select by prefix.

The command prints the complete history by default. `--from`, `--to`,
`--accounts`, `--invert`, and `--csv` work as for the aggregate report:

```console
node src/ledlight/cli/run.js balance-history \
  --accounts "Assets:" --accounts "Liabilities:"
node src/ledlight/cli/run.js balance-history --date-basis transaction \
  --accounts "Assets:" --accounts "Liabilities:"
node src/ledlight/cli/run.js balance-history --accounts "Assets:" --csv
```

Human-readable amounts and CSV amounts are rounded exactly to two decimal
places. CSV output has the columns `date,amount`; the API retains exact decimal
strings. When the database is built, Ledlight materializes direct valuation
rates in `valuation_prices`. For each commodity, the table contains one row per calendar day
from its first posting, transaction, or price appearance through the latest
posting, transaction, or price date.
Each day carries forward the latest resolvable rate to the journal default,
including changes
caused by an intermediate commodity in a price chain. A single recursive
`INSERT` statement generates the calendar, resolves the price chains, and
writes the complete materialization. The report therefore uses an exact
`(commodity, date)` join to group, value, and sum postings in one indexed SQL
query rather than loading price history or running one balance query per date.

## Consumer integration

Ledlight's aggregate command is a general exact-query interface over a project
journal. Consumer applications own account selection, derived-account rules,
presentation, and compatibility with their existing commands. Keeping those
policies outside Ledlight lets applications such as Fonden use the same parsing,
storage, and reporting primitives without coupling Ledlight to one accounting
instance.
