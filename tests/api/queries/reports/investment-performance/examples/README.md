# Investment performance examples

Read the numbered `.case` files in order. Each starts with the journal's
arithmetic, then shows the public `investmentPerformance` API call, the complete
test-owned Ledger journal, and the exact API result. The API case runner discovers
these files recursively.

The cases use one-day reporting intervals to keep the result to a single daily
point. `timeWeightedReturn` is a decimal fraction, so `0.2` means 20%. The
money-weighted fields are `null` because a one-day interval cannot establish an
annualized return from cash flows on the same date. For a full-year example of
the money-weighted fields, see
[`../performance-cli-returns.case`](../performance-cli-returns.case).
