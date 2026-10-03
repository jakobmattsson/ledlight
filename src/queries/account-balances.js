'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    account: z.string().min(1, { error: 'must be a non-empty string' }),
    to: z.iso.date({ error: 'Invalid to date' }).optional(),
  });

  function queryAccountBalances(database, options) {
    const { account, to } = parseOptions(optionsSchema, options, 'accountBalances');
    return database.prepare(`
      SELECT r.commodity, decimal_sum(r.quantity) AS quantity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      WHERE p.account = ?
        AND p.report_date <= COALESCE(?, '9999-12-31')
      GROUP BY r.commodity
      ORDER BY r.commodity
    `).all(account, to ?? null);
  }

  return { name: 'accountBalances', inputSchema: optionsSchema, execute: queryAccountBalances };
};
