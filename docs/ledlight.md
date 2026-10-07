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

See the [Ledger CLI equivalence matrix](ledger-cli-equivalence.md) for the
verified command pairs and the standalone `ledlight-cmp` command, which can
run those comparisons against an arbitrary journal.

The current implementation provides:

- a readable Ohm grammar for the supported Ledger constructs;
- an Ohm reference parser plus a faster, dependency-free runtime parser that
  must produce the same syntax tree;
- exact decimal strings, avoiding binary floating-point loss during import;
- source locations and recoverable syntax warnings;
- recursive `include` handling, including the repository's `*.txt` glob; and
- a SHA-256 manifest of all source files loaded through the include tree.

The public API is exported from the package root:

```js
const { openJournal, parseLedgerText } = require('ledlight');

const journal = openJournal('/path/to/books/main.ledger');
const ast = parseLedgerText('account Assets:Cash\n');
```

See the [Node.js API reference](api.md) for every exported operation, journal
method, option, result shape, and ordering guarantee.

See the [package support policy](package.md) for supported Node.js and native
platforms, module formats, published files, and compatibility guarantees.

The package entry point does not load the native SQLite dependency until a
journal is opened.

Open a journal once when running several reports so the source freshness check
runs once:

```js
const { openJournal } = require('ledlight');

const journal = openJournal('/path/to/books/main.ledger');
const aggregate = journal.aggregate({ to: '2024-12-31' });
const history = journal.totalHistory({ from: '2024-01-01' });
```

## Public API and CLI contract

Ledlight has two supported consumer interfaces: the Node.js module exported by
the package root and the `ledlight` CLI. The Node.js module is the authoritative
application interface. It owns journal loading, database freshness, report
selection, filtering, transformations such as inversion, and calculated rows
such as totals.

The source definitions for external boundaries live in `src/surface`:
`queries` exposes API operations, `commands` defines CLI commands,
`database/schema.sql` defines persistent storage, and `parser/ledger.ohm`
describes the input language. Their implementation support lives in `src/impl`.

The CLI is a thin adapter over that public module. It parses command-line
arguments, maps semantic inputs to public API options, and invokes a journal
operation. Output-only options may then select fields or add presentation rows
before formatting. Each command formats text and CSV; JSON uses the same
encoder for every command after output preparation. Formatting may round
values for display, align columns, and add separators, but it must not
calculate or otherwise change report semantics.

The CLI command layer must not obtain data or transformations from internal
report, journal, database, or accounting operations. Pure output code may use
shared exact-decimal helpers to round values for display. Any data or semantic
behavior offered by the CLI must first exist through the public Node.js API;
output-only options may exist only in the CLI. This dependency direction keeps
the two interfaces consistent and makes the CLI an example consumer rather
than a second implementation.

`accounts` defaults to the same newline-separated account names as
`ledger accounts`. With `--details`, text output is a table containing a
right-aligned transaction count followed by account and comment. `--format
json` and `--format csv` encode the selected basic or detailed representation.

`tags`, `commodities`, and `prices` follow the same listing convention. They
have no required query parameters beyond `--file`, default to text, and accept
`--format text`, `--format json`, or `--format csv`. Tags and commodities list
used names and omit unused declarations. `commodities --details` includes each
selected declaration's comment, format, default status, and usage status.
Prices expose the effective market price database, including inferred
transaction prices and last-price-wins deduplication for a commodity and date.
`prices --mode directives` instead exposes every explicit journal price,
including unused commodities and superseded prices, in base-commodity, date,
and journal source order. Effective price output sorts by ascending date, then
base commodity, matching Ledger with `--sort date,account`. Price and transaction text output use ISO
dates (`YYYY-MM-DD`), matching Ledger with `--date-format %Y-%m-%d`.

### CLI to API parity

The following table is the required mapping between CLI behavior and the
public Node.js API. A semantic CLI option must map to a public operation or
option. Output-only flags may select a formatter but must not change the
underlying result.

