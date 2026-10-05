# allocation-above-maximum

One cent beyond an attainable endpoint is invalid even though the book balances and the later complete sale leaves zero units and basis. A later sale cannot erase an earlier error.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-02-28

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 19 | 27.99 | 76 | 48.01 |

Purchase cost: 60; sale proceeds: 44; separately expensed fees: 0.

Booked realized gain: 11.99; net realized gain after fees: 11.99.

Arithmetic unrealized total: 48.01; economic result from cash flows and market value: 60; difference: 0.

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

These inclusive bounds describe exact-cost allocations before allowing monetary rounding. They provide hand-derived witnesses and reference calculations. Validation also preserves nearby allocations allowed by the declared precision; see [the rounding contract](../ALLOCATION.md#rounding-contract).

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Impossible first sale | Assets:Broker | 11 | 32.01 | 12 | 32 | infeasible |

**Impossible first sale:** Available costs are ten units each at 1, 2 and 3. The exact interval is [12,32], not [11,33].
