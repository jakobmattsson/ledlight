# allocation-reverse-split-bounds

A reverse split preserves total basis and doubles unit costs. Later loss-making proceeds do not lower the basis that must be removed.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-03-31

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 4 | 24 | 32 | 8 |

Purchase cost: 40; sale proceeds: 48; separately expensed fees: 0.

Booked realized gain: 32; net realized gain after fees: 32.

Arithmetic unrealized total: 8; economic result from cash flows and market value: 40; difference: 0.

### 2024-04-30

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 40; sale proceeds: 56; separately expensed fees: 0.

Booked realized gain: 16; net realized gain after fees: 16.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 16; difference: 0.

## Disposal bounds

These inclusive bounds describe exact-cost allocations before allowing monetary rounding. They provide hand-derived witnesses and reference calculations. Validation also preserves nearby allocations allowed by the declared precision; see [the rounding contract](../ALLOCATION.md#rounding-contract).

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Sale at adjusted lower bound | Assets:Broker | 6 | 16 | 16 | 32 | feasible |
| Final sale at a loss | Assets:Broker | 4 | 24 | 24 | 24 | feasible |

**Sale at adjusted lower bound:** The reverse split leaves five units at 2 and five at 6. Six units cost between 5*2+6=16 and 5*6+2=32.

**Final sale at a loss:** Only four units at 6 remain. Their total basis 24 exceeds the proceeds 8, producing a valid loss of 16.