| CLI command or option | Public API equivalent | Responsibility |
| --- | --- | --- |
| `aggregate --file PATH` | `openJournal(journalPath).aggregate(options)` | Report selection and calculation |
| `total-history --file PATH` | `openJournal(journalPath).totalHistory(options)` | Report selection and calculation |
| `unrealized-gains --file PATH` | `openJournal(journalPath).unrealizedGains(options)` | Unrealized gain or loss by account |
| `investment-performance --file PATH` | `openJournal(journalPath).investmentPerformance(options)` | Report selection and calculation |
| `accounts --file PATH` | `openJournal(journalPath).accounts(options)` | Account metadata |
| `tags --file PATH` | `openJournal(journalPath).tags()` | Used tags |
| `commodities --file PATH` | `openJournal(journalPath).commodities()` | Used commodities |
| `prices --file PATH` | `openJournal(journalPath).prices()` | Effective market prices |
| `prices --mode MODE` | `options.mode` | Select `effective` (default) or `directives` |
| `transactions --file PATH` | `openJournal(journalPath).transactions(options)` | Transactions (unpaged in default text output) |
| `transactions --accounts PATTERN` | `options.accounts` | Repeated account-pattern selection |
| `transactions --id ID` | `options.id` | Select one transaction ID |
| `transactions --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `postings --file PATH` | `openJournal(journalPath).postings(options)` | Postings with parent transaction metadata |
| `postings --from DATE` | `options.from` | Inclusive posting-date start |
| `postings --to DATE` | `options.to` | Inclusive posting-date end |
| `postings --accounts PATTERN` | `options.accounts` | Repeated posting-account selection |
| `postings --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `--file PATH` | `journalPath` | Root journal file; CLI-only `-` reads stdin |
| `--from DATE` | `options.from` | Inclusive report start |
| `--to DATE` | `options.to` | Inclusive report end |
| `unrealized-gains --to DATE` | `options.to` | Inclusive position and valuation snapshot |
| `--accounts PATTERN` | `options.accounts` | Repeated account-pattern selection |
| `--date-basis VALUE` | `options.dateBasis` | Posting- or transaction-date selection |
| `balance --group-by DIMENSION` | `options.groupBy` | Group by `account` or `commodity` |
| `--valuation VALUE` | `options.valuation` | `cost` or `market` for aggregate and total history; defaults to `market` in both API and CLI |
| `--denominate` | `options.denominate` | Aggregate valuation in the journal default commodity |
| `--with-valuation-value` | `options.withValuationValue` | Add valuation values without combining commodity rows |
| `--invert` | `options.invert` | Exact sign inversion by the report API |
| `--include-total` | `options.includeTotal` | Total row calculated by the report API |
| `--commodities NAME` | `options.commodities` | Investment instrument selection |
| `--exclude-commodities NAME` | `options.excludeCommodities` | Investment instrument exclusion |
| `accounts --details` | None | Include API-provided comments and transaction counts in the output |
| `commodities --details` | None | Include API-provided declaration metadata in the output |
| `accounts --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `tags --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `commodities --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `prices --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `balance --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `total-history --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `unrealized-gains --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `unrealized-gains --include-total` | None | Append a presentation-only sum of all gain rows |
| `investment-performance --format FORMAT` | None | Select `text`, `json`, or `csv` output; defaults to `text` |
| `--version` | None | CLI package metadata |
| `--help` | None | Top-level command list |
| `<command> --help` | None | Detailed usage for one command |

Commands without a specialized human-readable representation emit JSON.
`transactions` defaults to Ledger-style text; repeatable `--accounts` options
select transactions containing matching accounts while retaining every posting
in each selected transaction. `--id` optionally selects one transaction.
`--order` defaults to `oldest`; `--page` and `--page-size` must be provided
together to request pagination. Without them, all matching transactions appear.
The `balance`, `total-history`, `unrealized-gains`, and
`investment-performance` commands use `--format json` when the complete API
result is needed. Investment performance CSV has one data row; its
`commodities` and `points` cells contain compact JSON arrays. JSON is required
to retain fields such as `valuationValue` and other API-only metadata in other
reports.
Tests compare the journal method inventory with the CLI command inventory,
verify every parameter mapping, and verify that the command adapter delegates
calculations to the API before formatting.

The CLI reads the first `.ledlightrc` found at `./.ledlightrc` or
`~/.ledlightrc`, in that order. The file may contain one `--file PATH` setting,
using the same form as Ledger's initialization file; blank lines and lines
beginning with `;` are ignored. An explicit command-line `--file` takes
precedence, followed by nonempty piped input, then configuration. This is CLI-only
configuration: `openJournal(journalPath)` always uses its argument directly and
never reads `.ledlightrc`.

Every CLI command can read a UTF-8 journal from stdin. Use a pipe, redirected
file, or heredoc without `--file`, or explicitly select stdin with `--file -`:

```sh
cat journal.ledger | ledlight total-history
ledlight unrealized-gains --file - --include-total < journal.ledger

