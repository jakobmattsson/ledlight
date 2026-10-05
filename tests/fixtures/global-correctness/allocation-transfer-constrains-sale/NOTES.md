# allocation-transfer-constrains-sale

Capitalized fees travel with basis through an internal transfer and a split. Subsequent sale fees are expensed separately. Account-local feasibility must respect the transferred basis even when portfolio-wide cheap units remain.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-03-31

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 24 | 176 | 360 | 184 |
| Assets:OtherBroker | FUND | 16 | 154 | 240 | 86 |

Purchase cost: 330; sale proceeds: 0; separately expensed fees: 0.

Booked realized gain: 0; net realized gain after fees: 0.

Arithmetic unrealized total: 270; economic result from cash flows and market value: 270; difference: 0.

### 2024-04-30

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 14 | 110 | 210 | 100 |
| Assets:OtherBroker | FUND | 6 | 77 | 90 | 13 |

Purchase cost: 330; sale proceeds: 300; separately expensed fees: 5.

Booked realized gain: 157; net realized gain after fees: 152.

Arithmetic unrealized total: 113; economic result from cash flows and market value: 265; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.

## Disposal bounds

These exact-cost bounds include the declared cent-rounding policy. Excluded limits cannot themselves be attained. See [the rounding contract](../ALLOCATION.md#rounding-contract).

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Destination sale | Assets:OtherBroker | 10 | 77 | 87.99 (excluded) | 110 | infeasible |

**Destination sale:** Exact transferred basis 154 has two cheap and six expensive original units. With cent rounding the exact transfer cost T is in (153.99,154.01). After the split, the minimum for ten units is T - 66, giving the excluded lower limit 87.99. The upper limit is 110. Cost 77 cannot round from any feasible cost; cheaper units in the source account cannot be used.
