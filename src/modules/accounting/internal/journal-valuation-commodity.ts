'use strict';

module.exports = ({
  journal: {
    ingestionWarning: { createWarning, warningCodes },
  },
}: any) => {

  function valuationCommodityFromJournal(journal: any, suppliedWarnings: any, ignoredProperties: any) {
    const warnings = suppliedWarnings || [];
    let valuationCommodity = null;
    let defaultLocation = null;
    for (const entry of journal.entries) {
      if (entry.type !== 'commodity') continue;
      for (const property of entry.properties.filter(({ name }: any) => name === 'default')) {
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
    if (!valuationCommodity) {
      warnings.push(createWarning(
        warningCodes.MISSING_DEFAULT_COMMODITY,
        'Journal must declare one default commodity',
        { source: journal.journalPath || journal.source || '<input>', line: 1, column: 1 },
      ));
    }
    return valuationCommodity;
  }

  return { valuationCommodityFromJournal };
};
