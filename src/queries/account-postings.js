'use strict';

module.exports = ({
  path,
  sqlite: Database,
  apiOptions: { assertDate, parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    account: z.string().min(1, { error: 'must be a non-empty string' }),
    after: z.string().optional(),
  });

  function queryAccountPostings(databasePath, options) {
    const { account, after } = parseOptions(optionsSchema, options, 'accountPostings');
    assertDate(after, 'after');
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      const dateFilter = after === undefined
        ? ''
        : 'AND (t.date > ? OR p.report_date > ?)';
      const parameters = after === undefined ? [account] : [account, after, after];
      return database.prepare(`
      SELECT
        t.date AS transactionDate,
        p.report_date AS postingDate,
        r.commodity,
        r.quantity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      WHERE p.account = ? ${dateFilter}
      ORDER BY p.report_date, p.id, r.position
    `).all(...parameters);
    } finally {
      database.close();
    }
  }

  return { optionsSchema, queryAccountPostings };
};
