# Node.js API reference

Ledlight is a CommonJS module. The package root exports `openJournal` and
`parseLedgerText`:

```js
const { openJournal, parseLedgerText } = require('ledlight');
```

Dates use `YYYY-MM-DD`. Accounting quantities and valuation rates are exact
decimal strings unless a result field is explicitly documented as a number.
API option objects reject unknown properties and values of the wrong type,
including `null`. Omit the options argument or pass `{}` to use defaults.

All account selections use literal substring patterns. A leading `^` anchors a
pattern to the start of the account name and a trailing `$` anchors it to the
end. Using both selects one exact account. No other regular-expression syntax
is recognized; all other characters are matched literally.

Every CLI account filter uses the repeatable `--accounts PATTERN` option.
The singular `--account` is not supported.

## Query parameter conventions

All dates must be valid calendar dates in `YYYY-MM-DD` format; timestamps,
JavaScript `Date` objects, and `null` are rejected. `from` and `to` are inclusive,
may be supplied independently, and must satisfy `from <= to` when both are
present. For `unrealizedGains`, `to` is an inclusive snapshot cutoff and `from`
is not supported.
No omitted date defaults to the current day.

Selection arrays contain non-empty strings. Exact duplicate selections are
removed, preserving their first occurrence. Empty optional arrays mean no
restriction. Commodity selections match exact symbols; account selections use
the shared pattern syntax above. Boolean options accept only booleans and
all default to `false`.

| Query | Date inputs and meaning | Other inputs |
| --- | --- | --- |
| `aggregate` | `from`, `to`: filter activity; `to` also sets valuation cutoff. `dateBasis` defaults to `posting`. | `accounts`, `valuation`, `groupBy`, `denominate`, `withValuationValue`, `invert`, `includeTotal` |
| `totalHistory` | `from`, `to`: select daily closing totals, retaining earlier activity. `dateBasis` defaults to `posting`. | `accounts`, `valuation`, `invert` |
| `unrealizedGains` | `to`: position and valuation cutoff. `dateBasis` defaults to `posting`. | `accounts` |
| `investmentPerformance` | `from`, `to`: performance period, using posting dates and retaining the opening balance. | `accounts`, `commodities`, `excludeCommodities` |
| `postings` | `from`, `to`: filter posting dates. | `accounts` |
| `transactions` | No date filter; results include transaction and posting dates. | `accounts`, `id`, `order`, `page`, `pageSize` |
| `accounts` | No date filter. | `accounts`, `usage` |
| `commodities` | No date filter. | `usage` |
| `tags` | No date filter. | `usage` |
| `prices` | No date filter. | `mode`: `effective` or `directives` |

`dateBasis: 'transaction'` changes the date used for positions or activity;
market prices always retain their own price dates. Queries without `dateBasis`
reject it. Adding date filters to more queries or adding date-basis selection to
`postings` and `investmentPerformance` would extend the public contract.

Existing API/CLI differences are deliberate compatibility constraints:

- Declaration queries default to `usage: 'all'` in the API and `--usage used`
  in the CLI, where the default matches Ledger.
- Transaction `order` selects forward (`oldest`) or reverse (`newest`) journal
  order, not a date sort. The API and CLI return all matching transactions
  unless pagination is explicitly requested.

These spellings and defaults remain supported. Unrealized gains use only `to`
because they describe a snapshot rather than period activity; all earlier
positions contribute to that snapshot.

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

## Parsing Ledger text

### `parseLedgerText(sourceText, options)`

Parse a Ledger string into a syntax tree without reading files, following
`include` directives, opening a database, or performing accounting validation.
`sourceText` must be a string. The optional `options` object accepts only
`source`, a string used in locations and syntax errors; it defaults to
`'<input>'`. The parser is strict: malformed or unsupported syntax throws
`LEDLIGHT_SYNTAX` at the first error and never returns a partial tree. It does
not use the warning and recovery behavior of `openJournal`.

The result is `{ source, entries }`. `entries` preserves source order. Every
entry has `type` and `location: { source, line, column }`, with one-based line
and column numbers. Directive comments are `string | null`. Amounts are
`{ quantity: string, commodity: string }`; the original decimal precision is
preserved in `quantity`. Entry shapes are:

| Type | Fields |
| --- | --- |
| `include` | `path`, `comment`, `location` |
| `account`, `tag` | `name`, `comment`, `location` |
| `commodity` | `symbol`, `properties`, `comment`, `location` |
| `price` | `date`, `commodity`, `price` (amount), `comment`, `location` |
| `comment` | `text`, `location` |
| `transaction` | `date`, `description`, `postings`, `comments`, `location`; optional `tags` |

