# Acquisition-cost allocation

Ledlight checks whether the recorded acquisition costs can explain each sale in
journal order. It accepts any jointly feasible allocation of units and basis;
it does not choose a tax-lot method such as FIFO, LIFO, or average cost. A sale
of whole units may draw fractional quantities from multiple acquisition groups.

## Historical feasibility

The cost removed by a disposal must fit the units and basis available at that
point in the journal. Bounds concern **removed acquisition cost**, not sale
proceeds or a market quote. Earlier disposals narrow the possibilities for
later ones. Ledlight retains all feasible histories through each step instead
of committing to one allocation. A future purchase, including one later on the
same date, cannot supply basis to an earlier disposal.

For example, ten units each acquired at 1, 2, and 3 USD give an eleven-unit
sale an initial total-cost range of 12 to 32 USD. Booking 11.99 or 32.01 USD
falls outside that range. A later sale that closes the position does not erase
the historical violation. Transaction balance, a correct portfolio result, and
zero final basis do not by themselves prove every disposal was feasible.

Transfers carry basis with units and constrain the source and destination
accounts separately. Splits change unit count while preserving total basis.
Sale prices do not change the available acquisition basis. Fees affect results
according to how the journal records them: as expenses, capitalized basis, or
net proceeds.

## Monetary precision

The cost currency's declared `format` determines the monetary step used for
allocation checks. The security's quantity precision and the number of digits
typed in a posting do not determine that step. For a booked multiple `B` of
step `u`, an exact allocated cost `C` is accepted when `B - u < C < B + u`.
The bounds are open: an entire-step difference is invalid. A booked value with
finer precision requires exact equality; without a format declaration,
allocation costs also require exact equality.

Individual rounded sales must remain jointly feasible. Three units acquired
for 1 USD may be sold with booked costs of 0.34, 0.33, and 0.33 USD in any
order. Booking 0.34, 0.34, and 0.32 USD makes the last sale invalid even though
the booked costs sum to 1 USD. Booking 0.34 USD three times leaves a residual
basis of -0.02 USD; locally plausible rounding does not make the closed
position valid.

## Diagnostics and report results

An impossible disposal produces an `IMPOSSIBLE_COST_BASIS` warning identifying
the first offending event and its allowed cost range. A closed position with
nonzero basis produces `RESIDUAL_COST_BASIS`. These are ingestion diagnostics
for the full journal, so they remain visible in reports for later or earlier
snapshot dates. When booked unrealized gain is still calculable, the report
returns it alongside the warning. Missing basis or a required market price
cannot be replaced with zero and may prevent a numerical result.

These rules cover historical long positions and recorded transfers and splits.
They do not infer tax treatment, short-sale behavior, exchange rates for
foreign-currency basis, or unrecorded opening holdings.
