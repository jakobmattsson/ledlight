# allocation-upper-bound

The quantity-aware endpoints are inclusive. Later bounds tighten and a complete disposal consumes exactly 60 USD.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-02-28

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 19 | 28 | 76 | 48 |

Purchase cost: 60; sale proceeds: 44; separately expensed fees: 0.

Booked realized gain: 12; net realized gain after fees: 12.

Arithmetic unrealized total: 48; economic result from cash flows and market value: 60; difference: 0.

### 2024-03-31

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 9 | 9 | 36 | 27 |

Purchase cost: 60; sale proceeds: 84; separately expensed fees: 0.

Booked realized gain: 33; net realized gain after fees: 33.

Arithmetic unrealized total: 27; economic result from cash flows and market value: 60; difference: 0.

### 2024-04-30

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 60; sale proceeds: 120; separately expensed fees: 0.

Booked realized gain: 60; net realized gain after fees: 60.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 60; difference: 0.

## Disposal bounds

These inclusive bounds describe exact-cost allocations before allowing monetary rounding. They provide hand-derived witnesses and reference calculations. Validation also preserves nearby allocations allowed by the declared precision; see [the rounding contract](../ALLOCATION.md#rounding-contract).

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| First sale | Assets:Broker | 11 | 32 | 12 | 32 | feasible |
| Second sale | Assets:Broker | 10 | 19 | 10 | 19 | feasible |
| Final sale | Assets:Broker | 9 | 9 | 9 | 9 | feasible |

**First sale:** Eleven units require at least 10*1+1*2=12 and at most 10*3+1*2=32; the per-unit extrema alone are insufficient.

**Second sale:** The first sale consumes 10 units at 3 and one at 2. Ten at 1 and nine at 2 remain; ten units cost at least 10 and at most 9*2+1=19.

**Final sale:** All remaining units are sold, so all remaining basis must be consumed.
