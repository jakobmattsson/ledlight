# Global accounting correctness scenarios

The executable scenarios are `tests/cases/cli/global-*.case`. Each case contains
its own journal, CLI command, and exact OUTPUT, WARNINGS, or ERROR expectation.
The expectations are derived from the accounting examples, never copied from
Ledger CLI output. No configured accounting instance is required.

Each scenario name below has one or more numbered case files. For example,
`global-allocation-below-minimum-1.case` runs `unrealized-gains` against its
embedded journal. A second numbered case can query a later snapshot of the
same accounting history.

The case runner invokes Ledlight in process and compares complete output and
warning text. Warnings cover the complete journal, independently of command,
account filters, and report dates. Consequently an earlier snapshot can include
a warning about a later disposal. A required valuation or basis that cannot be
calculated produces ERROR and exit code 1.

`NOTES.md` retains positions, cash flows, realized and unrealized results,
hand-derived disposal bounds, and example feasible allocations. Those figures
explain the expected output; they are not a parallel machine-readable output
contract or separately asserted internal implementation state. In particular,
a successful report does not expose its computed disposal interval. Boundary
acceptance and rejection scenarios test observable consequences; exact successful
intervals and allocation witnesses remain explanatory calculations.

Run `node --test tests/integration/src/cli/cli-cases.test.js` for these scenarios,
`npm run test:integration` for all integration tests, or `npm test` for canonical
project verification. See [ALLOCATION.md](ALLOCATION.md) for history-dependent
bounds, proportional allocations, chronological order, transfers and splits.

## Scenarios and expected results

Amounts below are USD at the last snapshot. Realized results are after separately
expensed fees. Exact report expectations, including earlier dates, are in the numbered
`global-*.case` files; position-level calculations are in `NOTES.md`.

| Scenario | Net realized | Unrealized | Economic result | Expected outcome |
| --- | ---: | ---: | ---: | --- |
| `open-gain` | 0 | 200 | 200 | Balanced |
| `open-loss` | 0 | -200 | -200 | Balanced |
| `open-break-even` | 0 | 0 | 0 | Balanced; empty gain report |
| `partial-fifo` | 600 | 100 | 700 | Balanced |
| `partial-lifo` | 200 | 500 | 700 | Balanced |
| `partial-average` | 400 | 300 | 700 | Balanced |
| `partial-custom` | 500 | 200 | 700 | Balanced without matching individual original lots |
| `fully-sold-fifo` | 1000 | 0 | 1000 | Zero units and basis |
| `fully-sold-lifo` | 1000 | 0 | 1000 | Zero units and basis |
| `fully-sold-average` | 1000 | 0 | 1000 | Zero units and basis |
| `fractional-multiple-sales` | 20.1 | 10.05 | 30.15 | Exact decimal reconciliation |
| `fees-expensed` | 285 | 0 | 285 | Both fees separately expensed |
| `purchase-fee-capitalized` | 291 | -6 | 285 | Purchase fee in basis; sale fee expensed |
| `sale-fee-netted` | 285 | 0 | 285 | Purchase fee expensed; sale fee in net proceeds |
| `partial-transfer` | 0 | 200 | 200 | Gain split 120 / 80 across accounts |
| `full-transfer` | 0 | 200 | 200 | Empty source; all basis and gain at destination |
| `split` | 40 | 160 | 200 | Two-for-one split followed by a partial sale |
| `reverse-split` | 40 | 160 | 200 | One-for-two split followed by a partial sale |
| `sold-with-positive-residual` | 100 | Invalid | 0 | Diagnose remaining basis +100 |
| `sold-with-negative-residual` | -100 | Invalid | 0 | Diagnose remaining basis -100 |
| `offsetting-closed-residuals` | 0 | Invalid | 0 | Diagnose +100 and -100 separately |
| `incorrect-realized-result` | 200 | 0 | 300 | Diagnose result difference -100 |
| `transfer-without-basis` | 0 | Unknown | 200 | Incomplete; destination basis missing |
| `missing-market-price` | 0 | Unknown | Unknown | Incomplete valuation; basis known |

The additional 16 `allocation-*` scenarios are listed with their expected bounds
and outcomes in [ALLOCATION.md](ALLOCATION.md). Together these directories contain
40 standalone scenarios.

## Scope

These are complete-history, long-position examples in USD with no opening
holdings, external asset transfers, or foreign-currency basis. Internal transfers
have both accounts present. Purchases add basis, sales remove it, transfers carry
it, and splits preserve total basis while changing units. Separately expensed
fees affect net results once; capitalized fees form part of acquisition cost.

The total-result identity and zero residual basis at liquidation do not prove
that all earlier allocations were possible. The warning expectations preserve
historical violations, including ones that cancel in portfolio totals.

Tax calculations, tax metadata and exemption flags are outside Ledlight's scope.
The fixtures do not enforce FIFO, LIFO, average cost, tax treatment, or matching
individual sold shares to original lots. A historical allocation must merely
have at least one feasible explanation under the recorded movements. These cases
do not define short-sale rules, every corporate action, or cross-currency policy.
