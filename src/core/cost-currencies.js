'use strict';

module.exports = () => {
  const currencyCapitalAccount = (commodity) => `Currency capital (${commodity})`;

  function costCurrenciesFromEntries(entries, valuationCommodity) {
    return new Set(entries.flatMap((entry) => (entry.postings || [])
      .map((posting) => posting.lotCost?.amount.commodity))
      .filter((commodity) => commodity && commodity !== valuationCommodity));
  }

  function queryCostCurrencies(database, valuationCommodity) {
    return new Set(database.prepare(`
      SELECT DISTINCT lot_cost_commodity FROM postings
      WHERE lot_cost_commodity IS NOT NULL AND lot_cost_commodity != ?
    `).pluck().all(valuationCommodity));
  }

  return { currencyCapitalAccount, costCurrenciesFromEntries, queryCostCurrencies };
};
