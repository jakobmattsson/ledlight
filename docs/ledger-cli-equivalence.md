# Ledger CLI equivalence

Ledlight intentionally has a different CLI shape from Ledger. This matrix
records the command pairs whose results are expected to be equivalent. It also
makes the missing equivalents visible instead of relying on each command's
`--ledger` option for discovery.

| Ledlight command | Ledger command | Comparison | Runnable case |
| --- | --- | --- | --- |
| `accounts --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL accounts` | Exact text | `accounts` |
| `tags --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL tags` | Exact text | `tags` |
| `commodities --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL commodities` | Exact text | `commodities` |
| `prices --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL prices` | Exact text | `prices` |
| `transactions --file JOURNAL` (`print` alias) | `ledger --args-only --no-pager --file JOURNAL print` | Exact text | `transactions` |
| `balance --format csv --file JOURNAL` | `ledger ... balance --flat --no-total --format FORMAT` | Account, commodity, and exact decimal amount rows | `balance` |
| `unrealized-gains --format csv --file JOURNAL` | `ledger ... --gain balance --flat --no-total --format FORMAT` | Account, commodity, and exact decimal amount rows | `unrealized-gains` |
| `balance-history` | No verified equivalent | — | — |
| `investment-performance` | No verified equivalent | — | — |
| `account-postings` | No verified equivalent | — | — |
| `account-transactions` | No verified equivalent | — | — |
| `reconciliation-entries` | No verified equivalent | — | — |

The runnable matrix covers each command's default, unfiltered form. Additional
options are equivalent only where separately documented or tested. In
particular, `accounts` filters and `transactions --accounts` map to Ledger
query arguments, while Ledlight-only output formats, pagination, declaration
selection, and details do not have direct equivalents.

## Compare an arbitrary journal

Run every verified row against a journal:

```console
npm run compare:ledger -- --file /path/to/main.ledger
```

Run one or more rows, select another Ledger executable, or print the
machine-readable script's complete matrix as a Markdown table:

```console
npm run compare:ledger -- --file main.ledger --case balance --case prices
npm run compare:ledger -- --file main.ledger --ledger-bin /path/to/ledger
npm run compare:ledger -- --list
```

The script exits with status 1 if a command fails or a result differs. Exact
text comparisons are byte-for-byte. Balance comparisons normalize CSV/tabular
output into sorted `(account, amount, commodity)` rows and normalize decimal
spelling, but do not round values. `LEDGER_BIN` remains available as an
alternative to `--ledger-bin`.

The executable matrix lives in
`scripts/ledger-compatibility-matrix.js`. Add a row there when another
equivalence becomes runnable, and update this overview at the same time.
