# sold-with-positive-residual

Every transaction balances, but a closed position retains basis. A zero-quantity filter must not conceal this error; residual basis must not be presented as genuine unrealized gain.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-03-31

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 100 | 0 | -100 |

Purchase cost: 1000; sale proceeds: 1000; separately expensed fees: 0.

Booked realized gain: 100; net realized gain after fees: 100.

Arithmetic unrealized total: -100; economic result from cash flows and market value: 0; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.
