# allocation-history-lower-violation

The second sale lies inside the original ten-unit range [10,30], but is impossible after the first sale. Full liquidation later still cannot repair the historical violation.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-02-28

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 19 | 48 | 76 | 28 |

Purchase cost: 60; sale proceeds: 44; separately expensed fees: 0.

Booked realized gain: 32; net realized gain after fees: 32.

Arithmetic unrealized total: 28; economic result from cash flows and market value: 60; difference: 0.

### 2024-03-31

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 9 | 28 | 36 | 8 |

Purchase cost: 60; sale proceeds: 84; separately expensed fees: 0.

Booked realized gain: 52; net realized gain after fees: 52.

Arithmetic unrealized total: 8; economic result from cash flows and market value: 60; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.

### 2024-04-30

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 60; sale proceeds: 120; separately expensed fees: 0.

Booked realized gain: 60; net realized gain after fees: 60.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 60; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.

## Disposal bounds

Bounds are inclusive total costs, conditional on the complete feasible history before each disposal. They are hand-derived explanations, not a required successful-report payload.

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| First sale | Assets:Broker | 11 | 12 | 12 | 32 | feasible |
| Impossible second sale | Assets:Broker | 10 | 20 | 21 | 30 | infeasible |

**First sale:** The first allocation is exactly an admissible endpoint.

**Impossible second sale:** Condition on the first sale: nine units at 2 and ten at 3 remain.
