'use strict';

module.exports = ({
  decimal: { addDecimals, formatDecimal, parseDecimal },
}) => {

  function materializePostingBalances(database) {
    const rows = database.prepare(`
      SELECT
        amounts.id,
        postings.account,
        amounts.quantity,
        amounts.commodity
      FROM resolved_posting_amounts AS amounts
      JOIN postings ON postings.id = amounts.posting_id
      JOIN journal_entries AS entries ON entries.id = postings.transaction_id
      ORDER BY postings.report_date, entries.sequence,
        postings.position, amounts.position
    `).all();
    const updateBalance = database.prepare(`
      UPDATE resolved_posting_amounts
      SET running_balance = ?
      WHERE id = ?
    `);
    const balancesByAccount = new Map();
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
