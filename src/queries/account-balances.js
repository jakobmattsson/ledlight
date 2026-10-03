'use strict';

module.exports = ({
  apiOptions: { assertDate, parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    account: z.string().min(1, { error: 'must be a non-empty string' }),
    to: z.string().optional(),
  });

  function queryAccountBalances(database, options) {
    const { account, to } = parseOptions(optionsSchema, options, 'accountBalances');
    assertDate(to, 'to');
    const dateFilter = to === undefined ? '' : 'AND p.report_date <= ?';
    const parameters = to === undefined ? [account] : [account, to];
    return database.prepare(`
      SELECT r.commodity, decimal_sum(r.quantity) AS quantity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      WHERE p.account = ? ${dateFilter}
      GROUP BY r.commodity
      ORDER BY r.commodity
    `).all(...parameters);
  }

  return { optionsSchema, queryAccountBalances };
};