Commodity `properties` is an array of `{ name, value, comment, location }`;
`value` is a string or `null`. A transaction posting contains `type: 'posting'`,
`account`, `amount`, `lotCost`, `cost`, `balanceAssignment`,
`balanceAssertion`, `postingDate`, `comments`, and `location`, plus optional
`tags`. The amount, balance assignment, and balance assertion fields are an
amount or `null`. `lotCost` and `cost` are `{ total: boolean, amount }` or
`null`; they represent `{...}` / `{{...}}` and `@` / `@@` respectively. A comment
is `{ text, key, value, location }`, plus optional `tags`; `key` and `value`
are strings or `null`. A comment on the transaction or posting line becomes
its first comment. An indented comment before the first posting belongs to the
transaction; one after a posting belongs to that posting. Tags are
`{ name, value }`, where `value` may be `null`.
An inline posting date such as `[2024-01-03]` sets `postingDate` and is excluded
from the posting's comments. A date-only marker creates no comment.
Top-level semicolon comments are separate `comment` entries in source order.

For example:

```js
const ast = parseLedgerText(
  '2024-01-02 Buy shares\n  ; Generated-ID trade-1\n  Assets:Broker  2 STOCK {8 SEK}\n  Assets:Cash  -16 SEK\n',
  { source: 'proposed.ledger' },
);
const transaction = ast.entries[0];
console.log(transaction.comments[0].text); // Generated-ID trade-1
console.log(transaction.postings[0].lotCost.amount.quantity); // 8
```

This API parses text only. Callers retain responsibility for merging source
blocks and validating the resulting journal before publishing it.

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
Warnings cover the entire journal and do not depend on the report command,
account selection, or snapshot date. Global investment checks include
`IMPOSSIBLE_COST_BASIS`, `RESIDUAL_COST_BASIS`, and `RESULT_MISMATCH`;
they are computed during ingestion and remain available on cached opens.

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

### `journal.aggregate(options)`

Options:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `from` | string | unbounded | Inclusive start date |
| `to` | string | unbounded | Inclusive end date and valuation date |
| `accounts` | string[] | `[]` | Account patterns combined with OR |
| `dateBasis` | `posting` or `transaction` | `posting` | Date used for filtering |
| `valuation` | `cost` or `market` | `market` | Valuation method when converting or adding valuation values |
| `groupBy` | `account` or `commodity` | `account` | Result grouping dimension |
| `denominate` | boolean | `false` | Convert and combine rows in the journal default commodity |
| `withValuationValue` | boolean | `false` | Preserve commodity rows and add `valuationValue` |
| `invert` | boolean | `false` | Negate quantities and valuation values |
| `includeTotal` | boolean | `false` | Append an exact total for each reported commodity |

`denominate` and `withValuationValue` are mutually exclusive.
`includeTotal` is unavailable with commodity grouping because the grouped
rows already contain the totals for each commodity.
Account-grouped rows are `{ account, quantity, commodity }`, sorted by account
and commodity. Commodity-grouped rows omit `account`, combine all matching
accounts, and retain exact zero balances. `withValuationValue` adds an exact
`valuationValue`. A total row is
`{ account: 'Total', quantity, commodity, isTotal: true }`. Totals are appended
in commodity order and retain exact zero balances. With `withValuationValue`,
each total also includes the summed `valuationValue` for that commodity. Empty
reports have no total rows. Conversion to the default commodity is optional;
with `denominate`, there is a single total in that commodity.

`valuation: 'market'` (the default) uses market prices at the valuation cutoff.
`valuation: 'cost'` uses the signed lot costs recorded on each posting, including
unit costs (`{...}`) and total costs (`{{...}}`). Sales remove the recorded cost
of the sold units, not their sale proceeds. Transfers carry their recorded cost.
Amounts in the default commodity retain their face value. Other commodities
require a lot cost in the default commodity; missing or differently denominated
lot costs raise `LEDLIGHT_MISSING_VALUATION_DATA` without falling back to market
prices. Cost valuation does not require market prices. Without either valuation
output option, quantities remain unchanged regardless of `valuation`.
Realized gains continue to come from the journal's sale postings.
Lot costs and transaction prices on default-commodity postings must also be
expressed in the default commodity; ingestion warns with `INVALID_COMMODITY_TRADE`
when an annotation uses another commodity.

### `journal.totalHistory(options)`

Options are `from`, `to`, `accounts`, `dateBasis`, `valuation`, and `invert`. The date bounds
select output days; postings before `from` still contribute to every daily
total. `valuation` accepts `cost` or `market` and defaults to `market`. Market
valuation uses each day's prices; cost valuation accumulates the recorded lot
costs with the same rules as `aggregate`, so price changes do not alter cost totals.
Both modes use the same date range. History ends at the latest
posting/transaction date (according to `dateBasis`) or price date in the journal,
or at `to` if earlier. No rows are synthesized beyond the available history.

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

