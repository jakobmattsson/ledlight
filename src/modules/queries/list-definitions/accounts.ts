'use strict';

type Database = { prepare(sql: string): { all(...parameters: unknown[]): unknown[] } };
type Row = { account: string; comment: string | null; used: number; transactionCount: number };

module.exports = ({
  accountFilter: { accountFilter },
  core: {
    apiOptions: { accounts, usage, parseOptions },
  },
  external: {
    zod: { z }
  },
}: any) => {
  const optionsSchema = z.strictObject({
    accounts,
    usage,
  });

  function queryAccounts(database: Database, options: unknown, _caches: unknown) {
    const { accounts, usage } = parseOptions(optionsSchema, options, 'accounts');
    const filter = accounts.length === 0
      ? { sql: '1 = 1', parameters: [] }
      : accountFilter('declarations.name', accounts);
    return (database.prepare(`
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
    `).all(usage, usage, ...filter.parameters) as Row[]).map((row) => ({ ...row, used: Boolean(row.used) }));
  }

  return { inputSchema: optionsSchema, execute: queryAccounts };
};
