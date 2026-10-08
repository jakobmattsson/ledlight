# Investment performance examples

Read the numbered `.case` files in order. Each starts with the journal's
arithmetic, then shows the public `investmentPerformance` API call, the complete
test-owned Ledger journal, and the report's text output. The case runner calls
the API and formats its result with the same text formatter as the CLI. It
discovers these files recursively.

Each case reports from 2023-01-01 through 2024-01-01, exactly 365 days. The
text output shows return percentages. Purchases, deposits, price updates, and
the partial sale happen on different dates, so the money-weighted returns can
be calculated and compared with the time-weighted return. The partial sale
shows why the two measures can differ.
