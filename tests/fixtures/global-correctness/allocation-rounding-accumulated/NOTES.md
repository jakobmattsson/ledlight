# Rounding: accumulated

Three units cost exactly 1 USD, so each unit has exact acquisition cost 1/3 USD.
USD declares a 0.01 step; FUND deliberately declares whole-unit precision.
Each sale can book 0.33 or 0.34 USD. The costs here are 0.34, 0.34, 0.32.

The first two sales may each round upward. The last sale of 0.32 lies outside both adjacent rounded values, even though the total booked cost is exactly 1. The impossible-cost warning must survive liquidation.

After the first sale, two units have market value 2 and booked basis
1 minus the first booked cost. Unrealized gain is therefore 1 plus that cost.
Reports use the booked cost, not a reconstructed exact basis. After liquidation
the report is empty. Warnings cover the entire history even for earlier snapshots.