All lot costs contributing to a selected open position must be expressed in
the journal default commodity. Ingestion records `FOREIGN_LOT_COST_CURRENCY`
warnings for non-default commodity positions with costs in another currency.
They are available through `journal.warnings` and every CLI report. The gain
report omits affected account/commodity positions;
account sums and the CLI total cover only the remaining positions and may be
incomplete. The report does not infer historical exchange rates or lot allocations.
Missing lot costs on other open positions still cause an error. Closed positions
are omitted before checking their lot costs.

Options are `to`, `accounts`, and `dateBasis`. `to` is the inclusive snapshot
date for both positions and valuation prices, `accounts` contains account
patterns, and `dateBasis` is `posting` (the default) or `transaction`. When
`to` is omitted, all positions and the latest available journal prices are
used. `from` is not supported because earlier positions contribute to the
snapshot. The former `at` option is rejected; use `to` in the API and `--to`
in the CLI.

### `journal.investmentPerformance(options)`

Options are `from`, `to`, `accounts`, `commodities`, and
`excludeCommodities`. The three selections are arrays of non-empty strings.
Account values use the shared account-pattern syntax. Commodity inclusion and
exclusion cannot overlap.

The interval is inclusive and uses posting dates. Earlier positions contribute
to the opening value, which is the closing value immediately before `from` (or
the last available value if `from` is beyond the available history). Only cash
flows inside the interval affect contributions. Missing prices outside the
interval do not fail the report unless needed to value its opening positions.
Automatic commodity discovery includes positions on or before `to`, including
historical positions needed for the opening balance.

For annotated trades, contributions use acquisition lot costs and sale prices
(`@`/`@@`), converted to the default commodity on the posting date. Moving the
cash counterpart between accounts does not change an instrument's return.
Separately expensed fees outside the selected holdings are excluded; capitalized
fees and fees already netted into the sale annotation remain in the trade value.
Selected cash movements contribute their own signed values, so purchases funded
by selected portfolio cash do not create additional contributions. Paired
transfers and splits within the selection on the same posting date create no
external flow; transfers across the account selection use market value.
Incomplete, unannotated trades retain the market/counterposting fallback and
their ingestion warnings; account-independent trade returns require annotations.

Without `from`, the period starts at the first selected posting. Daily points
end at the latest selected posting or journal price, capped by `to`; an explicit
later `to` remains the terminal date for return calculations without adding
synthetic daily points. If `from` is beyond available history and `to` is
omitted, `to` equals `from` and the daily points are empty.

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

## Additional journal queries

### `journal.accounts({ accounts, usage })`

Returns one row per declared account in Ledger order. The optional `accounts`
array selects names matching any supplied pattern and defaults to `[]`.
`usage` is `all`, `used`, or `unused` and defaults to `all`. Selecting `used`
returns only accounts used by non-zero postings, matching Ledger's `accounts`
command; selecting `unused` finds declarations that can be removed:

```js
{
  account,
  comment,
  used,
  transactionCount,
}
```

### `journal.tags({ usage })`

Returns declared tags sorted by name. `usage` accepts `all`, `used`, or `unused`
and defaults to `all`; `used` matches Ledger's `tags` command. Each row is
`{ tag, used }`.

### `journal.commodities({ usage })`

Returns declared commodities sorted by symbol. `usage` accepts `all`, `used`,
or `unused` and defaults to `all`; `used` matches Ledger's `commodities`
command. Each row is:

```js
{
  commodity,
  comment,
  format,
  isDefault,
  used,
}
```

`comment` and `format` are strings or `null`; `isDefault` and `used` are
booleans. A later duplicate commodity declaration produces a warning and is
not stored, so the first declaration supplies the metadata. Other commodity
properties are not currently exposed.

### `journal.prices({ mode })`

`mode` defaults to `effective`, which returns Ledger's effective market prices
for used commodities. The last price
encountered for a base commodity, quote commodity, and date wins, whether explicit
or inferred from lot or transaction costs:

```js
{
  date,
  baseCommodity,
  quoteQuantity,
  quoteCommodity,
  comment,
}
```

`comment` is a string or `null`. Explicit quantities retain their source decimal
strings; inferred unit prices are calculated to thirty decimal places. Text
output follows Ledger's display precision for inferred prices, while API, JSON,
and CSV quantities retain their calculation precision.
Rows sort by ascending date, then base commodity. Dates use `YYYY-MM-DD`.

`mode: 'directives'` returns every explicit `P` directive from the journal,
including prices for unused commodities and earlier prices superseded on the
same day. It does not infer prices from transactions. Rows sort by base
commodity, then ascending date, then journal source order. The result fields
are the same as in effective mode, and `quoteQuantity` retains the source
decimal string. This order lets consumers apply their own last-directive-wins
rule for each commodity and date.

### `journal.transactions({ accounts, id, order, page, pageSize })`

