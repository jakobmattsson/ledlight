# Investment performance examples

Read the numbered `.case` files in order. Each starts with the journal's
arithmetic, then shows the `ledlight investment-performance` command, the
complete test-owned Ledger journal, and the expected text output. The case
runner discovers and executes these CLI examples recursively.

Each case reports from 2023-01-01 through 2024-01-01, exactly 365 days. The
text output shows return percentages. Purchases, deposits, price updates, and
the partial sale happen on different dates, so the money-weighted returns can
be calculated and compared with the time-weighted return. The partial sale
shows why the two measures can differ.

Cases 05 and 06 use the same journal and differ only in `--accounts`: case 06
selects the fund without the cash account, moving the contribution date to
the fund purchase and increasing the annualized money-weighted return.

The report's `Opening value` is the selected holdings' value before the report
period. It does not require an `Equity:Opening` journal posting. Cash entering
these example journals is balanced against salary or bonus income instead.
