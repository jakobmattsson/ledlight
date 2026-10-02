'use strict';

module.exports = ({ publicErrors: { createError, errorCodes } }) => {

  function fromJournal(journal) {
    let valuationCommodity = null;
    let defaultLocation = null;
    for (const entry of journal.entries) {
      if (entry.type !== 'commodity') continue;
      for (const property of entry.properties.filter(({ name }) => name === 'default')) {
        if (defaultLocation) {
          throw createError(
            errorCodes.PROJECT_CONFIGURATION,
            `${property.location.source}:${property.location.line}:${property.location.column}: ` +
            'Multiple commodity declarations are marked default; the first is at ' +
            `${defaultLocation.source}:${defaultLocation.line}:${defaultLocation.column}`,
          );
        }
        valuationCommodity = entry.symbol;
        defaultLocation = property.location;
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
