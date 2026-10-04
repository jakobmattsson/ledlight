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
        (
          SELECT first_declaration.comment
          FROM account_declarations AS first_declaration
          JOIN journal_entries AS entries ON entries.id = first_declaration.entry_id
          WHERE first_declaration.name = declarations.name
          ORDER BY entries.sequence
          LIMIT 1
        ) AS comment,
        COUNT(DISTINCT postings.transaction_id) AS transactionCount
      FROM account_declarations AS declarations
      LEFT JOIN postings ON postings.account = declarations.name
      GROUP BY declarations.name
      ORDER BY declarations.name
    `).all();
  }

  return { name: 'accounts', inputSchema: optionsSchema, execute: queryAccounts };
};
