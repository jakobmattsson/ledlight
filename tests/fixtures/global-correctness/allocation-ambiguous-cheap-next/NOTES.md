# allocation-ambiguous-cheap-next

Keep all feasible interpretations of the prefix. The paired fixtures share the same first sale but require opposite remaining extremes.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-02-28

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 20 | 40 | 80 | 40 |

Purchase cost: 60; sale proceeds: 40; separately expensed fees: 0.

Booked realized gain: 20; net realized gain after fees: 20.

Arithmetic unrealized total: 40; economic result from cash flows and market value: 60; difference: 0.

### 2024-03-31

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 10 | 30 | 40 | 10 |

Purchase cost: 60; sale proceeds: 80; separately expensed fees: 0.

Booked realized gain: 50; net realized gain after fees: 50.

Arithmetic unrealized total: 10; economic result from cash flows and market value: 60; difference: 0.

### 2024-04-30

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 60; sale proceeds: 120; separately expensed fees: 0.

Booked realized gain: 60; net realized gain after fees: 60.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 60; difference: 0.

## Disposal bounds

Bounds are inclusive total costs, conditional on the complete feasible history before each disposal. They are hand-derived explanations, not a required successful-report payload.

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Ambiguous first sale | Assets:Broker | 10 | 20 | 10 | 30 | feasible |
| Second sale | Assets:Broker | 10 | 10 | 10 | 30 | feasible |
| Final sale | Assets:Broker | 10 | 30 | 30 | 30 | feasible |

**Ambiguous first sale:** Either ten middle units or five cheap and five expensive units can explain this basis.

**Second sale:** Both extremes are still feasible over the set of histories consistent with the prefix; do not retain only one guessed inventory.

**Final sale:** Consume exactly the remainder implied by both prior sales.

## Example feasible allocations

One feasible explanation consumes all middle-cost units first. Another explanation of that prefix alone is five cheap plus five expensive units; committing to that alternative would wrongly reject this continuation.

| Acquisition | Available units | Unit cost |
| --- | ---: | ---: |
| Buy cheap units | 10 | 1 |
| Buy middle units | 10 | 2 |
| Buy expensive units | 10 | 3 |

| Disposal | Buy cheap units | Buy middle units | Buy expensive units |
| --- | ---: | ---: | ---: |
| Ambiguous first sale | 0 | 10 | 0 |
| Second sale | 10 | 0 | 0 |
| Final sale | 0 | 0 | 10 |

Each allocation cell is the number of units drawn from that acquisition; fractional allocations represent pooled costs, not required identification of individual shares.
