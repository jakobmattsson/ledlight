'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    accounts: z.array(z.string().min(1, { error: 'must be a non-empty string' })).default([]),
  });

  function queryAccounts(database, options, _caches) {
    const { accounts } = parseOptions(optionsSchema, options, 'accounts');
    const filter = accounts.length === 0
      ? { sql: '1 = 1', parameters: [] }
      : accountFilter('declarations.name', accounts);
    return database.prepare(`
      SELECT
        declarations.name AS account,
        declarations.comment,
        COUNT(DISTINCT postings.transaction_id) AS transactionCount
      FROM account_declarations AS declarations
      JOIN journal_entries AS entries ON entries.id = declarations.entry_id
      LEFT JOIN postings ON postings.account = declarations.name
      WHERE ${filter.sql}
      GROUP BY declarations.entry_id
      ORDER BY declarations.name, entries.sequence
    `).all(...filter.parameters);
  }

  return { name: 'accounts', inputSchema: optionsSchema, execute: queryAccounts };
};
