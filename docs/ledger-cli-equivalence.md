# Ledger CLI equivalence

Ledlight intentionally has a different CLI shape from Ledger. This matrix
records the command pairs whose results are expected to be equivalent. It also
makes the missing equivalents visible.

| Ledlight command | Exact Ledger equivalent | Runnable case |
| --- | --- | --- |
| `accounts --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL accounts` | `accounts` |
| `tags --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL tags` | `tags` |
| `commodities --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL commodities` | `commodities` |
| `prices --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL prices --sort date,account` | `prices` |
| `transactions --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL print` | `transactions` |
| `aggregate --denominate --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL balance --no-total --exchange SEK --flat` | `balance` |
| `aggregate --denominate --include-total --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL balance --exchange SEK --flat` | `balance-with-total` |
| `aggregate --denominate --invert --file JOURNAL` | `ledger --args-only --no-pager --date-format %Y-%m-%d --file JOURNAL balance --no-total --exchange SEK --flat --invert` | `balance-inverted` |
| `unrealized-gains` | No exact equivalent | — |
| `balance-history` | No exact equivalent | — |
| `investment-performance` | No exact equivalent | — |

The runnable matrix covers the unfiltered forms shown above. Additional
options are equivalent only where separately documented or tested. In
particular, `accounts` filters and `transactions --accounts` map to Ledger
query arguments, while Ledlight-only output formats, pagination, declaration
selection, and details do not have direct equivalents.

The balance cases use SEK as Ledger's exchange commodity and therefore require
SEK as the journal's default commodity. Valued account reports use Ledger's
20-character amount column and an unlabeled total, with zero rendered as `0`.
Ledlight always honors an explicit `--include-total`; Ledger may suppress its
total when only one account is displayed.

The shared Ledger baseline uses ISO dates (`--date-format %Y-%m-%d`) for all
commands. Prices sort by ascending date, then base commodity. Ledger's
`account` sort key represents the base commodity in its prices report;
`--sort date,account` makes the output deterministic even for same-day prices.

## Compare an arbitrary journal

Run every verified row against a journal:

```console
ledlight-cmp --file /path/to/main.ledger
```

Run one or more rows, select another Ledger executable, or print the runnable
matrix as a Markdown table:

```console
ledlight-cmp --file main.ledger --case accounts --case prices
ledlight-cmp --file main.ledger --ledger-bin /path/to/ledger
ledlight-cmp --list
```

The script exits with status 1 if a command fails or a result differs. Every
comparison is byte-for-byte exact; mismatches print a unified diff with three
lines of context. Each command may produce up to 256 MiB of output.
`LEDGER_BIN` remains available as an alternative to `--ledger-bin`. The
integration suite also tests semantic balance and unrealized-gain compatibility
using normalized result rows for additional currencies and report options.

The executable matrix lives in
`scripts/ledger-compatibility/ledger-compatibility-matrix.yaml`. Its `baseline`
values contain the arguments shared by every command, while each entry under
`commands` contains only the command-specific parts. Add a command there when
another equivalence becomes runnable, and update this overview at the same time.
