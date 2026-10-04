# Node.js API reference

Ledlight is a CommonJS module. The package root exports only `openJournal`:

```js
const { openJournal } = require('ledlight');
```

Dates use `YYYY-MM-DD`. Accounting quantities and valuation rates are exact
decimal strings unless a result field is explicitly documented as a number.
API option objects reject unknown properties and values of the wrong type.

All account selections use literal substring patterns. A leading `^` anchors a
pattern to the start of the account name and a trailing `$` anchors it to the
end. Using both selects one exact account. No other regular-expression syntax
is recognized; all other characters are matched literally.

## Errors

Public failures expose a stable string through `error.code`:

| Code | Meaning |
| --- | --- |
| `LEDLIGHT_SYNTAX` | Unsupported or malformed journal syntax |
| `LEDLIGHT_INVALID_API_INPUT` | Invalid options or arguments supplied by the caller |
| `LEDLIGHT_PROJECT_CONFIGURATION` | Invalid journal path, configuration, or structure |
| `LEDLIGHT_MISSING_VALUATION_DATA` | A required default commodity or conversion price is unavailable |
| `LEDLIGHT_DATABASE` | A database could not be opened, read, or updated |

Consumers should compare `error.code` with these strings and should not depend
on a Ledlight-specific error class or inspect message text. Syntax errors also
expose `source`, `line`, and `column`; an underlying SQLite code is preserved as
`sqliteCode` when available.

## Opening a journal

### `openJournal(journalPath)`

`journalPath` may be relative to the current working directory, but it must
point directly to an existing file. Ledlight resolves symbolic links and never
searches parent directories or reads `.ledgerrc`.

Opening a journal ensures database freshness once and returns a journal object.
Use the same object for several operations against one database snapshot. Its
query methods are documented below. Reopen the journal to observe source
changes.

The returned object also has a frozen `warnings` array. Ingestion and accounting
checks finish before the object is returned, so this array is complete before
any query starts. Query methods keep their documented return values even when
warnings exist. Warnings with the same code and message are grouped. Each
warning group is:

```js
{
  code,    // stable ingestion-warning identifier
  message, // human-readable English description
  instances: [{
    source,  // absolute journal source path
    line,    // exact warning or syntax-error location
    column,
    startLine, // first line of the affected top-level block
    endLine,   // last line of the affected top-level block
  }],
}
```

At most the first ten instances of each warning group are exposed.

Warnings are stored with the database snapshot and therefore remain available
when a current cache is reused. An entry that cannot be represented safely in
the database is omitted while other entries remain queryable. Checks that do
not prevent representation, including failed balance assertions and unbalanced
transactions, retain the data and report a warning.

Malformed or unsupported syntax produces a `SYNTAX_ERROR` warning. The parser
omits the complete affected top-level block and resumes at the next top-level
line. For example, an invalid posting omits its entire transaction rather than
leaving a partial transaction in query results. Every omitted block produces
its own warning, including blocks in included files.

## Reports

Report methods are called on the object returned by `openJournal()` and accept
an optional `options` object.

### `journal.aggregateReport(options)`

Options:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `from` | string | unbounded | Inclusive start date |
| `to` | string | unbounded | Inclusive end date and valuation date |
| `accounts` | string[] | `[]` | Account patterns combined with OR |
| `dateBasis` | `posting` or `transaction` | `posting` | Date used for filtering |
| `groupBy` | `account` or `commodity` | `account` | Result grouping dimension |
| `inValuationCommodity` | boolean | `false` | Convert and combine rows in the journal default commodity |
| `withValuationValue` | boolean | `false` | Preserve commodity rows and add `valuationValue` |
| `invert` | boolean | `false` | Negate quantities and valuation values |
| `includeTotal` | boolean | `false` | Append an exact total; requires `inValuationCommodity` |

`inValuationCommodity` and `withValuationValue` are mutually exclusive.
`includeTotal` is unavailable with commodity grouping because the grouped
valuation result is already a total.
Account-grouped rows are `{ account, quantity, commodity }`, sorted by account
and commodity. Commodity-grouped rows omit `account`, combine all matching
accounts, and retain exact zero balances. `withValuationValue` adds an exact
`valuationValue`. A total row is
`{ account: 'Total', quantity, commodity, isTotal: true }`.

### `journal.balanceHistoryReport(options)`

Options are `from`, `to`, `accounts`, `dateBasis`, and `invert`, with the same
meanings as in `aggregateReport`.

Returns daily rows sorted by date:

```js
{
  date,
  amount,
  commodity,
}
```

Amounts are exact decimal strings in the journal default commodity.

### `journal.unrealizedGains(options)`

Returns unrealized gains and losses for open non-default commodity positions,
grouped by account and expressed as exact decimal strings in the journal
default commodity. Each row is `{ account, quantity, commodity }`; zero-gain
accounts are omitted and losses are negative. Rows are sorted by account.

Options are `at`, `accounts`, and `dateBasis`. `at` is the inclusive snapshot
date for both positions and valuation prices, `accounts` contains account
patterns, and `dateBasis` is `posting` (the default) or `transaction`. When
`at` is omitted, all positions and the latest available journal prices are
used.

### `journal.investmentPerformance(options)`

Options are `from`, `to`, `accounts`, `commodities`, and
`excludeCommodities`. The three selections are arrays of non-empty strings.
Account values use the shared account-pattern syntax. Commodity inclusion and
exclusion cannot overlap.

The result contains:

```js
{
  from,
  to,
  commodities,
  valuationCommodity,
  openingValue,
  endingValue,
  netContributions,
  profitLoss,
  timeWeightedReturn,
  moneyWeightedReturn,
  moneyWeightedReturnTotal,
  points,
}
```