ledlight aggregate --denominate --include-total <<'LEDGER'
commodity SEK
  default
  format 1,000.00 SEK
commodity STOCK
  format 1,000 STOCK
account Assets:Stock
account Assets:Cash
P 2024-01-01 STOCK 12 SEK

2024-01-01 Purchase
  Assets:Stock  10 STOCK {10 SEK}
  Assets:Cash  -100 SEK
LEDGER
```

The heredoc example reports a total of 20 SEK. An explicit file path wins over
piped text. Empty automatic stdin falls back to `.ledlightrc`; `--file -` always
uses stdin, even when it is empty. Help and version commands do not read stdin.
Relative includes in stdin resolve from the current working directory; nested
includes keep resolving from their containing file. Diagnostics identify the
root source as `<stdin>`. Stdin reports use a temporary database, removed on
completion or failure, and do not populate the persistent journal cache.

Each report and query module owns a strict Zod schema beside its execution
function and returns both from its module factory. Public calls are parsed by
that schema before report logic runs. The application layer collects schema keys,
while CLI coverage is derived from the actual positional arguments and options
registered with Commander. API inputs and CLI-only output inputs have separate
metadata. Adding a field to a local operation schema without attaching a CLI
argument to that input therefore fails during CLI composition and in the
parity test without preventing formatter-only CLI options.

Tests derive API-input and output-input inventories separately from the
registered options. Every API input must have exactly one CLI mapping.
CLI-only options must be classified as output inputs and may only select a
formatter or presentation; they are never passed to a journal operation.

## Architecture

The public definitions live in `src/surface`, and their implementation lives in
`src/impl`:

- `surface/queries` contains one module per public API/CLI query, with its Zod
  schema beside its execution function;
- `surface/commands` contains the CLI command definitions;
- `surface/database` and `surface/parser` contain the database schema and input
  grammar;
- `impl/core` contains project composition for the stable Node.js API,
  public errors, shared runtime-input validation, exact decimal arithmetic, and
  valuation logic;
- `impl/ingestion` owns the optimized parser, traverses
  journal includes, validates and resolves journal postings, persists the
  normalized database, and materializes query optimizations;
- `impl/query-support` contains internal SQL, valuation, and investment-return
  calculations used by query implementations; and
- `impl/cli` contains argument parsing, output formatting, and the executable runner
  over the public Node.js API.

Dependencies point inward: ingestion writes the database, queries read it, and
core composes those capabilities into the public Node.js API. The CLI command
layer depends on that public API; only its output formatter uses shared
exact-decimal helpers directly.
The project builds journal operations and API input definitions from the query
modules. The CLI runner invokes each command's declared API operation and passes
its result to the command's formatting step. Commands declare how to load any
additional data needed for text output.
Awilix supplies each repository factory through a boundary-checking proxy. Code
outside `cli` cannot resolve CLI modules, and `ingestion` cannot resolve modules
from `queries`. The complete container is resolved in a unit test so violations
fail the verification suite even when the affected feature is not otherwise
exercised. Repository factories use unique lowercase kebab-case filenames;
Awilix `loadModules` converts each basename to its camel-case dependency name.

## Supported grammar

The parser currently supports account, tag, commodity, price, and include
directives; commodity properties; transaction descriptions,
tags, and comments; postings with omitted or explicit amounts; unit and total lot
costs (`{}` and `{{}}`); unit and total transaction costs (`@` and `@@`);
balance assignments; and balance assertions.

Unsupported or malformed Ledger syntax produces a warning with the exact error
location and the affected top-level line range. The parser omits that complete
top-level block and continues with the next one, so a bad posting cannot leave
a partial transaction and multiple bad blocks produce multiple warnings. The
runtime parser has no I/O or database dependency;
`loadJournal` is the thin layer responsible for file I/O, include expansion,
and hashing.

The grammar requires commodities on explicit posting amounts, lot costs,
transaction costs, balance assignments, balance assertions, and prices.
Implicit postings infer their resolved commodity during accounting validation.
Each resolved amount also stores the exact running balance for its posting
account and commodity. These balances are materialized in posting-date and
journal order during the full database rebuild.
Explicit transactions must balance exactly, allowing Ledger-style two-commodity
exchanges without cost annotations. Unit and total costs are exact values;
calculated unit costs have no rounding tolerance when balancing a transaction.
For example, three units bought for 100 SEK should use `{{100 SEK}}`, not
`{33.33 SEK}`. The latter records a cost of 99.99 SEK and warns if paired with
a payment of 100 SEK without an explicit posting for the difference. An implicit
posting absorbs the full exact residual, including fractions of the smallest
displayed monetary unit. These balancing rules are separate from the rounding
rules for acquisition-cost allocation checks.
Cost annotations expressed in the posting's own commodity must preserve its
nominal value: unit costs must be exactly one, and total costs must equal the
posting amount under the usual total-cost sign convention. For example,
`100 SEK {2 SEK}` and `100 SEK {{200 SEK}}` produce `INVALID_COMMODITY_TRADE`,
while `{1 SEK}` and `{{100 SEK}}` are valid for a 100 SEK posting. This applies
to both lot costs and transaction prices, including the default commodity.
When a posting has both a lot cost and a transaction cost, its lot cost
determines the balancing amount. This requires a realized gain or loss posting
when disposal proceeds differ from the lot's cost basis, matching Ledger's
behavior.

Accounting checks are non-blocking ingestion warnings. Failed balance
assertions, unbalanced transactions, invalid trade annotations, and additional
default commodity declarations are recorded before queries run. Data that can
still be represented is retained; an entry with unresolved amounts is skipped
without preventing valid entries from being queried. The public API exposes
the warnings on the opened journal, grouped by code and message with at most ten
locations per group. The CLI writes a human-readable version of that list to
stderr and keeps query output on stdout.

Every commodity declaration must include an explicit `format` property. A
declaration without one produces a `MISSING_COMMODITY_FORMAT` warning. Requiring
the format prevents display precision from changing when a later amount happens
to contain more decimal places. The default cost currency's format also defines
the rounding step used by acquisition-cost allocation checks.

See [acquisition-cost allocation](allocation-feasibility.md) for the historical
feasibility rules, rounding behavior, and diagnostics.

Accounts, commodities, and tags must be declared before their first use in
journal traversal order. Each use before its declaration produces an
`UNDECLARED_ACCOUNT`, `UNDECLARED_COMMODITY`, or `UNDECLARED_TAG` warning at
the use location. These warnings do not discard the containing transaction or
price, but the `accounts`, `commodities`, and `tags` queries intentionally list
only declarations so the journal remains responsible for correcting them.
Declaring the same name again produces a `DUPLICATE_ACCOUNT_DECLARATION`,
`DUPLICATE_COMMODITY_DECLARATION`, or `DUPLICATE_TAG_DECLARATION` warning at
the later declaration. The later declaration is not stored; the first
declaration and its metadata remain authoritative. Unique database constraints
on declaration names enforce the same invariant independently of validation.

Non-zero postings in commodities other than the journal default must
also describe their trade direction unambiguously. A positive quantity must
have a lot cost (`{}` or `{{}}`) and no transaction price. A negative quantity
must have both a lot cost and a transaction price (`@` or `@@`). The same rules
apply after resolving implicit postings and balance assignments. Assignment
checks use the actual change in holdings, not the target balance. Missing
annotations produce `INVALID_COMMODITY_TRADE` even when a report can still
calculate market value; an unchanged balance adds no trade warning. Unit and total
annotations may be combined freely. As a Ledger-compatible special case, a
positive quantity may have both annotations when both prices are zero. This
represents a cost-free acquisition that still needs an explicit zero transaction
price to balance. Zero quantities are exempt because they do not acquire or
dispose of a commodity.

### Zero-cost acquisitions

A free allocation can have a non-zero commodity quantity while both its cost
basis and transaction value are zero. For example, subscription rights may be
recorded as:

```ledger
2024-07-03 Free subscription rights
  Assets:Rights  420 RIGHT {0 SEK} @ 0 SEK
