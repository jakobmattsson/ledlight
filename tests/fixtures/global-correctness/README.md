# Global accounting correctness scenarios

Each scenario contains a standalone `journal.ledger`, an `expected.yaml` with
concrete CLI runs, and `NOTES.md` explaining the calculations. The expected
results are derived from the accounting examples, never copied from Ledger CLI
output. No configured accounting instance is required.

## Read a scenario as a command

For example, `allocation-below-minimum/expected.yaml` specifies:

```yaml
runs:
  - command: unrealized-gains --at 2024-02-28 --format json
    expect:
      exitCode: 0
      result:
        - account: Assets:Broker
          quantity: "27.99"
          commodity: USD
      warnings:
        - "[IMPOSSIBLE_COST_BASIS] Impossible first sale: Assets:Broker sold 11 FUND with cost 11.99 USD; allowed range is 12 to 32 USD"
    pendingWarnings: Global accounting diagnostics are not implemented yet.
```

The journal balances, but selling eleven units cannot consume less than 12 USD
of its available acquisition cost. The report still shows the result calculated
from the booked values, accompanied by a warning. After full liquidation the
result becomes `[]`, while the warning about the earlier sale remains.

To run a scenario manually, use its `command`, prefixed with `node src/cli/run.js`,
and add `--file tests/fixtures/global-correctness/<scenario>/journal.ledger`.

## Expected output contract

- `command` is the actual report command, including snapshot date and any
  account filters. The runner passes arguments directly to Node without a shell
  and adds the path to a test-owned temporary copy of the journal.
- `expect.exitCode` is the process exit code: 0 for a completed report, including
  reports with accounting warnings; 1 when required data prevents calculation.
- `expect.result` is the complete parsed JSON from stdout, including row order.
  Quantities are exact decimal strings. Zero-gain accounts and closed positions
  are omitted. A residual basis on a closed position must appear in warnings,
  not as a phantom unrealized gain.
- `expect.warnings` is the complete ordered list of diagnostic summary lines on
  stderr. `[]` explicitly requires no warnings. Indented source-location lines
  are excluded from comparison because their temporary paths vary.
- `expect.error` replaces `result` when calculation fails. It is the exact error
  line on stderr; stdout must be empty. Unknown basis or market value must not
  be replaced with zero. The current CLI emits the fatal error without ingestion
  warnings, which these error scenarios preserve.
- `pendingWarnings` explains a known warning-behavior gap. Only that run's warning
  assertion is marked TODO. Exit codes, errors and result rows remain active
  assertions, including numerical results for invalid accounting histories.

`IMPOSSIBLE_COST_BASIS`, `RESIDUAL_COST_BASIS`, and `RESULT_MISMATCH` and their
messages specify intended future CLI diagnostics, not implemented production
behavior. Valid transfers and splits should not produce trade warnings; the
current spurious `INVALID_COMMODITY_TRADE` warning is also covered by TODO
assertions. These are real comparisons against desired output, not empty TODO
placeholders. Remove `pendingWarnings` when the implementation satisfies the
contract. The format and wording can be revised deliberately with that API work.

The output policy is explicit: computable booked results remain visible with
warnings for invalid accounting. A report without warnings is the intended
outcome for valid examples, regardless of the user's allocation method. Missing
information needed for the numerical result produces a fatal error.

## Verification and supporting calculations

Run `node --test tests/integration/global-correctness.test.js` for these scenarios,
`npm run test:integration` for all integration tests, or `npm test` for canonical
project verification. The runner actually launches the CLI for every command
using an isolated journal copy and cache. It does not invoke Ledger.

`NOTES.md` retains positions, cash flows, realized and unrealized results,
hand-derived disposal bounds, and example feasible allocations. Those figures
explain the expected output; they are not a parallel machine-readable output
contract or separately asserted internal implementation state. In particular,
a successful report does not expose its computed disposal interval. Boundary
acceptance and rejection scenarios test observable consequences; exact successful
intervals and allocation witnesses remain explanatory calculations.

The fixtures specify future global correctness and allocation validation without
implementing either. Passing the suite while warning TODOs remain does not mean
these controls exist. See [ALLOCATION.md](ALLOCATION.md) for history-dependent
bounds, proportional allocations, chronological order, transfers and splits.

## Scenarios and expected results

Amounts below are USD at the last snapshot. Realized results are after separately
expensed fees. Exact report expectations, including earlier dates, are in each
directory's `expected.yaml`; position-level calculations are in `NOTES.md`.

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
