'use strict';
import type { SqliteDatabase } from './sqlite-contracts';

type Numeric = ReturnType<typeof import('../../numeric')>;
type Dependencies = { numeric: Pick<Numeric, 'decimal'> };
type BalanceRow = { id: number; account: string; quantity: string; commodity: string };
type Result = { materializePostingBalances(database: SqliteDatabase): number };

export = ({
  numeric: {
    decimal: { addDecimals, formatDecimal, parseDecimal },
  },
}: Dependencies): Result => {

  function materializePostingBalances(database: SqliteDatabase): number {
    const rows = database.prepare<BalanceRow>(`
      SELECT
        amounts.id,
        postings.account,
        amounts.amount_quantity AS quantity,
        amounts.amount_commodity AS commodity
      FROM resolved_posting_amounts AS amounts
      JOIN postings ON postings.id = amounts.posting_id
      ORDER BY postings.posting_date, postings.transaction_id,
        postings.position, amounts.position
    `).all();
    const updateBalance = database.prepare(`
      UPDATE resolved_posting_amounts
      SET balance_quantity = ?
      WHERE id = ?
    `);
    const balancesByAccount = new Map<string, Map<string, ReturnType<typeof parseDecimal>>>();
    for (const row of rows) {
      let balances = balancesByAccount.get(row.account);
      if (!balances) {
        balances = new Map();
        balancesByAccount.set(row.account, balances);
      }
      const balance = addDecimals(
        balances.get(row.commodity) ?? parseDecimal('0'),
        parseDecimal(row.quantity),
      );
      balances.set(row.commodity, balance);
      updateBalance.run(formatDecimal(balance), row.id);
    }
    return rows.length;
  }

  return { materializePostingBalances };
};
