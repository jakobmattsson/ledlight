'use strict';

module.exports = ({
  project: { ensureDatabaseCurrent },
  databaseReader: { readDatabase },
}) => {

  function toEntry(row, account, related, rowNumber) {
    return {
      date: row.date,
      amount: row.amount,
      description: row.description,
      commodity: row.commodity,
      account,
      ...(related ? { postingAccount: row.postingAccount } : {}),
      filename: row.filename,
      sourceLine: row.sourceLine,
      row: rowNumber,
    };
  }

  function loadReconciliationEntries(journalPath) {
    const journal = ensureDatabaseCurrent(journalPath);
    const rows = readDatabase(journal.databasePath, (database) => database.prepare(`
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
    `).all());
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

    return {
      databasePath: journal.databasePath,
      rebuilt: journal.rebuilt,
      readEntries(accounts, options) {
        const related = options?.related ?? false;
        return accounts.flatMap((account) => {
          if (!related) {
            return (directByAccount.get(account) || [])
              .map(({ row, rowNumber }) => toEntry(row, account, false, rowNumber));
          }
          const transactionIds = transactionIdsByAccount.get(account) || new Set();
          return rows.flatMap((row, index) =>
            transactionIds.has(row.transactionId) && row.postingAccount !== account
              ? [toEntry(row, account, true, index + 1)]
              : []);
        });
      },
    };
  }

  return { $$private: { loadReconciliationEntries } };
};
