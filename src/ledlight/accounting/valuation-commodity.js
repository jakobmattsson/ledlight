'use strict';

module.exports = ({ publicErrors: { createError, errorCodes } }) => {

  function fromJournal(journal) {
    let valuationCommodity = null;
    for (const entry of journal.entries) {
      if (entry.type === 'commodity' && entry.properties.some(({ name }) => name === 'default')) {
        valuationCommodity = entry.symbol;
      }
    }
    return valuationCommodity;
  }

  function fromDatabase(database) {
    const valuationCommodity = database.prepare(
      "SELECT value FROM metadata WHERE key = 'valuation_commodity'",
    ).pluck().get();
    if (!valuationCommodity) {
      throw createError(
        errorCodes.MISSING_VALUATION_DATA,
        'The journal does not declare a default commodity for valuation',
      );
    }
    return valuationCommodity;
  }

  return { fromJournal, fromDatabase };
};