Returns a transaction collection. `accounts`
is an array that selects transactions containing a posting matching any pattern
while retaining all postings in each selected transaction. `id` selects the transaction with
that positive integer ID. `order` is `newest` or `oldest` and defaults to
`oldest`. Without `page` and `pageSize`, all matching transactions are returned.
Pagination requires both options; supplying only one is an error. Page values
and page sizes are positive integers. `id`, `page`, and `pageSize` also accept
canonical decimal integer strings such as `'2'`, allowing the CLI to pass them
without coercing other input types. Zero, fractions, unsafe integers, whitespace,
and leading zeros are rejected. Pages beyond the result are clamped to the last
page (or page `1` for an empty result).
The result always contains `order`, `totalTransactions`, and `transactions`.
Paginated results additionally contain the selected `page`, `pageSize`, and
`totalPages`. Transactions and their postings each include ordered `comments`
arrays of text. Postings retain their nullable source `amount`, lot
cost, transaction cost, balance assignment, and balance assertion, as well as
the existing resolved `amounts` array.

The `transactions` CLI command defaults to
`--format text` and prints every matching transaction. Its repeatable `--accounts PATTERN` option selects transactions
by account pattern, and `--id ID` selects one transaction. Text output is a Ledger-style
journal containing the matching transactions or the requested page.
`--format json` returns the complete API result, while `--format csv`
returns one row per posting amount with transaction and posting comments encoded
as JSON arrays in `transactionComments` and `postingComments` columns.

### `journal.postings({ from, to, accounts })`

Returns all matching postings in journal order. All options are optional.
`from` and `to` are inclusive ISO dates applied to the posting date. `accounts`
is an array of patterns matched against the posting account; an empty array
selects every account.

Each result contains `postingId`, `postingDate`, `account`, ordered `postingComments`,
the nullable source `amount`, lot cost, transaction cost, balance assignment,
and balance assertion, and every resolved amount. It also contains the parent
transaction's `transactionId`, `transactionDate`, `description`,
and ordered `transactionComments`. `filename` identifies the
source file containing the transaction, including when it was loaded through an
`include`. `transactionSourceLine` is the one-based line number of the transaction
header in that file, not the posting line.

Each resolved amount is `{ quantity, commodity, balance }`. `balance` is the
exact running balance for that posting's account and commodity after applying
the amount. Balances are materialized in posting-date and journal order when
the journal database is rebuilt.

The `postings` CLI command supports the same filters and defaults to `--format
text`. `--format json` preserves the nested API result. `--format csv` emits one
row per resolved amount and includes every source annotation as separate
columns, including `filename` and `transactionSourceLine`. Text output also
includes both source fields.

For reconciliation, use the resolved `amounts` rather than the nullable source
`amount`. To select counterpart postings, fetch all postings and group them by
`transactionId`; filtering by account first would discard those counterparts.

## Command-line parity

Every query method on the object returned by `openJournal()` has a CLI command,
and every CLI command maps to one such method. Run `ledlight --help` for the
complete command list and per-command parameters. Commands require `--file
PATH`, corresponding to the `journalPath` passed to `openJournal()`.

Every API input has a corresponding CLI argument. The CLI may additionally
offer output-only arguments that select a representation without changing the
API call or its result. Commands without an established text format return the
API result as JSON. The report commands preserve their human-readable formats.
`aggregate`, `total-history`, `unrealized-gains`, and `investment-performance`
accept `--format json` to return every API field. Investment performance also
accepts `--format csv` for one data row with the report fields as columns;
`commodities` and `points` are JSON arrays in their CSV cells, and nulls are
empty cells. API option names use kebab case on the command line; for example,
`withValuationValue` becomes `--with-valuation-value` and `includeTotal` becomes
`--include-total`.

`accounts` defaults to `--format text` and prints the same
newline-separated account names as `ledger accounts`. Repeating `--accounts
PATTERN` selects names matching any supplied pattern. Its `--details` flag
includes comments and transaction counts; detailed text uses a table with the
right-aligned transaction count first, followed by account and comment. The
`--format json` and `--format csv` alternatives encode either the account names
or, with `--details`, all fields returned by `journal.accounts(options)`.

`tags`, `commodities`, and `prices` likewise require no query parameters.
They default to `--format text` and also accept `--format json` and `--format
csv`. Text tag and commodity output contains one name per line. With
`commodities --details`, text uses a metadata table and JSON or CSV includes
every field returned by `journal.commodities(options)`. Text price output
contains one price per line with an ISO date. JSON and
CSV retain every field returned by `journal.prices()`.
`prices --mode directives` selects explicit journal price directives; the
default `--mode effective` preserves the Ledger-compatible price listing.

CLI commands preserve the query result on stdout and emit a human-readable
summary of the journal's warnings on stderr when it is non-empty. No warning
output is written for a clean journal.
