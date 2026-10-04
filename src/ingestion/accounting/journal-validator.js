'use strict';

module.exports = ({
  decimal: { compareDecimals, parseDecimal },
  ingestionWarning: { createWarning, warningCodes },
  journalValuationCommodity: { valuationCommodityFromJournal },
}) => {

  const ZERO = parseDecimal('0');

  function requireCommodity(amount, label, location, warnings) {
    if (!amount || typeof amount.commodity !== 'string' || amount.commodity.length === 0) {
      warnings.push(createWarning(
        warningCodes.MISSING_COMMODITY,
        `${label} must specify a commodity`,
        location,
      ));
      return false;
    }
    return true;
  }

  function validateCommodityTrade(posting, defaultCommodity, warnings) {
    if (!posting.amount || !defaultCommodity || posting.amount.commodity === defaultCommodity) return;
    const sign = compareDecimals(parseDecimal(posting.amount.quantity), ZERO);
    const isZeroValueAcquisition = posting.lotCost && posting.cost &&
      compareDecimals(parseDecimal(posting.lotCost.amount.quantity), ZERO) === 0 &&
      compareDecimals(parseDecimal(posting.cost.amount.quantity), ZERO) === 0;
    if (sign > 0 && (!posting.lotCost || (posting.cost && !isZeroValueAcquisition))) {
      warnings.push(createWarning(
        warningCodes.INVALID_COMMODITY_TRADE,
        `Positive ${posting.amount.commodity} posting must use a lot cost ({...} or {{...}}) ` +
        `and no transaction price (@ or @@), except when both prices are zero; ` +
        `the default commodity is ${defaultCommodity}`,
        posting.location,
      ));
    }
    if (sign < 0 && (!posting.lotCost || !posting.cost)) {
      warnings.push(createWarning(
        warningCodes.INVALID_COMMODITY_TRADE,
        `Negative ${posting.amount.commodity} posting must use both a lot cost ({...} or {{...}}) ` +
        `and a transaction price (@ or @@); the default commodity is ${defaultCommodity}`,
        posting.location,
      ));
    }
  }

  function validatePosting(posting, defaultCommodity, warnings) {
    let storable = true;
    if (posting.amount) storable = requireCommodity(
      posting.amount, 'Posting amount', posting.location, warnings,
    ) && storable;
    if (posting.lotCost) storable = requireCommodity(
      posting.lotCost.amount, 'Lot cost', posting.location, warnings,
    ) && storable;
    if (posting.cost) storable = requireCommodity(
      posting.cost.amount, 'Posting cost', posting.location, warnings,
    ) && storable;
    if (posting.balanceAssertion) {
      storable = requireCommodity(
        posting.balanceAssertion, 'Balance assertion', posting.location, warnings,
      ) && storable;
    }
    validateCommodityTrade(posting, defaultCommodity, warnings);
    return storable;
  }

  function validateJournal(journal, defaultCommodity, initialWarnings) {
    const warnings = [...(initialWarnings || [])];
    const invalidEntries = new Set();
    const effectiveDefaultCommodity = defaultCommodity === undefined
      ? valuationCommodityFromJournal(journal, warnings)
      : defaultCommodity;
    for (const entry of journal.entries) {
      if (entry.type === 'transaction') {
        const postingResults = entry.postings.map((posting) => validatePosting(
          posting, effectiveDefaultCommodity, warnings,
        ));
        if (!postingResults.every(Boolean)) invalidEntries.add(entry);
      } else if (entry.type === 'price') {
        if (!requireCommodity(entry.price, 'Price', entry.location, warnings)) {
          invalidEntries.add(entry);
        }
      }
    }
    return { invalidEntries, journal, warnings };
  }

  return { validateJournal };
};