Performance values and the corresponding fields in each daily point are
JavaScript numbers. Return fields are `null` when they cannot be calculated.
The precision boundary for these numeric monetary fields is tracked in the
improvement backlog.

## Account operations

### `journal.accountPostings({ accounts, after })`

Returns resolved amounts for matching accounts after the optional exclusive
date. A row is:

```js
{
  transactionDate,
  postingDate,
  quantity,
  commodity,
}
```

Activity qualifies when either its transaction date or posting date is after
`after`. Rows are ordered by posting date and journal position.

## Additional journal queries

### `journal.commodityDescriptions()`

Returns one row per declared commodity, sorted by commodity symbol:

```js
{
  commodity,
  comment,
  format,
  isDefault,
}
```

`comment` and `format` are strings or `null`; `isDefault` is a boolean. A later
duplicate commodity declaration produces a warning and is not stored, so the
first declaration supplies these values. Other commodity properties are not
currently exposed.

### `journal.accountTransactions({ accounts })`

Returns newest-first transactions containing postings to matching accounts.
`accounts` is a non-empty array and matches any supplied pattern.
Each transaction contains identity and description fields plus `postings`.
Each posting contains `postingDate` and exact amount rows with the running
`balance` for that commodity.

### `journal.accounts({ accounts })`

Returns one row per declared account, sorted by name. Later duplicate
declarations produce warnings and are not stored. The optional `accounts`
array selects names matching any supplied pattern and defaults to `[]`:

```js
{
  account,
  comment,
  transactionCount,
}
```

### `journal.tags()`

Returns one row per declared tag, sorted by name. Later duplicate declarations
produce warnings and are not stored. Each row is `{ tag }`.

### `journal.commodities()`

Returns one row per declared commodity, sorted by symbol. Later duplicate
declarations produce warnings and are not stored. Each row is `{ commodity }`.

### `journal.prices()`

Returns every price directive, ordered by date and then journal position:

```js
{
  date,
  baseCommodity,
  quoteQuantity,
  quoteCommodity,
  comment,
}
```

`comment` is a string or `null`. Quantities remain exact decimal strings.

### `journal.transactions({ accounts, id, order, page, pageSize })`

Returns a paginated transaction collection. All options are optional. `accounts`
is an array that selects transactions containing a posting matching any pattern
while retaining all postings in each selected transaction. `id` selects the transaction with
that positive integer ID. `order` is `newest` or `oldest` and defaults to
`oldest`; `page` defaults to `1`, while `pageSize` defaults to `100`. Page values
are positive integers, and `pageSize` cannot exceed 100.
The result contains `order`, the selected `page`, `pageSize`,
`totalTransactions`, `totalPages`, and `transactions`. Transactions include
their ordered note text. Postings retain their nullable source `amount`, lot
cost, transaction cost, balance assignment, and balance assertion, as well as
the existing resolved `amounts` array.

The `transactions` CLI command, also available as `print`, defaults to
`--format text`. Its repeatable `--accounts PATTERN` option selects transactions
by account pattern, and `--id ID` selects one transaction. Text output is a Ledger-style
journal containing the transactions on the selected page.
`--format json` returns the complete paginated API result, while `--format csv`
returns one row per posting amount with transaction and posting fields.

### `journal.reconciliationEntries({ accounts, related })`

Returns resolved posting amounts for one or more account patterns, ordered
by posting date and journal position. `accounts` must be a non-empty array of
non-empty strings. `related` defaults to `false`; when true, the result instead
contains the other postings from transactions involving each selected pattern.

Each row contains `date`, `amount`, `description`, `commodity`, `account`,
`filename`, `sourceLine`, and `row`. Related rows also contain
`postingAccount`, which identifies the other posting's account. `amount` is an
exact decimal string, `account` is the selected pattern, and `row` is the
one-based position in the complete ordered posting-amount result.

## Command-line parity

Every query method on the object returned by `openJournal()` has a CLI command,
and every CLI command maps to one such method. Run `ledlight --help` for the
complete command list and per-command parameters. Commands require `--file
PATH`, corresponding to the `journalPath` passed to `openJournal()`.

Every API input has a corresponding CLI argument. The CLI may additionally
offer output-only arguments that select a representation without changing the
API call or its result. Commands without an established text format return the
API result as JSON. The report commands preserve their human-readable formats.
`balance`, `balance-history`, and `unrealized-gains` accept `--format json`;
`investment-performance` accepts `--json` to return every API field. API option
names use kebab case on the command line; for example, `withValuationValue` is
`--with-valuation-value` and `includeTotal` is `--include-total`.

`accounts` defaults to `--format text` and prints the same
newline-separated account names as `ledger accounts`. Repeating `--accounts
PATTERN` selects names matching any supplied pattern. In `--ledger` mode these
filters are emitted as Ledger's positional report-query arguments. Its `--details` flag
includes comments and transaction counts; detailed text uses a table with the
right-aligned transaction count first, followed by account and comment. The
`--format json` and `--format csv` alternatives encode either the account names
or, with `--details`, all fields returned by `journal.accounts(options)`.

`tags`, `commodities`, and `prices` likewise require no query parameters.
They default to `--format text` and also accept `--format json` and `--format
csv`. Text tag and commodity output contains one name per line. Text price
output contains one price per line with a Ledger-style slash-separated date.
JSON and CSV retain every field returned by `journal.prices()`.

CLI commands preserve the query result on stdout and emit a human-readable
summary of the journal's warnings on stderr when it is non-empty. No warning
output is written for a clean journal.
