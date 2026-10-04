'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryAccounts(database, options, _caches) {
    parseOptions(optionsSchema, options, 'accounts');
    return database.prepare(`
      SELECT
        declarations.name AS account,
        declarations.comment,
        COUNT(DISTINCT postings.transaction_id) AS transactionCount
      FROM account_declarations AS declarations
      JOIN journal_entries AS entries ON entries.id = declarations.entry_id
      LEFT JOIN postings ON postings.account = declarations.name
      GROUP BY declarations.entry_id
      ORDER BY declarations.name, entries.sequence
    `).all();
  }

  return { name: 'accounts', inputSchema: optionsSchema, execute: queryAccounts };
};
