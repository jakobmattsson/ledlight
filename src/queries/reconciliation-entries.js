'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const account = z.string().min(1, { error: 'must be a non-empty string' });
  const optionsSchema = z.strictObject({
    accounts: z.array(account).min(1, { error: 'must contain at least one account' }),
    related: z.boolean().optional(),
  });

  function toEntry(row, accountName, related, rowNumber) {
    return {
      date: row.date,
      amount: row.amount,
      description: row.description,
      commodity: row.commodity,
      account: accountName,
      ...(related ? { postingAccount: row.postingAccount } : {}),
      filename: row.filename,
      sourceLine: row.sourceLine,
      row: rowNumber,
    };
  }

  function queryReconciliationEntries(database, options) {
    const { accounts, related = false } = parseOptions(
      optionsSchema, options, 'reconciliationEntries',
    );
    const rows = database.prepare(`
      SELECT
        t.entry_id AS transactionId,
        p.report_date AS date,
        COALESCE(t.payee, t.description) AS description,
        p.account AS postingAccount,
        r.commodity,
        r.quantity AS amount,
        sf.path AS filename,
        je.line AS sourceLine
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      JOIN journal_entries AS je ON je.id = t.entry_id
      JOIN source_files AS sf ON sf.id = je.source_file_id
      ORDER BY p.report_date, p.id, r.position
    `).all();
    const directByAccount = new Map();
    const transactionIdsByAccount = new Map();
    rows.forEach((row, index) => {
      const direct = directByAccount.get(row.postingAccount) || [];
      direct.push({ row, rowNumber: index + 1 });
      directByAccount.set(row.postingAccount, direct);
      const transactionIds = transactionIdsByAccount.get(row.postingAccount) || new Set();
      transactionIds.add(row.transactionId);
      transactionIdsByAccount.set(row.postingAccount, transactionIds);
    });

    return accounts.flatMap((accountName) => {
      if (!related) {
        return (directByAccount.get(accountName) || [])
          .map(({ row, rowNumber }) => toEntry(row, accountName, false, rowNumber));
      }
      const transactionIds = transactionIdsByAccount.get(accountName) || new Set();
      return rows.flatMap((row, index) =>
        transactionIds.has(row.transactionId) && row.postingAccount !== accountName
          ? [toEntry(row, accountName, true, index + 1)]
          : []);
    });
  }

  return {
    name: 'reconciliationEntries',
    inputSchema: optionsSchema,
    execute: queryReconciliationEntries,
  };
};
