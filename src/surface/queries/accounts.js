'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  apiOptions: { accounts, usage, parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    accounts,
    usage,
  });

  function queryAccounts(database, options, _caches) {
    const { accounts, usage } = parseOptions(optionsSchema, options, 'accounts');
    const filter = accounts.length === 0
      ? { sql: '1 = 1', parameters: [] }
      : accountFilter('declarations.name', accounts);
    return database.prepare(`
      SELECT
        declarations.name AS account,
        declarations.comment,
        declarations.used,
        COUNT(DISTINCT postings.transaction_id) AS transactionCount
      FROM account_declarations AS declarations
      LEFT JOIN postings ON postings.account = declarations.name
      WHERE (? = 'all' OR declarations.used = (? = 'used')) AND ${filter.sql}
      GROUP BY declarations.entry_id
      ORDER BY declarations.name || char(1114111)
    `).all(usage, usage, ...filter.parameters)
      .map((row) => ({ ...row, used: Boolean(row.used) }));
  }

  return { inputSchema: optionsSchema, execute: queryAccounts };
};