```

The two zero annotations describe different facts. `{0 SEK}` is the per-unit
lot cost: it records a zero acquisition basis for the `RIGHT` lot. `@ 0 SEK` is
the per-unit transaction price: it explicitly states that the posting exchanged
at a zero SEK value. The corresponding total forms are `{{0 SEK}}` and
`@@ 0 SEK`.

Ledger normally infers a posting cost from the opposing non-zero commodity
amount. A regular purchase can therefore use only a lot cost because its cash
leg supplies the exchange value. A free allocation has no non-zero cash leg
from which to infer a conversion. Ledger treats a non-fixated lot cost as lot
metadata rather than as an explicit posting cost during this part of balancing,
so `420 RIGHT {0 SEK}` leaves an unbalanced `420 RIGHT` remainder. The explicit
`@ 0 SEK` supplies the missing zero-value conversion and makes the transaction
balance.

Ledger can derive a zero lot annotation from `420 RIGHT @ 0 SEK`, but Ledlight
requires the lot cost to remain explicit because later gain calculations depend
on an explicit acquisition basis. Consequently, Ledlight accepts both
annotations on a positive posting only when both values are exactly zero. It
continues to reject mixed cases such as `{0 SEK} @ 10 SEK` and
`{10 SEK} @ 0 SEK`, as well as ordinary positive postings carrying both a lot
cost and a transaction price.

This syntax records a zero basis and zero value for this transaction. It does
not assert that the acquired instrument has no economic or market value at
other times; valuation remains the responsibility of price data.

`src/surface/parser/ledger.ohm` is the normative description of the
supported language. Ohm keeps this pure grammar separate from the AST-building
semantics in `tests/support/reference/reference-parser.js`. The fixtures in
`tests/api/parser` define expected syntax trees, a shared error contract for
invalid documents, and expected warnings when parsing recovers from malformed
top-level blocks. Each fixture runs through both Ohm and the optimized runtime
parser. Separate tests check parser-specific diagnostics. This keeps the grammar
reviewable without adding parser-framework overhead to production imports.

Ohm is only a development dependency. The optimized parser has no runtime
dependency on Ohm.

## SQLite database

SQLite is the default storage engine. The root journal is supplied directly to
the API or through the CLI's `--file` option, either explicitly or from
`.ledlightrc`; Ledlight does not read `.ledgerrc`. The database lives under the
operating system's application cache directory as
`ledlight/journals/<sha256>/ledger.sqlite`, where the hash is
derived from the canonical absolute journal path. `LEDLIGHT_CACHE_HOME` can
override the Ledlight cache root. Rebuilding the database replaces its contents
in one transaction. Because the database is a reproducible cache, an older
supported schema version is recreated from the journal instead of preserving
and transforming cached rows in place.

`database_metadata` stores the schema version, root journal path, build time,
and selected valuation commodity. It is database bookkeeping and is unrelated
to journal comment metadata.

`source_files` stores every resolved source path, its byte size, its SHA-256
hash, and its traversal order. `checkDatabaseSync` rebuilds the current source
manifest and reports added, removed, and changed files.

The main query tables are `transactions`, `postings`, `notes`,
`resolved_posting_amounts`, `prices`, `valuation_prices`, and the three
declaration tables. `tag_declarations` stores `tag` directives and their usage
status. Commodity declarations store the format and default status used by the
public `commodities` query. `valuation_prices` is derived from `prices` at the
end of each database build and is not an independent journal source.
`journal_entries` preserves source file and line information shared by entry
types. Its ID also preserves global source order. Quantities are stored as
`TEXT`, exactly as parsed, so SQL storage never rounds an accounting value
through binary floating point.
`notes` stores transaction and posting comments together. Position zero
identifies a comment on the transaction or posting line; subsequent positions
identify following indented comment lines. An indented comment belongs to the
preceding posting when one exists, and otherwise to the transaction.
Price directives use `base_commodity`, `quote_quantity`, and `quote_commodity`;
for example, `P 2024-01-01 FUND 10 SEK` prices the base commodity `FUND` as a
quote of `10 SEK`.

Each posting has a non-null `posting_date`: its explicit posting date when one
is present, otherwise the transaction's primary date. This preserves source
timing for reconciliation. Aggregate reports use this posting date by default.
Callers can instead select the transaction's primary date so all postings in a
transaction take effect atomically.

Balance assignments and implicit balancing postings are resolved during the
database build and stored in `resolved_posting_amounts`. This makes aggregate
reports a direct SQL operation rather than a replay of Ledger semantics at
query time.

## Aggregate report

`aggregate` returns every non-zero account total in an optional inclusive
date interval. Omit `from` to include all earlier postings, omit `to` to include
all later postings, and omit both to aggregate the complete journal. Repeated
account patterns are combined with OR. Patterns match literal substrings by
default; a leading `^` anchors the start and a trailing `$` anchors the end.
Both anchors request an exact account. These are not regular expressions, so
every other character is literal. By default there is one row per account and
commodity:

```js
const { openJournal } = require('ledlight');
const journal = openJournal('/path/to/books/main.ledger');

