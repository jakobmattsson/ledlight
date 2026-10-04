'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryCommodities(database, options, _caches) {
    parseOptions(optionsSchema, options, 'commodities');
    return database.prepare(`
      SELECT symbol AS commodity FROM commodity_declarations
      UNION
      SELECT commodity FROM resolved_posting_amounts
      UNION
      SELECT lot_cost_commodity AS commodity FROM postings
      WHERE lot_cost_commodity IS NOT NULL
      UNION
      SELECT cost_commodity AS commodity FROM postings
      WHERE cost_commodity IS NOT NULL
      UNION
      SELECT balance_assignment_commodity AS commodity FROM postings
      WHERE balance_assignment_commodity IS NOT NULL
      UNION
      SELECT balance_assertion_commodity AS commodity FROM postings
      WHERE balance_assertion_commodity IS NOT NULL
      UNION
      SELECT base_commodity AS commodity FROM prices
      UNION
      SELECT quote_commodity AS commodity FROM prices
      ORDER BY commodity
    `).all();
  }

  return { name: 'commodities', inputSchema: optionsSchema, execute: queryCommodities };
};
