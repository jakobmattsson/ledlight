# Ledlight

Ledlight is a small, fast subset of Ledger that reads Ledger-compatible
accounting data into a database-friendly syntax tree and a queryable SQLite
database.

## Ledger compatibility contract

Ledlight's journal language is intentionally a strict subset of Ledger's
language. Every journal accepted by Ledlight must also be valid input to the
Ledger CLI. The inverse is deliberately not required: Ledlight may reject
Ledger features or alternative forms that it has not chosen to support.

Ledlight must not introduce directives, properties, or other journal syntax
that only Ledlight understands. When Ledger offers several ways to express the
same setting, Ledlight may select one canonical form and reject the others. For
example, the valuation commodity is declared only with a `default` property in
a `commodity` block; Ledger's alternative `D` directive is not supported.

This compatibility direction is a design constraint for all future grammar
changes. New syntax must first be valid Ledger syntax and must then be added to
both the normative grammar and the optimized runtime parser.

The integration suite also runs Ledlight and Ledger CLI against the same set of
test journals. It compares normalized aggregate rows for implicit postings,
includes, date and account filters, inversion, and valuation in the journal
default commodity. This checks behavioral compatibility in addition to parser
agreement. Run it separately with `npm run test:ledger`; set `LEDGER_BIN` when
the Ledger 3 executable is not named `ledger`.

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

See the [Node.js API reference](api.md) for every exported operation, project
method, option, result shape, and ordering guarantee.

See the [package support policy](package.md) for supported Node.js and native
platforms, module formats, published files, and compatibility guarantees.

The package entry point loads the parser and journal reader immediately, but
loads the native SQLite dependency only when a database or report operation is
called. Consumers that only parse source text therefore do not initialize the
storage layer.

Open a project once when running several reports so the source freshness check
runs once:

```js
const { openProject } = require('ledlight');

const project = openProject();
const balance = project.aggregateReport({ to: '2024-12-31' });
const history = project.balanceHistoryReport({ from: '2024-01-01' });
```

## Public API and CLI contract

Ledlight has two supported consumer interfaces: the Node.js module exported by
the package root and the `ledlight` CLI. The Node.js module is the authoritative
application interface. It owns journal loading, database freshness, report
selection, filtering, transformations such as inversion, and calculated rows
such as totals.

The CLI is a thin adapter over that public module. It may parse command-line
arguments, map them to public API options, invoke an exported operation, and
format the returned value as human-readable text, CSV, or JSON. Formatting may
round values for display, align columns, add separators, and encode an existing
result, but it must not calculate or otherwise change report semantics.

The CLI command layer must not obtain data or transformations from internal
report, project, database, or accounting operations. Pure output code may use
shared exact-decimal helpers to round values for display. Any behavior offered
by the CLI must first exist through the public Node.js API. This dependency
direction keeps the two interfaces consistent and makes the CLI an example
consumer rather than a second implementation.

### CLI to API parity

The following table is the required mapping between CLI behavior and the
public Node.js API. A semantic CLI option must map to a public operation or
option. Output-only flags may select a formatter but must not change the
underlying result.