const balanceSheet = journal.aggregate({
  to: '2024-12-31',
  accounts: ['^Assets:', '^Liabilities:'],
  dateBasis: 'transaction',
});
const valuedIncomeStatement = journal.aggregate({
  from: '2024-01-01',
  to: '2024-12-31',
  accounts: ['^Income:', '^Expenses:'],
  denominate: true,
});
```

Set `groupBy: 'commodity'` to combine all matching accounts into one row per
commodity. Commodity grouping retains zero balances, matching the behavior of
the former dedicated `accountBalances` query.

The command-line equivalent is:

```console
ledlight aggregate --file main.ledger --to 2024-12-31
ledlight aggregate --file main.ledger --to 2024-12-31 --date-basis transaction
ledlight aggregate --file main.ledger --from 2024-01-01 --to 2024-12-31 \
  --accounts "^Income:" --accounts "^Expenses:" --denominate --invert
ledlight aggregate --file main.ledger --to 2024-12-31 --accounts "^Assets:" --format csv
ledlight aggregate --file main.ledger --accounts "^Assets:" \
  --group-by commodity --format json
```

By default, the command prints right-aligned amounts and commodities followed
by left-aligned account names. Human-readable output uses each
commodity's declared `format` precision and separators. With `--denominate`, it
converts every amount to the journal's default commodity. Add `--include-total`
to append an exact total for each reported commodity in any output format. `--format csv` prints RFC-style escaped CSV
with the columns `account,amount,commodity`. Commodity grouping omits the
`account` column. CSV uses canonical, ungrouped decimal values and does not
apply commodity display separators. With `--denominate`, CSV amounts retain the
existing exact two-decimal rounding behavior.
`--invert` negates every reported amount, including the total when requested.

`--valuation market` is the explicit CLI default, matching the API default
`valuation: 'market'`. Use `--valuation cost` with `--denominate` or
`--with-valuation-value` to value holdings using their recorded lot costs.
Unit and total lot costs are supported; sales subtract the cost of sold units
and transfers carry the recorded cost. Amounts in the default commodity keep
their face value. Other commodities require a lot cost in the default commodity;
missing cost data raises an error instead of using market prices. Market prices
are not needed in cost mode. The journal still supplies realized gain postings.
Selecting a valuation method alone does not convert commodity quantities.

```console
ledlight aggregate --file main.ledger --accounts "^Assets:" --denominate --valuation cost
```

The same behavior is available directly through `journal.aggregate`: set
`invert: true` to negate the returned quantities and `includeTotal: true` to
append totals in commodity order. Without conversion, quantities are summed
separately for each commodity; no default commodity or valuation prices are
needed. With `denominate: true`, the result has a single total in the
default commodity. Exact zero totals are retained, and empty reports have no
total rows. The CLI requests totals only with `--include-total`; human-readable
output puts a separator before the totals. This flag is also used by
`unrealized-gains`.
Valued account reports use Ledger's 20-character amount column, an unlabeled
total, and `0` for zero amounts. CSV and JSON retain the total's account label.

Human-readable reports that pair numeric results with hierarchical labels put
the numeric column first and right-align it, then put the label column second
and left-align it. This makes magnitudes easy to compare while preserving the
natural reading order of account hierarchies. New reports should follow this
layout when they have the same shape.

Before every CLI aggregate report, Ledlight compares the current source manifest
with `source_files`. This scan follows include directives and computes file
hashes, but does not parse transactions. If the manifest has changed, Ledlight
parses the journal and rebuilds the database before running the report. If it
has not changed, the report proceeds directly against the existing database.

This is also the first-build command. If the derived cache database does not
exist, Ledlight creates its directory and builds the database from the supplied
journal before producing the report.

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
commodity. Marking more than one declaration as `default` is a journal
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

## Unrealized gains

`unrealizedGains` and the `unrealized-gains` CLI command calculate the market
value of each open non-default commodity position minus its remaining lot
cost. Results are grouped by account, expressed in the journal default
commodity, and omit zero gains. Losses are returned as negative quantities.

Lot costs for selected open positions must be expressed in the journal default
commodity. Ingestion records a `FOREIGN_LOT_COST_CURRENCY` warning for costs in
another currency, visible in every report regardless of account or date filters.
The gain report omits affected account/commodity positions instead of failing or
mixing currencies. Its account sums and total include only the remaining positions
and may be incomplete, as the warning explains. This includes costs on both
acquisitions and disposals contributing to an open position. Missing lot costs on
other open positions still cause an error. Prices alone cannot
identify the original acquisition exchange rates for later disposals or transfers;
record the acquisition basis in the default commodity explicitly. Closed positions
are omitted before checking their lot costs.

```console
ledlight unrealized-gains --file main.ledger
ledlight unrealized-gains --file main.ledger --to 2024-12-31 --accounts "^Assets:Broker"
ledlight unrealized-gains --file main.ledger --format csv
ledlight unrealized-gains --file main.ledger --include-total
```

The API accepts `to`, `accounts`, and `dateBasis`. The CLI exposes these as
`--to`, repeated `--accounts`, and `--date-basis`. It uses positions and the
latest valuation prices on or before `to`, or the complete journal and latest
available prices when `to` is omitted. Realized quantities and their lot costs
cancel when a lot is sold, leaving only unrealized gains or losses on the
remaining position.

The CLI-only `--format` option replaces the former `--csv` and `--json` flags.
`--include-total` appends a presentation row containing the exact sum of all account
gains; neither option is part of the API contract.

Global accounting validation runs when the journal database is built. Its
warnings are persisted and exposed by `openJournal().warnings` and every CLI
command, independent of report dates or account filters:

- `IMPOSSIBLE_COST_BASIS` identifies the first disposal that cannot be explained
  by the available acquisitions and earlier allocations. It does not prescribe
  FIFO, LIFO, or average cost. Transfers carry acquisition history between
  accounts; splits change units while preserving basis.
- `NEGATIVE_POSTING_DATE_HOLDING` identifies a negative end-of-day holding per
  account and non-default commodity using explicit posting dates, falling back
  to transaction dates. It warns when a day's net outflow creates or increases
  a negative holding, even if the acquisition history is valid by transaction
  date. Same-day movements are netted before checking. Different trade and
  settlement dates are allowed when both timelines remain feasible.
- `RESIDUAL_COST_BASIS` identifies closed account/commodity positions with
  nonzero remaining basis, including offsetting residuals within one account.
- `RESULT_MISMATCH` identifies a net imbalance in investment transactions valued
  at their recorded acquisition costs.
- `FOREIGN_LOT_COST_CURRENCY` identifies non-default commodity postings with lot
  costs outside the journal default commodity. These postings remain available
  to other reports, but affected positions are omitted from unrealized gains,
  making its totals potentially incomplete.
- `INVALID_COMMODITY_TRADE` also identifies default-commodity postings with a
  lot cost or transaction price in another commodity. Cost reports retain the
  posting's face value in the default commodity.
- `SALE_PROCEEDS_MISMATCH` identifies a transaction whose sale prices cannot be
  reconciled with its monetary postings. Sales use `@`/`@@`, simultaneous purchases
  use their lot costs, and internal transfers and splits are excluded. The net
  settlement must equal a subset of the transaction's default-currency postings,
  allowing half the declared monetary step for rounding. This accommodates
  separate fees, net proceeds, and realized losses without assuming account names.
  Because accounts have no type metadata, this is a necessary consistency check,
  not proof of correct classification: an accidental matching subset can pass.
  Cross-currency trades and annotated monetary postings are not checked. The
  subset search stops after 100,000 distinct states; an inconclusive search does
  not emit a mismatch warning.

The validator uses exact rational arithmetic, including fractional allocations.
A recorded total disposal cost may be rounded either down or up to the adjacent
multiple of the cost currency's declared `format` step. For `format 1,000.00 USD`,
an exact cost of 1/3 USD may be booked as 0.33 or 0.34 USD. An exact cost of 1 USD
cannot be booked as 0.99 or 1.01 USD: the difference must be strictly less than
one step. This applies to the total cost, including totals calculated from unit
annotations, not independently to each unit. Explicit costs finer than the
step are checked exactly; missing formats also retain exact checks.

All disposals must share one feasible acquisition history. Rounding intervals
remain part of that history, including their excluded endpoints; the validator
does not choose a lot method or replace original acquisition prices with booked
rounded prices. Reports continue to use booked amounts. Full liquidation must
remove exactly the remaining booked basis and also pass the allocation check.
Thus three units bought for 1 USD may be sold with costs 0.34, 0.33, 0.33 in any
order. Costs 0.34, 0.34, 0.32 fail allocation despite summing to 1; three costs of
0.34 leave a residual warning. Complete transfers and splits carry both the
booked remainder and the exact acquisition history without resetting either.
Partial transfers constrain the history using the same rounding rule as sales.

Diagnostic ranges bound the underlying exact cost before applying the current
rounding rule. Earlier rounding can make an endpoint unattainable; touching such
an endpoint does not establish feasibility. Non-terminating bounds are displayed
as fractions. The validator does not infer missing basis, modify recorded costs,
or implement short-sale or foreign-currency-basis rules. An impossible history
is retained as a diagnostic; later disposals cannot erase it or yield invented feasible bounds. Computable
reports remain available with warnings and exit code zero. A final disposal's
residual warning takes precedence over an equivalent allocation warning.

## Total history

`totalHistory` returns one row for every calendar day from the first
selected posting or transaction date, according to `dateBasis`, through the
report end. Each row contains `date`, `commodity`, and the exact total
value of the selected accounts in the journal default commodity on that day.
Valuation defaults to `market` in the API and explicitly in the CLI. Use
`valuation: 'cost'` or `--valuation cost` to accumulate recorded acquisition costs
with the same rules as aggregate valuation. Days without changes remain in the
result in both modes, and both use the same report end. Market price changes
only affect totals in market mode. The dedicated unrealized-gain and investment
performance reports continue to use market valuation. The `dateBasis` option is either
`posting` (the default) or `transaction`.

```js
const { openJournal } = require('ledlight');
const journal = openJournal('/path/to/books/main.ledger');

const history = journal.totalHistory({
  accounts: ['^Assets:', '^Liabilities:'],
});
```

The command prints the complete history by default. `--from`, `--to`, and
`--invert` work as for the aggregate report. Repeated `--accounts PATTERN` values
select accounts, while `--format` selects `text`, `json`, or `csv` output:

```console
ledlight total-history --file main.ledger \
  --accounts "^Assets:" --accounts "^Liabilities:"
ledlight total-history --file main.ledger --date-basis transaction \
  --accounts "^Assets:" --accounts "^Liabilities:"
ledlight total-history --file main.ledger --accounts "^Assets:" --format csv
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

Ledlight's balance command is a general exact-query interface over a journal.
Consumer applications own account selection, derived-account rules,
presentation, and compatibility with their existing commands. Keeping those
policies outside Ledlight lets applications use the same parsing, storage, and
reporting primitives without coupling Ledlight to one accounting instance.
