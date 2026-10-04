'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    account: z.string().min(1, { error: 'must be a non-empty string' }),
    after: z.iso.date({ error: 'Invalid after date' }).optional(),
  });

  function queryAccountPostings(database, options, _caches) {
    const { account, after } = parseOptions(optionsSchema, options, 'accountPostings');
    const filter = accountFilter('p.account', [account]);
    return database.prepare(`
      SELECT
        t.date AS transactionDate,
        p.report_date AS postingDate,
        r.commodity,
        r.quantity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      WHERE ${filter.sql}
        AND (
          t.date > COALESCE(?, '0000-00-00')
          OR p.report_date > COALESCE(?, '0000-00-00')
        )
      ORDER BY p.report_date, p.id, r.position
    `).all(...filter.parameters, after ?? null, after ?? null);
  }

  return { name: 'accountPostings', inputSchema: optionsSchema, execute: queryAccountPostings };
};
