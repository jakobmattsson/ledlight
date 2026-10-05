# allocation-sale-price-derived-cost

Sale proceeds may be far above or below acquisition cost. Only recorded acquisitions determine the allocation bounds; no tax metadata or exemption participates.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-02-28

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 6 | 200 | 6000 | 5800 |

Purchase cost: 1000; sale proceeds: 4000; separately expensed fees: 0.

Booked realized gain: 3200; net realized gain after fees: 3200.

Arithmetic unrealized total: 5800; economic result from cash flows and market value: 9000; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.

### 2024-03-31

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 3 | 100 | 150 | 50 |

Purchase cost: 1000; sale proceeds: 4150; separately expensed fees: 0.

Booked realized gain: 3250; net realized gain after fees: 3250.

Arithmetic unrealized total: 50; economic result from cash flows and market value: 3300; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.

### 2024-04-30

Intended accounting assessment: **invalid**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 1000; sale proceeds: 5050; separately expensed fees: 0.

Booked realized gain: 4050; net realized gain after fees: 4050.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 4050; difference: 0.

The arithmetic can balance despite the recorded error. Closed-position residuals are diagnostic evidence and are not emitted as unrealized-gain rows.

## Disposal bounds

Bounds are inclusive total costs, conditional on the complete feasible history before each disposal. They are hand-derived explanations, not a required successful-report payload.

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| High-price sale | Assets:Broker | 4 | 800 | 400 | 400 | infeasible |

**High-price sale:** Every acquired unit cost 100. Proceeds of 4000 cannot justify removing 800; the only possible four-unit basis is 400.
