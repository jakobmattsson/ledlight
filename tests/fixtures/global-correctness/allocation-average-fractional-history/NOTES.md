# allocation-average-fractional-history

Whole-unit sales can represent fractional allocation across acquisitions. An integer-only original-lot matcher would wrongly reject the first sale; a subsequent purchase changes the average.

## Calculations

All monetary amounts below are USD. These calculations explain the command expectations; they are not additional report fields.

### 2024-02-28

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 5 | 10 | 20 | 10 |

Purchase cost: 12; sale proceeds: 4; separately expensed fees: 0.

Booked realized gain: 2; net realized gain after fees: 2.

Arithmetic unrealized total: 10; economic result from cash flows and market value: 12; difference: 0.

### 2024-04-30

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 3 | 9 | 30 | 21 |

Purchase cost: 20; sale proceeds: 34; separately expensed fees: 0.

Booked realized gain: 23; net realized gain after fees: 23.

Arithmetic unrealized total: 21; economic result from cash flows and market value: 44; difference: 0.

### 2024-05-31

Intended accounting assessment: **balanced**.

| Account | Commodity | Units | Remaining basis | Market value | Market value minus basis |
| --- | --- | ---: | ---: | ---: | ---: |
| Assets:Broker | FUND | 0 | 0 | 0 | 0 |

Purchase cost: 20; sale proceeds: 64; separately expensed fees: 0.

Booked realized gain: 44; net realized gain after fees: 44.

Arithmetic unrealized total: 0; economic result from cash flows and market value: 44; difference: 0.

## Disposal bounds

Bounds are inclusive total costs, conditional on the complete feasible history before each disposal. They are hand-derived explanations, not a required successful-report payload.

| Transaction | Account | Units | Recorded cost | Minimum | Maximum | Intended outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Average-cost first sale | Assets:Broker | 1 | 2 | 1 | 3 | feasible |
| Average-cost second sale | Assets:Broker | 3 | 9 | 4 | 14 | feasible |
| Final sale | Assets:Broker | 3 | 9 | 9 | 9 | feasible |

**Average-cost first sale:** Allocate half a unit from each price group. No individual purchased whole unit cost 2.

**Average-cost second sale:** After the first sale and new purchase, 2.5 units at 1, 2.5 at 3 and one at 8 remain. Minimum is 2.5*1+0.5*3=4; maximum is 8+2*3=14.

**Final sale:** All remaining proportional basis is consumed.

## Example feasible allocations

Proportional allocations explain the average-cost sequence without identifying individual whole shares.

| Acquisition | Available units | Unit cost |
| --- | ---: | ---: |
| Buy cheap units | 3 | 1 |
| Buy expensive units | 3 | 3 |
| Buy new units | 1 | 8 |

| Disposal | Buy cheap units | Buy expensive units | Buy new units |
| --- | ---: | ---: | ---: |
| Average-cost first sale | 0.5 | 0.5 | 0 |
| Average-cost second sale | 1.25 | 1.25 | 0.5 |
| Final sale | 1.25 | 1.25 | 0.5 |

Each allocation cell is the number of units drawn from that acquisition; fractional allocations represent pooled costs, not required identification of individual shares.
