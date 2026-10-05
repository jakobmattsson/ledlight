# Allocation feasibility contract

The intended question is: does at least one allocation of acquired quantities
and costs explain every disposal, in order, with all relevant movements and
adjustments accounted for? The validator must neither select a particular lot
method nor require that sold whole shares identify particular original shares.

These scenarios exercise the shared ingestion validator. `expected.yaml`
specifies actual `unrealized-gains` commands with exact rows, warnings, errors,
and exit codes; every assertion is active. Warnings always cover the complete
journal, even when the report selects an earlier snapshot. Hand-derived bounds
and witness allocations remain in each scenario's `NOTES.md`.

## Bounds and history

1. Bounds concern the **total acquisition cost removed for the stated quantity**,
   not the sale proceeds and not an unweighted minimum or maximum unit price.
2. Endpoints are inclusive. With ten units each at 1, 2, and 3 USD, eleven units
   have a minimum total cost of 12 and a maximum of 32. A cost of 11.99 or 32.01
   is impossible even though each lies between eleven times the unit extrema.
3. Compute each interval over every allocation compatible with the actual
   earlier disposals. Do not consume an arbitrary witness and discard other
   possible histories. Different endpoints may have different witnesses.
4. A lower-bound disposal of eleven units for 12 leaves nine at 2 and ten at 3.
   The next ten-unit interval is [21,30]. An upper-bound disposal for 32 leaves
   ten at 1 and nine at 2, giving [10,19]. A subsequent cost of 20 is impossible
   in both cases although it was possible before the first disposal.
5. Fractional allocation across acquisition groups is allowed even for sales of
   whole units. This accommodates average cost. The fixture contract is a
   continuous feasibility model, not an integer assignment of individual shares.
6. Only acquisitions already present at the time of disposal are available.
   The same-day fixture specifically requires journal sequence order for entries
   sharing a date. A future reporting date does not relax historical constraints.
   These fixtures use transaction dates without effective-date overrides.
7. Preserve a discovered historical violation after later transactions. A later
   acquisition or compensating disposal cannot repair it. Once the feasible set
   is empty, do not invent numeric bounds for later sales; these fixtures retain
   the first offending event in subsequent snapshot diagnostics instead.
8. The history is valid only if all its steps have one jointly feasible
   explanation. Transaction balancing, the realized-plus-unrealized identity,
   and zero closing basis are necessary but insufficient.

The disposal-bound tables in each scenario's `NOTES.md` identify transactions,
accounts, quantities, recorded total costs, inclusive bounds and intended
outcomes. The interval is conditional on the complete feasible prefix, not on a
chosen witness. These tables are explanatory rather than CLI output fields.

Invalid histories still produce booked unrealized-gain rows when calculable,
with `IMPOSSIBLE_COST_BASIS` warnings identifying the offending transaction,
account, commodity, sold quantity, recorded cost and allowed total-cost range.
An empty report after liquidation must retain the historical warning. Valid
histories require exact result rows and `warnings: []`. The validator uses exact
rational constraints to preserve all feasible histories. Successful reports
need not expose their internal intervals or a chosen allocation.

## Scenarios

The first eight scenarios start with ten units at each of 1, 2, and 3 USD.
Each purchase's total cost is therefore 10, 20, or 30 USD, respectively.

