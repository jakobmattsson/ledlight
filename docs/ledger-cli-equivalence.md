# Ledger CLI equivalence

Ledlight intentionally has a different CLI shape from Ledger. This matrix
records the command pairs whose results are expected to be equivalent. It also
makes the missing equivalents visible instead of relying on each command's
`--ledger` option for discovery.

| Ledlight command | Exact Ledger equivalent | Runnable case |
| --- | --- | --- |
| `accounts --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL accounts` | `accounts` |
| `tags --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL tags` | `tags` |
| `commodities --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL commodities` | `commodities` |
| `prices --file JOURNAL` | `ledger --args-only --no-pager --file JOURNAL prices` | `prices` |
| `transactions --file JOURNAL` (`print` alias) | `ledger --args-only --no-pager --file JOURNAL print` | `transactions` |
| `balance` | No exact equivalent | — |
| `unrealized-gains` | No exact equivalent | — |
| `balance-history` | No exact equivalent | — |
| `investment-performance` | No exact equivalent | — |
| `account-postings` | No exact equivalent | — |
| `account-transactions` | No exact equivalent | — |
| `reconciliation-entries` | No exact equivalent | — |

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
npm run compare:ledger -- --file main.ledger --case accounts --case prices
npm run compare:ledger -- --file main.ledger --ledger-bin /path/to/ledger
npm run compare:ledger -- --list
```

The script exits with status 1 if a command fails or a result differs. Every
comparison is byte-for-byte exact. `LEDGER_BIN` remains available as an
alternative to `--ledger-bin`. The integration suite separately tests semantic
balance and unrealized-gain compatibility using normalized result rows; those
are deliberately not presented as exact CLI equivalents here.

The executable matrix lives in
`scripts/ledger-compatibility-matrix.js`. Add a row there when another
equivalence becomes runnable, and update this overview at the same time.
