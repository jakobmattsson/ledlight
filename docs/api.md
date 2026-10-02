# Node.js API reference

Ledlight is a CommonJS module. Import supported operations from the package
root:

```js
const ledlight = require('ledlight');
```

Dates use `YYYY-MM-DD`. Accounting quantities and valuation rates are exact
decimal strings unless a result field is explicitly documented as a number.
Report option objects reject unknown properties and values of the wrong type.

## Package metadata and errors

### `version`

The package version string from `package.json`.

### `errorCodes`

A frozen object containing stable codes for public failures:

| Name | Value | Meaning |
| --- | --- | --- |
| `SYNTAX` | `LEDLIGHT_SYNTAX` | Unsupported or malformed journal syntax |
| `INVALID_API_INPUT` | `LEDLIGHT_INVALID_API_INPUT` | Invalid options or arguments supplied by the caller |
| `PROJECT_CONFIGURATION` | `LEDLIGHT_PROJECT_CONFIGURATION` | Invalid project discovery, configuration, or journal structure |
| `MISSING_VALUATION_DATA` | `LEDLIGHT_MISSING_VALUATION_DATA` | A required default commodity or conversion price is unavailable |
| `DATABASE` | `LEDLIGHT_DATABASE` | A database could not be opened, read, or updated |

Public errors expose one of these values through `error.code`. Consumers should
not depend on a Ledlight-specific error class or inspect message text. Syntax
errors additionally expose `source`, `line`, and `column`; an underlying SQLite
code is preserved as `sqliteCode` when available.

## Parsing and journal loading

### `parse(sourceText, { source })`

Parses one source string without filesystem access. `source` identifies the
input in locations and error messages. The result is:

```js
{
  source,
  entries,
}
```

Every entry has `type` and `location: { source, line, column }`. Supported entry
shapes are:

- account and tag declarations: `name`, `comment`, and `location`;
- commodity declarations: `symbol`, `comment`, `properties`, and `location`;
- commodity properties: `name`, `value`, `comment`, and `location`;
- prices: `date`, `commodity`, `price`, `comment`, and `location`;
- includes: `path`, `comment`, and `location`; and
- transactions: `date`, `status`, `code`, `description`, `payee`, `narration`,
  `comment`, `postings`, `notes`, and `location`.

An amount is `{ quantity, commodity }`. Posting amounts can be `null` before
semantic resolution. A posting can also contain a `lotCost`, transaction
`cost`, balance assignment, balance assertion, posting date, and comment. Lot
costs and transaction costs are `{ total, amount }`; `total` distinguishes
`{{}}` or `@@` from `{}` or `@`. Transaction notes contain `text`,
optional `key` and `value`, and a source location.

Semantic validation requires positive non-default commodity postings to carry
a lot cost and no transaction price. Negative non-default commodity postings
must carry both annotations. This rule runs after parsing and therefore reports
a journal validation error at the posting location rather than a syntax error.

### `loadJournal(entryPath)`

Loads and parses a root journal and its complete include tree. Includes are
replaced by their entries in deterministic traversal order. The result is:

```js
{
  rootPath,
  files: [{ path, sha256, size }],
  entries,
}
```

Paths are absolute. `entries` use the same structures as `parse`.

## Project discovery and database freshness

### `loadProjectPaths(startDirectory)`

Searches `startDirectory`, or the current working directory, and its parents
for `.ledgerrc`. The file must contain exactly one `--file` option. Returns:

```js
{
  projectRoot,
  journalPath,
  databasePath,
}
```

The database path is `<projectRoot>/tmp/ledger.sqlite`.

### `ensureProjectDatabaseCurrent(startDirectory)`

Discovers the project, compares the source manifest with the stored manifest,
and rebuilds the database when required. Rebuilds are serialized across
Ledlight processes. A process that waited for another rebuild checks freshness
again and reuses the completed database when possible. Waiting is bounded; a
timeout fails with `errorCodes.DATABASE`. The result contains the three project
paths plus:

```js
{
  rebuilt,
  status: {
    databasePath,
    rootPath,
    inSync,
    reason,
    added,
    removed,
    changed,
  },
  summary, // present only after a rebuild
}
```

The rebuild summary contains source, entry, transaction, posting, price, and
materialized-valuation counts together with the valuation commodity.

### `openProject(startDirectory)`

Ensures database freshness once and returns a project object. Use this when
running several operations against one database snapshot. The object contains
the project paths, freshness result, and all methods documented under
[Project-only methods](#project-only-methods). It also provides project-bound
versions of all report and account methods below, without the
`startDirectory` argument.

## Reports

Top-level report functions accept `(options, startDirectory)`. Both arguments
may be omitted. Project-bound methods accept only `options`.

### `aggregateReport(options, startDirectory)`

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

### `balanceHistoryReport(options, startDirectory)`

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

### `gainReport(options, startDirectory)`

Returns unrealized gains and losses for open non-default commodity positions,
grouped by account and expressed as exact decimal strings in the journal
default commodity. Each row is `{ account, quantity, commodity }`; zero-gain
accounts are omitted and losses are negative. Rows are sorted by account.

Options are `to`, `accounts`, and `dateBasis`. `to` is the inclusive position
and valuation date, `accounts` contains literal account prefixes, and
`dateBasis` is `posting` (the default) or `transaction`. When `to` is omitted,
the latest available journal price is used.

### `investmentPerformance(options, startDirectory)`

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

### `accountBalances({ account, to }, startDirectory)`

Returns `{ quantity, commodity }` rows for one exact account through the
optional inclusive date. Rows are sorted by commodity.

### `accountPostings({ account, after }, startDirectory)`

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

## Project-only methods

These methods are currently available on the object returned by `openProject`
but do not have top-level equivalents.

### `commodityDescriptions()`

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

### `accountTransactions({ account })`

Returns newest-first transactions containing postings to one exact account.
Each transaction contains identity and description fields plus `postings`.
Each posting contains `postingDate` and exact amount rows with the running
`balance` for that commodity.

### `ledgerAccounts()`

Returns declared and used accounts sorted by name:

```js
{
  account,
  comment,
  transactionCount,
}
```

### `ledgerTransaction({ transactionId })`

Returns one transaction or `null`. The transaction contains
`transactionId`, `transactionDate`, status, code, description, payee,
narration, comment, and postings. Each posting contains its date, account,
comment, and exact `{ quantity, commodity }` amounts.

### `ledgerTransactions({ order, page, pageSize })`

Returns a paginated transaction collection. `order` is `newest` or `oldest`;
`page` and `pageSize` are positive integers, and `pageSize` cannot exceed 100.
The result contains `order`, the selected `page`, `pageSize`,
`totalTransactions`, `totalPages`, and `transactions`.

### `ledgerValuationRateResolver()`

Returns a cached function `resolve(commodity, throughDate)`. The function
returns the exact rate from `commodity` to the journal default commodity using
prices on or before `throughDate`. It throws when no conversion path exists or
a circular chain is encountered.

## Command-line parity

Every callable operation in the package API and on the object returned by
`openProject()` has a CLI command. Run `ledlight --help` for the complete
command list and per-command parameters. Project-bound commands accept
`--directory PATH`, corresponding to the API's `startDirectory` argument.

Commands without an established table format return the API result as JSON.
The report commands preserve their human-readable formats and accept `--json`
to return every API field. API option names use kebab case on the command line;
for example, `withValuationValue` is `--with-valuation-value`, `includeTotal`
is `--include-total`, and repeated `--account-factor ACCOUNT=FACTOR` values
form the `accountFactors` object.
