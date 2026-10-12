'use strict';

module.exports = ({
  decimal: {
    formatDecimal,
    multiplyDecimals,
    parseDecimal,
  },
  publicErrors: { createError, errorCodes },
  valuationRateResolver: {
    createLedgerValuationRateResolver,
  },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
}) => {

  const missingValuation = (message) => createError(errorCodes.MISSING_VALUATION_DATA, message);

  const LEDGER_RESOLVER_CACHE_KEY = Symbol('ledger valuation rate resolver');

  function selectLatestPrices(database, throughDate) {
    const prices = new Map();
    const rows = database.prepare(`
    SELECT p.base_commodity, p.quote_quantity, p.quote_commodity
    FROM prices AS p
    WHERE p.date <= COALESCE(?, '9999-12-31')
    ORDER BY p.base_commodity, p.date DESC, p.entry_id DESC
  `).all(throughDate ?? null);
    for (const row of rows) {
      if (!prices.has(row.base_commodity)) prices.set(row.base_commodity, row);
    }
    return prices;
  }

  function resolveValuationRates(prices, commodities, valuationCommodity, throughDate) {
    const rates = new Map([[valuationCommodity, '1']]);
    const visiting = new Set();

    function resolve(commodity) {
      if (rates.has(commodity)) return rates.get(commodity);
      if (visiting.has(commodity)) {
        throw missingValuation(`Circular price chain while converting ${commodity} to ${valuationCommodity}`);
      }
      const price = prices.get(commodity);
      if (!price || !price.quote_commodity) {
        const dateContext = throughDate ? ` on or before ${throughDate}` : '';
        throw missingValuation(`No price for ${commodity}${dateContext} can convert it to ${valuationCommodity}`);
      }
      visiting.add(commodity);
      const quoteRate = resolve(price.quote_commodity);
      const rate = formatDecimal(multiplyDecimals(
        parseDecimal(price.quote_quantity),
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
      SELECT commodity, rate
      FROM valuation_prices
      WHERE date = (
        SELECT MAX(date)
        FROM valuation_prices
        WHERE date <= COALESCE(?, '9999-12-31')
      )
        AND commodity IN (${placeholders})
      ORDER BY commodity
    `).all(throughDate ?? null, ...selected);
    for (const row of rows) rates.set(row.commodity, row.rate);
    return rates;
  }

  function queryValuationRates(database, throughDate, commodities, priceCache) {
    const valuationCommodity = valuationCommodityFromDatabase(database);
    const materializedRates = selectMaterializedValuationRates(
      database, throughDate, commodities, valuationCommodity,
    );
    if ([...commodities].every((commodity) => materializedRates.has(commodity))) {
      return materializedRates;
    }
    let resolve = priceCache?.get(LEDGER_RESOLVER_CACHE_KEY);
    if (!resolve) {
      resolve = createLedgerValuationRateResolver(
        selectPriceHistory(database),
        valuationCommodity,
      );
      priceCache?.set(LEDGER_RESOLVER_CACHE_KEY, resolve);
    }
    const rates = new Map([[valuationCommodity, '1']]);
    for (const commodity of commodities) {
      if (commodity !== valuationCommodity) {
        rates.set(commodity, resolve(commodity, throughDate ?? '9999-12-31'));
      }
    }
    return rates;
  }

  function selectPriceHistory(database, throughDate) {
    return database.prepare(`
    SELECT p.date, p.base_commodity, p.quote_quantity, p.quote_commodity
    FROM prices AS p
    WHERE p.date <= COALESCE(?, '9999-12-31')
    ORDER BY p.base_commodity, p.date, p.entry_id
  `).all(throughDate ?? null);
  }

  return {
    createLedgerValuationRateResolver,
    queryValuationRates,
    $$private: {
      resolveValuationRates,
      selectLatestPrices,
      selectMaterializedValuationRates,
    },
  };
};
