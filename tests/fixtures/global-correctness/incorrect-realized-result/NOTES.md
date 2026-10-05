# incorrect-realized-result

The remaining basis is 600 USD and unrealized gain is zero, but booked realized gain is 100 USD too low. The independent cash flows imply a 300 USD total result.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-03-31

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 6 | 600 | 600 | 0 |

Purchase cost: 1000; sale proceeds: 700; separately expensed fees: 0.

Booked realized gain: 200; net realized gain after fees: 200.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 300; difference: -100.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.
