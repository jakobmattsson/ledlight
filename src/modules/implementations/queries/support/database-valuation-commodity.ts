'use strict';

module.exports = ({
  core: {
    publicErrors: { createError, errorCodes },
  },
}: any) => {

  function valuationCommodityFromDatabase(database: any) {
    const valuationCommodity = database.prepare(
      "SELECT value FROM database_metadata WHERE key = 'valuation_commodity'",
    ).pluck().get();
    if (!valuationCommodity) {
      throw createError(
        errorCodes.MISSING_VALUATION_DATA,
        'The journal does not declare a default commodity for valuation',
      );
    }
    return valuationCommodity;
  }

  return { valuationCommodityFromDatabase };
};