| CLI command or option | Public API equivalent | Responsibility |
| --- | --- | --- |
| `parse SOURCE_TEXT --source NAME` | `parse(sourceText, { source })` | Parse source text |
| `load-journal ENTRY_PATH` | `loadJournal(entryPath)` | Load an include tree |
| `project-paths` | `loadProjectPaths(startDirectory)` | Discover project paths |
| `ensure-database` | `ensureProjectDatabaseCurrent(startDirectory)` | Refresh the database |
| `open-project` | `openProject(startDirectory)` | Open and describe a project snapshot |
| `account-balances` | `accountBalances(options, startDirectory)` | Exact-account balances |
| `account-postings` | `accountPostings(options, startDirectory)` | Exact-account postings |
| `aggregate` | `aggregateReport(options, startDirectory)` | Report selection and calculation |
| `balance-history` | `balanceHistoryReport(options, startDirectory)` | Report selection and calculation |
| `gain` | `gainReport(options, startDirectory)` | Unrealized gain or loss by account |
| `investment-performance` | `investmentPerformance(options, startDirectory)` | Report selection and calculation |
| `account-transactions` | `openProject().accountTransactions(options)` | Exact-account transactions |
| `commodity-descriptions` | `openProject().commodityDescriptions()` | Commodity metadata |
| `ledger-accounts` | `openProject().ledgerAccounts()` | Account metadata |
| `ledger-transaction` | `openProject().ledgerTransaction(options)` | One transaction |
| `ledger-transactions` | `openProject().ledgerTransactions(options)` | Paginated transactions |
| `valuation-rate` | `openProject().ledgerValuationRateResolver()` | Resolve one valuation rate |
| `--directory PATH` | `startDirectory` | Project discovery start directory |
| `--from DATE` | `options.from` | Inclusive report start |
| `--to DATE` | `options.to` | Inclusive report end |
| `--accounts PREFIX` | `options.accounts` | Repeated account-prefix selection |
| `--date-basis VALUE` | `options.dateBasis` | Posting- or transaction-date selection |
| `--value` | `options.inValuationCommodity` | Aggregate valuation in the journal default commodity |
| `--with-valuation-value` | `options.withValuationValue` | Add valuation values without combining commodity rows |
| `--invert` | `options.invert` | Exact sign inversion by the report API |
| `--include-total` | `options.includeTotal` | Total row calculated by the report API |
| `--account-factor ACCOUNT=FACTOR` | `options.accountFactors` | Exact-account balance-history factors |
| `--commodities NAME` | `options.commodities` | Investment instrument selection |
| `--exclude-commodities NAME` | `options.excludeCommodities` | Investment instrument exclusion |
| `--csv` | None | Output formatting only |
| `--json` | None | Output encoding only |
| `--version` | `version` | Public package metadata |
| `--help` | None | CLI usage formatting only |

Commands without a specialized human-readable representation emit JSON.
Report commands accept `--json` when the complete API result is needed; this
is required to retain fields such as `valuationValue` and `factoredAmount`.
Tests compare the callable package and project API inventory with the CLI
command inventory, verify every parameter mapping, and verify that the command
adapter delegates calculations to the API before formatting.

Each report and query module owns a strict Zod schema beside its execution
function and returns both from its module factory. Public calls are parsed by
that schema before report logic runs. The project layer collects schema keys,
while CLI coverage is derived from the actual positional arguments and options
registered with Commander. Adding a field to a local operation schema without
attaching a CLI argument to that input therefore fails during CLI composition
and in the parity test.

## Architecture

The implementation is organized by responsibility under `src/ledlight`:

- `syntax` contains the optimized parser, syntax errors, and the normative Ohm
  reference implementation;
- `journal` handles include traversal, glob expansion, source hashing, and
  manifest-only scans;
- `accounting` provides exact decimal arithmetic, semantic validation, and
  posting resolution;
- `api` contains shared runtime-input validation helpers;
- `sqlite` owns schema migration, freshness checks, and journal persistence;
- `queries` contains one module per public account, transaction, or metadata
  query, with its Zod schema beside its execution function;
- `reports` contains only the aggregate, balance-history, gain, and investment-
  performance reports, again as one public operation and schema per module;
- `investments` contains investment-return and reconciliation calculations;
- `valuation` owns price selection and exact valuation-commodity rate
  resolution;
- `application` composes project paths, database freshness, and reports; and
- `cli` contains argument parsing, output formatting, and the executable runner
  over the public Node.js API.

Dependencies point inward: syntax and accounting contain no project or SQLite
dependency, and application composes the lower-level modules into the public
Node.js API. The CLI command layer depends on that public API; only its output
formatter uses the shared exact-decimal helpers directly.

## Supported grammar

The parser currently supports account, tag, commodity, price, and include
directives; commodity properties; transaction status, code, payee/narration,
and comments; postings with omitted or explicit amounts; unit and total lot
costs (`{}` and `{{}}`); unit and total transaction costs (`@` and `@@`);
balance assignments; and balance assertions.

Unsupported Ledger syntax fails with a source location instead of being
silently ignored. The runtime parser has no I/O or database dependency;
`loadJournal` is the thin layer responsible for file I/O, include expansion,
and hashing.

Before persistence, semantic validation requires commodities on explicit
posting amounts, lot costs, transaction costs, balance assertions, and prices.
Implicit postings and balance assignments may still infer their commodity.
Explicit transactions must balance, allowing Ledger-style two-commodity
exchanges and the precision tolerance associated with calculated unit costs.
When a posting has both a lot cost and a transaction cost, its lot cost
determines the balancing amount. This requires a realized gain or loss posting
when disposal proceeds differ from the lot's cost basis, matching Ledger's
behavior.

