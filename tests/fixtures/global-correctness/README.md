# Global accounting correctness scenarios

These fixtures define Ledlight expectations independently of Ledger CLI output.
Each directory contains a standalone `journal.ledger` and a hand-calculated
`expected.json`. The journals use USD as their valuation commodity and declare
their accounts and commodities. They need no configured accounting instance.

This is a specification and regression-fixture change, not an implementation of
a new global reconciliation API. The integration runner is
`tests/integration/global-correctness.test.js`; run it with
`node --test tests/integration/global-correctness.test.js`, or run the complete
canonical verification with `npm test`.

## Accounting rules

- Reconcile units and carrying cost separately for each account and commodity.
- Acquisitions add basis; disposals remove the explicitly booked basis. The
  allocation method is outside the scope of this check, but the full sequence
  must admit at least one feasible allocation of the available acquisition costs.
  See [allocation feasibility](ALLOCATION.md) for quantity-aware bounds,
  chronological constraints, and additional scenarios.
- Transfers carry both units and basis between accounts. They do not create
  realized results, and they cancel when both accounts are in scope.
- Splits and reverse splits change units without changing total basis. These
  fixtures explicitly remove the old units and introduce the replacement units
  at the same total basis, so no external corporate-action metadata is needed.
- A closed position must have zero residual basis. Diagnose positive and
  negative residuals before account or portfolio aggregation, even when they
  cancel. An empty report alone is not an adequate outcome for an invalid
  closed position.
- For an open position, unrealized gain is market value minus carrying basis.
  A gain, a loss, and zero are all valid outcomes.
- Recorded realized gain, less separately expensed fees, plus unrealized gain
  must equal sale proceeds plus remaining market value minus purchase cost and
  separately expensed fees. Fees already included in basis or net proceeds must
  not be subtracted again.
- Missing basis or valuation data makes the relevant conclusion incomplete;
  unknown values are not zero. Basis can reconcile without a market price, but
  unrealized gain cannot be calculated in that case.

The total-result identity alone is not proof of correctness: an invalid closed
position can retain a residual basis that offsets an incorrect realized gain.
The closed-position rule is an additional requirement. Likewise, offsetting
errors must not disappear simply because their portfolio sum is zero. Even zero
residual basis at full liquidation does not erase an impossible earlier disposal.
Allocation feasibility is an additional requirement beyond these identities.

## Expected output format

`snapshots` specify inclusive report dates. Future transactions and quotes must
not affect an earlier snapshot. All amounts and quantities are exact decimal
strings; no machine floating-point tolerance is part of the contract.

- `status` is the proposed reconciliation outcome: `balanced`, `invalid`, or
  `incomplete`. These labels and the `issues[].kind` values are fixture vocabulary,
  not existing or finalized public API fields or diagnostic codes.
- `positions` retain zero-unit positions so their residual basis is reviewable.
  `costBasis` is the remaining booked basis. `marketValue` is quantity times the
  snapshot market price. `unrealizedGain` is their arithmetic difference. For an
  invalid closed position this difference is diagnostic arithmetic, not a valid
  unrealized result to publish. `null` means unknown, never zero.
- `flows.purchaseCost` includes capitalized purchase fees;
  `flows.saleProceeds` follows gross or net proceeds as explicitly booked;
  `flows.expensedFees` contains only separately booked fees.
- `bookedRealizedGain` reverses the sign of the income account balance;
  `netRealizedGain` additionally deducts separately expensed fees.
- `economicGain` comes from cash flows and remaining market value.
  `resultDifference` is net realized plus unrealized gain minus economic gain;
  a nonzero difference is an error. Zero alone does not establish correctness.
- `unrealizedGains.rows` is exact expected output from the existing
  `unrealizedGains` query (the JSON rows of `unrealized-gains`). Zero results are
  omitted, and multiple commodities aggregate by account only after validation.
- `unrealizedGains.errorIncludes` specifies an expected existing query error.
  `unrealizedGains.pending` describes a required diagnostic for a known behavior
  gap. Its delivery as a warning or error is intentionally not decided here.
- `accountReports` specifies additional exact output with account filters.
  Reconciliation totals still describe the combined portfolio; a filtered
  report does not assert that the selected account was the entire portfolio.
- `currentIngestionWarningCodes` records current ingestion behavior, separately
  from desired reconciliation outcomes. For example,
  the incorrect realized result is already an unbalanced transaction, while
  the closed residual examples balance transaction by transaction. Transfers
  and splits currently trigger `INVALID_COMMODITY_TRADE` because the validator
  treats negative commodity postings without sale prices as invalid trades.
  Their warnings are recorded as a known limitation, with TODO tests requiring
  recognition of valid non-sale adjustments; adding fictitious sale prices to
  these fixtures would hide the limitation.
- `costBasisChecks` specifies proposed per-disposal feasibility outcomes and
  exact minimum and maximum **total** disposal costs, conditional on all earlier
  entries. Its transaction descriptions identify unique postings in the journal.
  Each check explains the hand-derived bounds. See [ALLOCATION.md](ALLOCATION.md)
  for the complete meaning of the contract.
- `allocationWitnesses`, when present, gives concrete fractional allocations
  that explain a valid sequence. The runner checks their amounts, acquisition
  capacities, and ordering. These prove existence, not the optimality of bounds;
  the test runner does not implement a feasibility or optimization solver.

The runner verifies ingestion, booked quantities, cash flows, income, fees,
fixture arithmetic, and supported report output. Future global diagnostics and
known report gaps appear as explicit TODO tests. Both acceptance and rejection
by the future allocation validator also appear as named TODOs. Passing this
suite therefore does not mean the new global reconciliation rules have been
implemented.

## Scenarios and expected results

Amounts below are USD at the last snapshot. Realized results are after separately
expensed fees. The complete position-level and earlier-date expectations are in
each directory's `expected.json`.

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

These are complete-history, long-position examples with no opening holdings,
external asset transfers, or foreign-currency basis. All internal transfers have
both accounts present. Amounts can therefore be checked directly against bank
and income balances without inventing an opening value or classifying arbitrary
real-world account names. They do not claim to cover every corporate action,
short positions, foreign-exchange policy, or an external transfer with unknown
history. Such cases need additional explicit fixtures and accounting rules.

No fixture asks Ledlight to enforce FIFO, LIFO, average cost, tax treatment, or
transaction-level lot matching. The method names describe how the example's
author chose the disposal basis; Ledlight receives the resulting postings.

Tax rules and tax reporting are outside Ledlight's scope. A deduction in an
external tax calculation cannot change the historical basis removed from a
position. No tax tags, tax methods, exemption flags, or alternative tax-derived
lot costs participate in these scenarios or in their intended validation.
