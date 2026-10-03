'use strict';

module.exports = ({ publicErrors: { createError, errorCodes } }) => {

  function valuationCommodityFromJournal(journal) {
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

  return { valuationCommodityFromJournal };
};