Explicit non-zero postings in commodities other than the journal default must
also describe their trade direction unambiguously. A positive quantity must
have a lot cost (`{}` or `{{}}`) and no transaction price. A negative quantity
must have both a lot cost and a transaction price (`@` or `@@`). Unit and total
annotations may be combined freely. Zero quantities are exempt because they do
not acquire or dispose of a commodity.

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
ledlight aggregate --to 2024-12-31
ledlight aggregate --to 2024-12-31 --date-basis transaction
ledlight aggregate --from 2024-01-01 --to 2024-12-31 \
  --accounts "Income:" --accounts "Expenses:" --value --invert
ledlight aggregate --to 2024-12-31 --accounts "Assets:" --csv
```

By default, the command prints right-aligned account names followed by aligned
amounts and a left-aligned commodity column. Human-readable output uses each
commodity's declared `format` precision and separators. With `--value`, it
converts every amount to the journal's default commodity and ends with an exact
total. `--csv` omits the total and instead prints RFC-style escaped CSV with the
columns `account,amount,commodity`. CSV uses canonical, ungrouped decimal values
and does not apply commodity display separators. With `--value`, CSV amounts
retain the existing exact two-decimal rounding behavior.
`--invert` negates every reported amount, including the human-readable total.

The same behavior is available directly through `aggregateReport`: set
`invert: true` to negate the returned quantities and `includeTotal: true` to
append the total row. `includeTotal` requires `inValuationCommodity: true`, so
the quantities have one common commodity. The CLI requests this total for
human-readable `--value` output and formats the row with a separator; CSV output
uses the account rows only.

Before every CLI aggregate report, Ledlight compares the current source manifest
with `source_files`. This scan follows include directives and computes file
hashes, but does not parse transactions. If the manifest has changed, Ledlight
parses the journal and rebuilds the database before running the report. If it
has not changed, the report proceeds directly against the existing database.

This is also the first-build command. If `tmp/ledger.sqlite` does not exist,
Ledlight creates its directory, reads the journal path from `.ledgerrc`, and
builds the database before producing the report.

Valuation follows Ledger's price-path preference. For each commodity, Ledlight
first uses the latest direct quote to the valuation commodity, even when a
newer indirect quote exists. Without a direct quote, it tries indirect quotes
from newest to oldest until one reaches the valuation commodity. Prices must be
dated on or before `to`; when `to` is omitted, all available prices are
eligible. The single valuation commodity is marked `default` by one commodity
declaration:

```ledger
commodity USD
  format 1,000.00 USD
  default
```

This `commodity` property is the only supported way to declare the valuation
commodity. Marking more than one declaration as `default` is a project
configuration error, including repeated declarations of the same symbol. There
is no API or command-line option for choosing another target.
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

## Unrealized gain

`gainReport` and the `gain` CLI command calculate the market value of each
open non-default commodity position minus its remaining lot cost. Results are
grouped by account, expressed in the journal default commodity, and omit zero
gains. Losses are returned as negative quantities.

```console
ledlight gain
ledlight gain --to 2024-12-31 --accounts "Assets:Broker"
ledlight gain --csv
```

The report accepts `to`, repeated `accounts`, and `date-basis`. It uses the
latest valuation price on or before `to`, or the latest available price when
`to` is omitted. Realized quantities and their lot costs cancel when a lot is
sold, leaving only unrealized gains or losses on the remaining position.

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
ledlight balance-history \
  --accounts "Assets:" --accounts "Liabilities:"
ledlight balance-history --date-basis transaction \
  --accounts "Assets:" --accounts "Liabilities:"
ledlight balance-history --accounts "Assets:" --csv
```

Human-readable amounts use the default commodity's declared format. CSV
amounts retain the existing exact two-decimal rounding and use the columns
`date,amount`; the API retains exact decimal strings. When the database is
built, Ledlight materializes direct valuation
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
The CLI's `--invert` option maps directly to the public report option
`invert: true`.

## Consumer integration

Ledlight's aggregate command is a general exact-query interface over a project
journal. Consumer applications own account selection, derived-account rules,
presentation, and compatibility with their existing commands. Keeping those
policies outside Ledlight lets applications such as Fonden use the same parsing,
storage, and reporting primitives without coupling Ledlight to one accounting
instance.
