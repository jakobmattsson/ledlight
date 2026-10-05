# offsetting-closed-residuals

Two closed commodities have opposite residual bases in the same account. Account and portfolio totals cancel, but both closed positions must be diagnosed individually.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-03-31

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 100 | 0 | -100 |
| Assets:Broker | OTHER | 0 | -100 | 0 | 100 |

Purchase cost: 2000; sale proceeds: 2000; separately expensed fees: 0.

Booked realized gain: 0; net realized gain after fees: 0.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 0; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.
