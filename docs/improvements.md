# Improvement backlog

This document records improvement opportunities identified during the initial
extraction of Ledlight from Fonden. They are proposals rather than established
compatibility guarantees. Each item should be evaluated and split into a
focused change before implementation.

The Ledger CLI differential test corpus is not listed here because it has
already been implemented. It should continue to grow alongside supported
syntax and reporting behavior.

## Priority 1: make database freshness and rebuilds robust

The freshness scan and a later report are separate filesystem operations. A
source file can change after the database has been declared current. An object
returned by `openProject()` also keeps using the database and cached valuation
data without another freshness check.

Choose and document one lifecycle model:

- `openProject()` represents an immutable snapshot, and callers reopen it to
  observe changes; or
- an explicit `refresh()` operation updates the database and invalidates every
  derived cache.

Rebuilds are serialized across Ledlight processes with a bounded lock. A
process checks freshness again after acquiring the lock so it can reuse work
completed by another process. Building and validating at a temporary path
before atomically replacing the previous database remains future work. Schema
migration currently occurs before the transaction that replaces journal
contents, so migration and content replacement do not form one failure
boundary.

Add tests for a source change during freshness checking, a failed rebuild
preserving the previous usable database, and cache invalidation after a
successful refresh.

## Priority 2: establish performance limits

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

## Priority 3: use commodity format metadata

Ledlight stores the journal's commodity `format` property, but CLI monetary
output currently assumes two fractional digits and comma thousands separators.
That is unsuitable for commodities whose declared precision or separators are
different.

Formatting remains a CLI responsibility, but the CLI must not query internal
database modules. The project API exposes the metadata through
`commodities({ usage: 'all' })`, allowing the CLI to apply declared formats
without acquiring accounting logic of its own.

Tests should cover zero-, two-, and multi-decimal commodities as well as a
format without digit grouping. Declared formats apply only to human-readable
CLI output; CSV and JSON retain canonical, ungrouped decimal values. A missing
`format` declaration still needs one documented fallback policy.

## Priority 4: make numeric precision boundaries explicit

Accounting quantities and valuation rates use exact decimal strings through
parsing, storage, aggregation, and valuation. Investment performance converts
daily monetary values and flows to JavaScript `Number` before calculating
returns. Consequently, monetary fields such as opening value, ending value,
contributions, and profit or loss are also returned as floating-point numbers.

Prefer exact decimal strings for monetary result fields and reserve floating
point for ratios and iterative return calculations. If the existing result
shape is retained, document its precision limits and add tests with values
beyond JavaScript's safe integer precision and with long fractional quantities.

## Smaller maintainability and product improvements

- Several `commodity` declarations marked `default` are rejected as a project
  configuration error, including repeated declarations of the same symbol.
- Keep extending the Ledger differential corpus whenever syntax or aggregate
  behavior is added or corrected.

## Suggested implementation order

1. Define project snapshot and rebuild behavior before introducing long-lived
   processes or concurrent callers.
2. Add benchmarks and precision-boundary tests before changing storage or
   investment-result representations.
3. Apply commodity-aware presentation.
4. Address the smaller maintainability items incrementally.
