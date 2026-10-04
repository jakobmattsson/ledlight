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
      : accountFilter('postings.account', accounts);
    return database.prepare(`
      SELECT
        postings.account,
        declarations.comment,
        COUNT(DISTINCT postings.transaction_id) AS transactionCount
      FROM postings
      JOIN resolved_posting_amounts AS amounts ON amounts.posting_id = postings.id
      LEFT JOIN account_declarations AS declarations ON declarations.name = postings.account
      WHERE decimal_cmp(amounts.quantity, '0') != 0 AND ${filter.sql}
      GROUP BY postings.account
      ORDER BY postings.account || char(1114111)
    `).all(...filter.parameters);
  }

  return { name: 'accounts', inputSchema: optionsSchema, execute: queryAccounts };
};
