'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  decimal: { divideDecimals, formatDecimal, parseDecimal },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    mode: z.enum(['effective', 'directives']).default('effective'),
  });
  const inferredPriceScale = 30;
  const decimalScale = (quantity) => quantity.split('.')[1]?.length ?? 0;

  function queryPrices(database, options, _caches) {
    const { mode } = parseOptions(optionsSchema, options, 'prices');
    if (mode === 'directives') {
      return database.prepare(`
        SELECT
          prices.date,
          prices.base_commodity AS baseCommodity,
          prices.quote_quantity AS quoteQuantity,
          prices.quote_commodity AS quoteCommodity,
          prices.comment
        FROM prices
        JOIN journal_entries AS entries ON entries.id = prices.entry_id
        ORDER BY prices.base_commodity, prices.date, entries.sequence
      `).all();
    }
    const events = database.prepare(`
      SELECT
        prices.date,
        prices.base_commodity AS baseCommodity,
        prices.quote_quantity AS quoteQuantity,
        prices.quote_commodity AS quoteCommodity,
        prices.comment,
        entries.sequence,
        -1 AS position,
        0 AS isTotal,
        NULL AS baseQuantity,
        NULL AS transactionId,
        0 AS hasTransactionCost
      FROM prices
      JOIN journal_entries AS entries ON entries.id = prices.entry_id
      UNION ALL
      SELECT
        transactions.date,
        postings.amount_commodity,
        COALESCE(postings.cost_quantity, postings.lot_cost_quantity),
        COALESCE(postings.cost_commodity, postings.lot_cost_commodity),
        NULL,
        entries.sequence,
        postings.position,
        COALESCE(postings.cost_is_total, postings.lot_cost_is_total),
        postings.amount_quantity,
        postings.transaction_id,
        postings.cost_quantity IS NOT NULL
      FROM postings
      JOIN transactions ON transactions.entry_id = postings.transaction_id
      JOIN journal_entries AS entries ON entries.id = transactions.entry_id
      WHERE postings.amount_quantity IS NOT NULL
        AND (postings.cost_quantity IS NOT NULL OR postings.lot_cost_quantity IS NOT NULL)
      ORDER BY sequence, position
    `).all();
    const transactionScales = new Map();
    for (const row of database.prepare(`
      SELECT transaction_id, amount_commodity, amount_quantity
      FROM postings WHERE amount_quantity IS NOT NULL
    `).all()) {
      const key = `${row.transaction_id}\u0000${row.amount_commodity}`;
      transactionScales.set(key, Math.max(
        transactionScales.get(key) ?? 0, decimalScale(row.amount_quantity),
      ));
    }
    const usedCommodities = new Set(database.prepare(`
      SELECT DISTINCT commodity
      FROM resolved_posting_amounts
      WHERE decimal_cmp(quantity, '0') != 0
    `).pluck().all());
    const byKey = new Map();
    const quoteOrder = new Map();
    for (const event of events) {
      if (!usedCommodities.has(event.baseCommodity)) continue;
      const pair = `${event.baseCommodity}\u0000${event.quoteCommodity}`;
      if (!quoteOrder.has(pair)) quoteOrder.set(pair, quoteOrder.size);
      if (event.isTotal) {
        // Preserve the source operands for text rendering without changing the
        // public row shape or rounding the high-precision API quantity twice.
        Object.defineProperty(event, 'ledgerPrice', { value: {
          totalQuantity: event.quoteQuantity,
          baseQuantity: event.baseQuantity,
          hasTransactionCost: Boolean(event.hasTransactionCost),
          baseScale: transactionScales.get(`${event.transactionId}\u0000${event.baseCommodity}`) ?? 0,
          quoteScale: transactionScales.get(`${event.transactionId}\u0000${event.quoteCommodity}`) ?? 0,
        } });
        const amount = parseDecimal(event.baseQuantity);
        const absoluteAmount = amount.coefficient < 0n
          ? { ...amount, coefficient: -amount.coefficient }
          : amount;
        event.quoteQuantity = formatDecimal(divideDecimals(
          parseDecimal(event.quoteQuantity), absoluteAmount, inferredPriceScale,
        ));
      }
      delete event.sequence;
      delete event.position;
      delete event.isTotal;
      delete event.baseQuantity;
      delete event.transactionId;
      delete event.hasTransactionCost;
      const key = `${pair}\u0000${event.date}`;
      byKey.set(key, event);
    }
    return [...byKey.values()].sort((left, right) =>
      left.date.localeCompare(right.date) ||
      (left.baseCommodity < right.baseCommodity ? -1 :
        left.baseCommodity > right.baseCommodity ? 1 : 0) ||
      quoteOrder.get(`${left.baseCommodity}\u0000${left.quoteCommodity}`) -
        quoteOrder.get(`${right.baseCommodity}\u0000${right.quoteCommodity}`));
  }

  return { name: 'prices', inputSchema: optionsSchema, execute: queryPrices };
};
