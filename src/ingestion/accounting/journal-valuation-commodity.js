'use strict';

module.exports = ({
  ingestionWarning: { createWarning, warningCodes },
}) => {

  function valuationCommodityFromJournal(journal, suppliedWarnings, ignoredProperties) {
    const warnings = suppliedWarnings || [];
    let valuationCommodity = null;
    let defaultLocation = null;
    for (const entry of journal.entries) {
      if (entry.type !== 'commodity') continue;
      for (const property of entry.properties.filter(({ name }) => name === 'default')) {
        if (defaultLocation) {
          warnings.push(createWarning(
            warningCodes.MULTIPLE_DEFAULT_COMMODITIES,
            'Multiple commodity declarations are marked default; using the first at ' +
              `${defaultLocation.source}:${defaultLocation.line}:${defaultLocation.column}`,
            property.location,
          ));
          if (ignoredProperties) ignoredProperties.add(property);
          continue;
        }
        valuationCommodity = entry.symbol;
        defaultLocation = property.location;
      }
    }
    return valuationCommodity;
  }

  return { valuationCommodityFromJournal };
};
