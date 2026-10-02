# Improvement backlog

This document records improvement opportunities identified during the initial
extraction of Ledlight from Fonden. They are proposals rather than established
compatibility guarantees. Each item should be evaluated and split into a
focused change before implementation.

The Ledger CLI differential test corpus is not listed here because it has
already been implemented. It should continue to grow alongside supported
syntax and reporting behavior.

## Priority 1: unify valuation semantics

Ledlight currently has more than one price-resolution path:

- `sqlite/materialize-valuation-prices.js` follows the latest quote for a
  commodity on each date;
- the aggregate-report fallback in `reports/valuation-rates.js` also starts
  from one latest quote per commodity; and
- `createLedgerValuationRateResolver` prefers a direct quote to the valuation
  commodity and can try older resolvable quotes when a newer chain fails.

These paths can disagree. For example, an older direct quote may remain usable
when a newer indirect quote leads to a commodity without a price. One API can
then resolve a value while another report rejects the same journal or derives a
different value.

Choose one documented price-selection algorithm and use it for materialized
rates, aggregate reports, balance history, investment performance, and the
public Ledger-compatible resolver. Add regression cases for:

- an older direct quote and a newer indirect quote;
- a newer chain that cannot reach the valuation commodity;
- several quotes on the same date;
- circular chains; and
- an intermediate commodity whose price changes independently.

Completion means that every public operation resolves the same commodity at
the same date to the same exact rate or the same classified error.

## Priority 2: define and validate the public API

The package root and the object returned by `openProject()` do not currently
present the same set of operations. The project object additionally exposes
transaction, account, reconciliation-oriented, and valuation-resolver methods.
Anything reachable through `openProject()` is public in practice even when it
is not documented.

Define the supported API inventory and decide which operations are stable.
Then either expose equivalent top-level functions or explicitly group
project-scoped operations under a documented project API. Every operation
should document:

- accepted options and defaults;
- whether unknown options are rejected;
- result fields and their value types;
- ordering guarantees;
- snapshot and freshness behavior; and
- possible errors.

Exported error classes or stable error codes should distinguish at least syntax
errors, invalid API input, project configuration errors, missing valuation
data, and database failures. Consumers should not need to inspect error-message
text.

TypeScript declarations, or comprehensive JSDoc types generated into package
documentation, would make this contract easier to consume and review without
requiring the implementation itself to be converted to TypeScript.

## Priority 3: make database freshness and rebuilds robust

The freshness scan and a later report are separate filesystem operations. A
source file can change after the database has been declared current. An object
returned by `openProject()` also keeps using the database and cached valuation
data without another freshness check.

Choose and document one lifecycle model:

- `openProject()` represents an immutable snapshot, and callers reopen it to
  observe changes; or
- an explicit `refresh()` operation updates the database and invalidates every
  derived cache.

Rebuild behavior should also be exercised with concurrent Ledlight processes.
Consider building a complete database at a temporary path, validating it, and
atomically replacing the previous database. Schema migration currently occurs
before the transaction that replaces journal contents, so migration and
content replacement do not form one failure boundary.

Add tests for a source change during freshness checking, two concurrent
rebuilds, a failed rebuild preserving the previous usable database, and cache
invalidation after a successful refresh.

## Priority 4: establish performance limits

`valuation_prices` currently stores one row per commodity and calendar day from
the commodity's first appearance through the latest relevant date. Balance
history and investment performance also build daily position sequences. This
is simple and fast for small journals, but storage and rebuild work grow with
approximately the number of commodities multiplied by the journal's calendar
span.

Create deterministic benchmark journals covering representative sizes, such as
10, 20, and 40 years with increasing transaction and commodity counts. Record
budgets for:

- cold database build time;
- warm report time;
- database size;
- peak memory use; and
- investment-performance report time.

Optimize only after measuring. If daily materialization becomes the limiting
factor, evaluate sparse rate intervals or change-point storage while preserving
the exact public report semantics.

## Priority 5: use commodity format metadata

Ledlight stores the journal's commodity `format` property, but CLI monetary
output currently assumes two fractional digits and comma thousands separators.
That is unsuitable for commodities whose declared precision or separators are
different.

Formatting remains a CLI responsibility, but the CLI must not query internal
database modules. The public API should therefore expose the format metadata
needed to render its result, either as report metadata or through a public
commodity-description operation. The CLI can then apply the declared format
without acquiring accounting logic of its own.

Tests should cover zero-, two-, and multi-decimal commodities as well as a
format without digit grouping. A missing `format` declaration needs one
documented fallback policy.

## Priority 6: make numeric precision boundaries explicit

Accounting quantities and valuation rates use exact decimal strings through
parsing, storage, aggregation, and valuation. Investment performance converts
daily monetary values and flows to JavaScript `Number` before calculating
returns. Consequently, monetary fields such as opening value, ending value,
contributions, and profit or loss are also returned as floating-point numbers.

Prefer exact decimal strings for monetary result fields and reserve floating
point for ratios and iterative return calculations. If the existing result
shape is retained, document its precision limits and add tests with values
beyond JavaScript's safe integer precision and with long fractional quantities.

## Priority 7: prepare the distributable package

The current package is private and unlicensed. Before publication, define:

- package license and repository metadata;
- an explicit `exports` map;
- the files included in the published archive;
- supported Node.js versions;
- CommonJS and possible ESM support;
- the supported `better-sqlite3` platforms and Node ABI policy; and
- the stability and semantic-versioning policy for the Node.js API, CLI, and
  stored database schema.

Add an automated package smoke test that creates the tarball, installs it in an
empty temporary project, imports the public module, and invokes the installed
`ledlight` executable. The test must prove that production use does not depend
on repository-only files.

The runtime composition root currently scans the source tree and pairs every
factory file with a manually maintained dependency-injection name. Explicit
registration, or a generated and verified manifest, would make the packaged
runtime less dependent on repository layout.

## Smaller maintainability and product improvements

- Decide whether several `commodity` declarations marked `default` are valid.
  The current behavior silently uses the last declaration.
- Split investment-performance data access, cash-flow classification, return
  calculations, and result assembly into smaller independently testable units.
- Expand API documentation from examples into a complete operation and result
  reference.
- Add a systematic API/CLI parity table so every CLI option is tied to the
  public function and option that provides its behavior.
- Keep extending the Ledger differential corpus whenever syntax or aggregate
  behavior is added or corrected.

## Suggested implementation order

1. Unify valuation semantics because inconsistent answers are a correctness
   risk.
2. Stabilize and validate the public API before additional consumers depend on
   accidental behavior.
3. Define project snapshot and rebuild behavior before introducing long-lived
   processes or concurrent callers.
4. Add benchmarks and precision-boundary tests before changing storage or
   investment-result representations.
5. Apply commodity-aware presentation and complete package publication work.
6. Address the smaller maintainability items incrementally.
