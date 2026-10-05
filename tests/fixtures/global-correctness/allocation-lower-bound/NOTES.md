# allocation-lower-bound

The quantity-aware endpoints are inclusive. Later bounds tighten and a complete disposal consumes exactly 60 USD.

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

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 9 | 27 | 36 | 9 |

Purchase cost: 60; sale proceeds: 84; separately expensed fees: 0.

Booked realized gain: 51; net realized gain after fees: 51.

Arithmetic unrealized total: 9; economic result from cash flows and market value: 60; difference: 0.

### 2024-04-30

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 60; sale proceeds: 120; separately expensed fees: 0.

Booked realized gain: 60; net realized gain after fees: 60.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 60; difference: 0.

## Disposal bounds

Bounds are inclusive total costs, conditional on the complete feasible history before each disposal. They are hand-derived explanations, not a required successful-report payload.

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| First sale | Assets:Broker | 11 | 12 | 12 | 32 | feasible |
| Second sale | Assets:Broker | 10 | 21 | 21 | 30 | feasible |
| Final sale | Assets:Broker | 9 | 27 | 27 | 27 | feasible |

**First sale:** Eleven units require at least 10*1+1*2=12 and at most 10*3+1*2=32; the per-unit extrema alone are insufficient.

**Second sale:** The first sale consumes 10 units at 1 and one at 2. Nine at 2 and ten at 3 remain; ten units cost at least 9*2+1*3=21 and at most 10*3=30.

**Final sale:** All remaining units are sold, so all remaining basis must be consumed.
