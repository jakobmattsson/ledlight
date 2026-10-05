# Rounding: residual

Three units cost exactly 1 USD, so each unit has exact acquisition cost 1/3 USD.
USD declares a 0.01 step; FUND deliberately declares whole-unit precision.
Each sale can book 0.33 or 0.34 USD. The costs here are 0.34, 0.34, 0.34.

All three sales are locally valid roundings, but their total is 1.02, leaving a booked residual of -0.02. The residual warning must survive liquidation.

After the first sale, two units have market value 2 and booked basis
1 minus the first booked cost. Unrealized gain is therefore 1 plus that cost.
Reports use the booked cost, not a reconstructed exact basis. After liquidation
the report is empty. Warnings cover the entire history even for earlier snapshots.
