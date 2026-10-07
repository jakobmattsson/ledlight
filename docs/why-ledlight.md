# Why Ledlight?

Ledlight is a plain-text accounting tool for personal finances, including
investments. It combines double-entry bookkeeping with quantities, acquisition
costs, dated market values, and reports over that data. Those are the reasons
to use it instead of a general-purpose bookkeeping program:

- **Track what is owned.** A posting can hold a quantity of a fund, share,
  currency, or other commodity. Reports can show the units themselves, as well
  as their value in the journal's default currency.
- **Keep cost and value separate.** Acquisition cost, sale price, and dated
  market price are distinct. Holdings can be reported at cost or market value,
  and unrealized gains can be calculated from the difference.
- **Put dates where they belong.** A transaction can have one date while an
  individual posting has another. A trade and its later settlement can stay in
  one transaction, with reports based on posting dates or transaction dates.
- **Check the investment history.** Ledlight checks whether recorded sales
  could have used the acquisition costs available at the time. It also flags
  residual costs, negative dated holdings, and several trade and balance
  inconsistencies.
- **Measure portfolio performance.** Daily value history, unrealized gains,
  and investment performance reports go beyond an account balance. Performance
  distinguishes contributions from internal trades and transfers when the
  journal supplies the needed annotations.
- **Use a flexible chart of accounts.** Hierarchical account names can cover
  bank accounts, investments, debts, and other parts of personal finances
  without a prescribed company chart of accounts. Tags and comments add
  context.
- **Own and reuse the data.** The journal is plain text: it can be reviewed,
  diffed, backed up, and split across files. The CLI, CSV/JSON output, and
  Node.js API support further queries and custom tools. SQLite is a
  rebuildable cache, not a second source of truth.

Ledlight handles the journal and its reports. It does not issue invoices,
import bank transactions, attach receipts, file taxes, or provide a graphical
bookkeeping workflow. It supports a deliberate subset of Ledger syntax; it is
not a complete Ledger replacement either.

For exact syntax, report rules, and limitations, see the
[technical guide](ledlight.md), [API reference](api.md), and
[acquisition-cost allocation guide](allocation-feasibility.md).
