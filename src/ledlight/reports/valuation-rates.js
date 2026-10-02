'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: {
    formatDecimal,
    multiplyDecimals,
    parseDecimal,
  },
  valuationCommodity: { fromDatabase },
}) => {

  function selectLatestPrices(database, throughDate) {
    const prices = new Map();
    const dateFilter = throughDate ? 'WHERE p.date <= ?' : '';
    const parameters = throughDate ? [throughDate] : [];
    const rows = database.prepare(`
    SELECT p.commodity, p.price_quantity, p.price_commodity
    FROM prices AS p
    JOIN journal_entries AS e ON e.id = p.entry_id
    ${dateFilter}
    ORDER BY p.commodity, p.date DESC, e.sequence DESC
  `).all(...parameters);
    for (const row of rows) {
      if (!prices.has(row.commodity)) prices.set(row.commodity, row);
    }
    return prices;
  }

  function resolveValuationRates(prices, commodities, valuationCommodity, throughDate) {
    const rates = new Map([[valuationCommodity, '1']]);
    const visiting = new Set();

    function resolve(commodity) {
      if (rates.has(commodity)) return rates.get(commodity);
      if (visiting.has(commodity)) {
        throw new Error(`Circular price chain while converting ${commodity} to ${valuationCommodity}`);
      }
      const price = prices.get(commodity);
      if (!price || !price.price_commodity) {
        const dateContext = throughDate ? ` on or before ${throughDate}` : '';
        throw new Error(`No price for ${commodity}${dateContext} can convert it to ${valuationCommodity}`);
      }
      visiting.add(commodity);
      const quoteRate = resolve(price.price_commodity);
      const rate = formatDecimal(multiplyDecimals(
        parseDecimal(price.price_quantity),
        parseDecimal(quoteRate),
      ));
      visiting.delete(commodity);
      rates.set(commodity, rate);
      return rate;
    }

    for (const commodity of commodities) resolve(commodity);
    return rates;
  }

  function selectMaterializedValuationRates(database, throughDate, commodities, valuationCommodity) {
    const selected = [...commodities].filter((commodity) => commodity !== valuationCommodity);
    const rates = new Map([[valuationCommodity, '1']]);
    if (selected.length === 0) return rates;
    const placeholders = selected.map(() => '?').join(', ');
    const rows = database.prepare(`
    SELECT rates.commodity, rates.rate
    FROM valuation_prices AS rates
    JOIN (
      SELECT commodity, MAX(date) AS date
      FROM valuation_prices
      WHERE (? IS NULL OR date <= ?)
        AND commodity IN (${placeholders})
      GROUP BY commodity
    ) AS latest
      ON latest.commodity = rates.commodity AND latest.date = rates.date
    ORDER BY rates.commodity
  `).all(throughDate ?? null, throughDate ?? null, ...selected);
    for (const row of rows) rates.set(row.commodity, row.rate);
    return rates;
  }

  function queryValuationRates(database, throughDate, commodities, priceCache) {
    const valuationCommodity = fromDatabase(database);
    const materializedRates = selectMaterializedValuationRates(
      database, throughDate, commodities, valuationCommodity,
    );
    if ([...commodities].every((commodity) => materializedRates.has(commodity))) {
      return materializedRates;
    }
    const cacheKey = throughDate ?? null;
    let prices = priceCache?.get(cacheKey);
    if (!prices) {
      prices = selectLatestPrices(database, throughDate);
      priceCache?.set(cacheKey, prices);
    }
    return resolveValuationRates(
      prices,
      commodities,
      valuationCommodity,
      throughDate,
    );
  }

  function selectPriceHistory(database, throughDate) {
    const dateFilter = throughDate ? 'WHERE p.date <= ?' : '';
    const parameters = throughDate ? [throughDate] : [];
    return database.prepare(`
    SELECT p.date, p.commodity, p.price_quantity, p.price_commodity
    FROM prices AS p
    JOIN journal_entries AS e ON e.id = p.entry_id
    ${dateFilter}
    ORDER BY p.commodity, p.date, e.sequence
  `).all(...parameters);
  }

  function createLedgerValuationRateResolver(priceRows, valuationCommodity) {
    const histories = new Map();
    for (const price of priceRows) {
      const history = histories.get(price.commodity) ?? [];
      history.push(price);
      histories.set(price.commodity, history);
    }
    const cache = new Map();
    function resolve(commodity, throughDate, visiting) {
      if (commodity === valuationCommodity) return '1';
      const key = `${commodity}\0${throughDate}`;
      if (cache.has(key)) return cache.get(key);
      if (visiting.has(commodity)) throw new Error(`Circular price chain while converting ${commodity} to ${valuationCommodity}`);
      const eligible = (histories.get(commodity) ?? []).filter((price) => price.date <= throughDate);
      // Ledger prefers a direct quote even when a newer indirect quote exists.
      const direct = eligible.findLast((price) => price.price_commodity === valuationCommodity);
      if (direct) {
        cache.set(key, direct.price_quantity);
        return direct.price_quantity;
      }
      visiting.add(commodity);
      for (let index = eligible.length - 1; index >= 0; index -= 1) {
        const price = eligible[index];
        if (!price.price_commodity) continue;
        try {
          const quoteRate = resolve(price.price_commodity, throughDate, visiting);
          const rate = formatDecimal(multiplyDecimals(
            parseDecimal(price.price_quantity),
            parseDecimal(quoteRate),
          ));
          cache.set(key, rate);
          visiting.delete(commodity);
          return rate;
        } catch (error) {
          if (!error.message.startsWith('No price for ')) throw error;
        }
      }
      visiting.delete(commodity);
      throw new Error(`No price for ${commodity} on or before ${throughDate} can convert it to ${valuationCommodity}`);
    }
    return (commodity, throughDate) => resolve(commodity, throughDate, new Set());
  }

  function queryLedgerValuationRateResolver(databasePath) {
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      return createLedgerValuationRateResolver(selectPriceHistory(database), fromDatabase(database));
    } finally {
      database.close();
    }
  }

  return {
    queryValuationRates,
    queryLedgerValuationRateResolver,
    $$private: {
      resolveValuationRates,
      selectLatestPrices,
      selectMaterializedValuationRates,
    },
  };
};
