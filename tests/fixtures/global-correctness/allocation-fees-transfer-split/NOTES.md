# allocation-fees-transfer-split

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

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 14 | 110 | 210 | 100 |
| Assets:OtherBroker | FUND | 6 | 55 | 90 | 35 |

Purchase cost: 330; sale proceeds: 300; separately expensed fees: 5.

Booked realized gain: 135; net realized gain after fees: 130.

Arithmetic unrealized total: 135; economic result from cash flows and market value: 265; difference: 0.

## Disposal bounds

Bounds are inclusive total costs, conditional on the complete feasible history before each disposal. They are hand-derived explanations, not a required successful-report payload.

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Destination sale | Assets:OtherBroker | 10 | 99 | 88 | 110 | feasible |
| Source sale | Assets:Broker | 10 | 66 | 55 | 99 | feasible |

**Destination sale:** The transfer basis 154 for eight units at 11 or 22 forces two cheap and six expensive original units. After the split the destination has four at 5.5 and twelve at 11. Ten cost at least 4*5.5+6*11=88, at most 110. The cheaper source units are not available here.

**Source sale:** After transfer and split the source has sixteen at 5.5 and eight at 11. Bounds are 10*5.5=55 and 8*11+2*5.5=99. Removing eight cheap and two expensive units costs 66.
