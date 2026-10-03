# Node.js API reference

Ledlight is a CommonJS module. The package root exports only `openJournal`:

```js
const { openJournal } = require('ledlight');
```

Dates use `YYYY-MM-DD`. Accounting quantities and valuation rates are exact
decimal strings unless a result field is explicitly documented as a number.
API option objects reject unknown properties and values of the wrong type.

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

## Reports

Report methods are called on the object returned by `openJournal()` and accept
an optional `options` object.

### `journal.aggregateReport(options)`

Options:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `from` | string | unbounded | Inclusive start date |
| `to` | string | unbounded | Inclusive end date and valuation date |
| `accounts` | string[] | `[]` | Literal account prefixes combined with OR |
| `dateBasis` | `posting` or `transaction` | `posting` | Date used for filtering |
| `inValuationCommodity` | boolean | `false` | Convert and combine rows in the journal default commodity |
| `withValuationValue` | boolean | `false` | Preserve commodity rows and add `valuationValue` |
| `invert` | boolean | `false` | Negate quantities and valuation values |
| `includeTotal` | boolean | `false` | Append an exact total; requires `inValuationCommodity` |

`inValuationCommodity` and `withValuationValue` are mutually exclusive.
Ordinary rows are `{ account, quantity, commodity }`, sorted by account and
commodity. `withValuationValue` adds an exact `valuationValue`. A total row is
`{ account: 'Total', quantity, commodity, isTotal: true }`.

### `journal.balanceHistoryReport(options)`

Options are `from`, `to`, `accounts`, `dateBasis`, `invert`, and optional
`accountFactors`. The first five have the same meanings as in
`aggregateReport`. `accountFactors` maps exact account names to decimal factors.

Returns daily rows sorted by date:

```js
{
  date,
  amount,
  commodity,
  factoredAmount, // present when accountFactors was supplied
}
```

Amounts are exact decimal strings in the journal default commodity.

### `journal.gainReport(options)`

Returns unrealized gains and losses for open non-default commodity positions,
grouped by account and expressed as exact decimal strings in the journal
default commodity. Each row is `{ account, quantity, commodity }`; zero-gain
accounts are omitted and losses are negative. Rows are sorted by account.

Options are `to`, `accounts`, and `dateBasis`. `to` is the inclusive position
and valuation date, `accounts` contains literal account prefixes, and
`dateBasis` is `posting` (the default) or `transaction`. When `to` is omitted,
the latest available journal price is used.

### `journal.investmentPerformance(options)`

Options are `from`, `to`, `accounts`, `commodities`, and
`excludeCommodities`. The three selections are arrays of non-empty strings.
Account values are literal prefixes. Commodity inclusion and exclusion cannot
overlap.

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

### `journal.accountBalances({ account, to })`

Returns `{ quantity, commodity }` rows for one exact account through the
optional inclusive date. Rows are sorted by commodity.

### `journal.accountPostings({ account, after })`

Returns resolved amounts for one exact account after the optional exclusive
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

`comment` and `format` are strings or `null`; `isDefault` is a boolean. When a
commodity has several declarations, later comments and format properties take
precedence. Other commodity properties are not currently exposed.

### `journal.accountTransactions({ account })`

Returns newest-first transactions containing postings to one exact account.
Each transaction contains identity and description fields plus `postings`.
Each posting contains `postingDate` and exact amount rows with the running
`balance` for that commodity.

### `journal.ledgerAccounts()`

Returns declared and used accounts sorted by name:

```js
{
  account,
  comment,
  transactionCount,
}
```

### `journal.ledgerTransaction({ transactionId })`

Returns one transaction or `null`. The transaction contains
`transactionId`, `transactionDate`, description, payee, narration, comment,
and postings. Each posting contains its date, account,
comment, and exact `{ quantity, commodity }` amounts.

### `journal.ledgerTransactions({ order, page, pageSize })`

Returns a paginated transaction collection. `order` is `newest` or `oldest`;
`page` and `pageSize` are positive integers, and `pageSize` cannot exceed 100.
The result contains `order`, the selected `page`, `pageSize`,
`totalTransactions`, `totalPages`, and `transactions`.

### `journal.ledgerValuationRateResolver()`

Returns a cached function `resolve(commodity, throughDate)`. The function
returns the exact rate from `commodity` to the journal default commodity using
prices on or before `throughDate`. It throws when no conversion path exists or
a circular chain is encountered.

## Command-line parity

Every query method on the object returned by `openJournal()` has a CLI command,
and every CLI command maps to one such method. Run `ledlight --help` for the
complete command list and per-command parameters. Commands require `--file
PATH`, corresponding to the `journalPath` passed to `openJournal()`.

Commands without an established table format return the API result as JSON.
The report commands preserve their human-readable formats and accept `--json`
to return every API field. API option names use kebab case on the command line;
for example, `withValuationValue` is `--with-valuation-value`, `includeTotal`
is `--include-total`, and repeated `--account-factor ACCOUNT=FACTOR` values
form the `accountFactors` object.
