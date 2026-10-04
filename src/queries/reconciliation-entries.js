'use strict';

module.exports = ({
  accountFilter: { accountMatches },
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

  function queryReconciliationEntries(database, options, _caches) {
    const { accounts, related = false } = parseOptions(
      optionsSchema, options, 'reconciliationEntries',
    );
    const rows = database.prepare(`
      SELECT
        t.entry_id AS transactionId,
        p.report_date AS date,
        t.description,
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
    return accounts.flatMap((accountPattern) => {
      if (!related) {
        return rows.flatMap((row, index) => accountMatches(row.postingAccount, accountPattern)
          ? [toEntry(row, accountPattern, false, index + 1)]
          : []);
      }
      const transactionIds = new Set(rows
        .filter((row) => accountMatches(row.postingAccount, accountPattern))
        .map((row) => row.transactionId));
      return rows.flatMap((row, index) =>
        transactionIds.has(row.transactionId) && !accountMatches(row.postingAccount, accountPattern)
          ? [toEntry(row, accountPattern, true, index + 1)]
          : []);
    });
  }

  return {
    name: 'reconciliationEntries',
    inputSchema: optionsSchema,
    execute: queryReconciliationEntries,
  };
};
