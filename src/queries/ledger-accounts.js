'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryLedgerAccounts(database, options) {
    parseOptions(optionsSchema, options, 'ledgerAccounts');
    return database.prepare(`
      WITH account_names AS (
        SELECT name AS account FROM account_declarations
        UNION
        SELECT account FROM postings
      )
      SELECT
        names.account,
        (
          SELECT declarations.comment
          FROM account_declarations AS declarations
          JOIN journal_entries AS entries ON entries.id = declarations.entry_id
          WHERE declarations.name = names.account
          ORDER BY entries.sequence
          LIMIT 1
        ) AS comment,
        COUNT(DISTINCT postings.transaction_id) AS transactionCount
      FROM account_names AS names
      LEFT JOIN postings ON postings.account = names.account
      GROUP BY names.account
      ORDER BY names.account
    `).all();
  }

  return { name: 'ledgerAccounts', inputSchema: optionsSchema, execute: queryLedgerAccounts };
};
