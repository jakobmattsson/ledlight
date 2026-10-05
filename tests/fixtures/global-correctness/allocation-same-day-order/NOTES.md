# allocation-same-day-order

A later purchase must not retroactively justify an impossible earlier disposal, even if the final inventory and result balance. Same-day entries retain journal order.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-04-30

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 40; sale proceeds: 80; separately expensed fees: 0.

Booked realized gain: 40; net realized gain after fees: 40.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 40; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.

## Disposal bounds

These inclusive bounds describe exact-cost allocations before allowing monetary rounding. They provide hand-derived witnesses and reference calculations. Validation also preserves nearby allocations allowed by the declared precision; see [the rounding contract](../ALLOCATION.md#rounding-contract).

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Sale before expensive purchase | Assets:Broker | 5 | 10 | 5 | 5 | infeasible |

**Sale before expensive purchase:** At this exact point in journal order only ten units at 1 have been acquired. The later units at 3 are unavailable, regardless of the report date.