| Scenario | Disposal costs and expected constraints | Intended outcome |
| --- | --- | --- |
| `allocation-lower-bound` | Sell 11 for basis 12 in [12,32], then 10 for 21 in [21,30], then 9 for exactly 27 | Accept all steps, ending with zero units and basis |
| `allocation-upper-bound` | Sell 11 for 32 in [12,32], then 10 for 19 in [10,19], then 9 for exactly 9 | Accept all steps, ending with zero units and basis |
| `allocation-below-minimum` | First 11 assigned 11.99 instead of at least 12 | Reject; retain the error after the remaining 48.01 is booked out |
| `allocation-above-maximum` | First 11 assigned 32.01 instead of at most 32 | Reject; retain the error after the remaining 27.99 is booked out |
| `allocation-history-lower-violation` | First 11 assigned 12; next 10 assigned 20 instead of at least 21 | Reject despite balanced transactions and eventual zero residual |
| `allocation-history-upper-violation` | First 11 assigned 32; next 10 assigned 20 instead of at most 19 | Reject despite balanced transactions and eventual zero residual |
| `allocation-ambiguous-cheap-next` | First 10 assigned 20; next 10 assigned 10; last 10 assigned 30 | Accept; do not freeze a prefix allocation that consumed cheap units |
| `allocation-ambiguous-expensive-next` | Identical prefix; next 10 assigned 30; last 10 assigned 10 | Accept; do not freeze a prefix allocation that consumed expensive units |
| `allocation-average-fractional-history` | One unit assigned 2 from original groups at 1 and 3; a later purchase at 8 changes the average; next three assigned 9 in [4,14] | Accept proportional allocations and the later purchase |
| `allocation-future-purchase` | Five assigned 10 while only units costing 1 exist; more expensive units arrive later | Reject at the first sale and still reject after full liquidation |
| `allocation-same-day-order` | Same violation, with the expensive purchase later on the same date | Reject; grouping a day's transactions must not allow borrowing from a later entry |
| `allocation-sale-prices-independent` | All units acquired at 100; sales occur at 1000, 50, and 300 per unit | Accept basis 100 per unit, including the loss-making sale |
| `allocation-sale-price-derived-cost` | Identical acquisitions and proceeds, but four units assigned basis 800 instead of exactly 400 | Reject despite positive remaining basis and eventual zero residual; no exemption |
| `allocation-fees-transfer-split` | Capitalized costs, a constrained transfer, split in both accounts, then destination disposal of 10 for 99 in [88,110] and source disposal of 10 for 66 in [55,99] | Accept; sale fees affect net result once |
| `allocation-transfer-constrains-sale` | Same transfer and split, but destination disposal of 10 assigned 77 below 88 | Reject even though enough cheap units exist elsewhere in the portfolio |
| `allocation-reverse-split-bounds` | After a reverse split, sell 6 for 16 in [16,32], then the last 4 for exactly 24 | Accept adjusted unit costs; final proceeds below basis are valid |

## Ambiguous and average-cost witnesses

The two ambiguous-history fixtures share acquisitions and the first disposal.
That disposal's cost of 20 could consume all ten middle-cost units, or five
cheap plus five expensive units. Only the first explanation permits either of
the paired extreme second disposals. Rejecting either fixture after greedily
choosing the other explanation would impose an unintended allocation method.

The average-cost fixture starts with three units at 1 and three at 3. Removing
one at average cost 2 can be represented by 0.5 from each group. After acquiring
one more at 8, the remaining six units cost 18 in total. Selling three at average
cost 3 can be represented by 1.25 cheap, 1.25 expensive, and 0.5 newly acquired
units. The final three consume the same proportions. All original capacities
are respected exactly. The scenario's notes record these fractions as a
human-readable explanation; the runner asserts the resulting CLI behavior
without searching for or prescribing an allocation.

## Transfer, split, and fee calculation

The combined fixture purchases ten units for 110 including a purchase fee and
ten for 220 including another purchase fee. Their unit costs are 11 and 22.
Transferring eight units with total basis 154 forces two cheap and six expensive
units: `2 * 11 + 6 * 22 = 154`.

A two-for-one split is recorded in **both** depots, preserving their respective
total bases. The destination now has four units at 5.5 and twelve at 11, while
the source has sixteen at 5.5 and eight at 11. Thus a ten-unit destination sale
has bounds [88,110]; a ten-unit source sale has bounds [55,99]. A destination
cost of 77 would require six cheap units, but that depot can only have four.
Using the source's cheaper units to justify it would ignore the recorded transfer.

The valid destination sale removes 99 of basis (two cheap and eight expensive
units); the source sale removes 66 (eight cheap and two expensive units). Gross
proceeds are 150 for each sale, with separate fees of 3 and 2. Afterward:

- Source: 14 units, basis 110, market value 210, unrealized gain 100.
- Destination: 6 units, basis 55, market value 90, unrealized gain 35.
- Net realized gain: `(150 - 99) + (150 - 66) - 5 = 130`.
- Total result: `130 + 135 = 265`, also `300 + 300 - 330 - 5 = 265`.

In the invalid variant, replacing 99 with 77 leaves more booked basis and less
unrealized gain, offset by more booked realized gain. The portfolio total still
equals 265. That equality must not conceal the infeasible destination disposal.

## Scope boundary

These cases concern historical acquisition cost and explicitly recorded changes
to units and basis. Sale proceeds and market quotes do not establish disposal
cost bounds. Tax calculations are outside Ledlight: no tax tag, inferred tax
method, tax-derived replacement cost, or bypass parameter is needed or specified.

Unknown acquisition history cannot be replaced with zero or an invented price;
the existing `transfer-without-basis` fixture already specifies an incomplete
result. These cases do not define new valuation adjustments, short-sale rules,
cross-currency basis policies, or how to pool otherwise unrelated depots. The
transfer fixtures explicitly carry basis from one depot to the other.
