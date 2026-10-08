# Investment performance examples

Read the numbered `.case` files in order. Each starts with the journal's
arithmetic, then shows the public `investmentPerformance` API call, the complete
test-owned Ledger journal, and the report's text output. The case runner calls
the API and formats its result with the same text formatter as the CLI. It
discovers these files recursively.

The cases use one-day reporting intervals to keep the arithmetic short. The
text output shows return percentages and `n/a` for returns that cannot be
calculated. The underlying money-weighted API fields are `null` because cash
flows on one date provide no elapsed time for an annualized return. For a
full-year example of the money-weighted returns, see
[`../performance-cli-returns.case`](../performance-cli-returns.case).
