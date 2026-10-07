'use strict';

module.exports = ({
  publicErrors: { createError, errorCodes },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
}) => {
  function validateCostValuation(database, filter) {
    const valuationCommodity = valuationCommodityFromDatabase(database);
    const missing = database.prepare(`
      SELECT p.account, r.commodity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      ${filter.sql}
        ${filter.sql ? 'AND' : 'WHERE'} r.commodity != ?
        AND (p.lot_cost_quantity IS NULL OR p.lot_cost_commodity != ?)
      LIMIT 1
    `).get(...filter.parameters, valuationCommodity, valuationCommodity);
    if (missing) {
      throw createError(
        errorCodes.MISSING_VALUATION_DATA,
        `Cannot value ${missing.commodity} at cost for ${missing.account}: ` +
          `a lot cost in ${valuationCommodity} is required`,
      );
    }
  }

  const costValueSql = `CASE
    WHEN r.commodity = (SELECT value FROM database_metadata WHERE key = 'valuation_commodity')
      THEN r.quantity
    WHEN p.lot_cost_is_total = 1 THEN CASE
      WHEN decimal_cmp(r.quantity, '0') < 0 AND decimal_cmp(p.lot_cost_quantity, '0') > 0
        THEN decimal_mul(p.lot_cost_quantity, '-1')
      ELSE p.lot_cost_quantity
    END
    ELSE decimal_mul(r.quantity, p.lot_cost_quantity)
  END`;

  return { validateCostValuation, costValueSql };
};
