'use strict';

module.exports = ({
  decimal: { compareDecimals, parseDecimal },
  journalValuationCommodity: { valuationCommodityFromJournal },
}) => {

  const ZERO = parseDecimal('0');

  class JournalValidationError extends Error {
    constructor(message, location) {
      super(`${location.source}:${location.line}:${location.column}: ${message}`);
      this.name = 'JournalValidationError';
      this.source = location.source;
      this.line = location.line;
      this.column = location.column;
    }
  }

  function requireCommodity(amount, label, location) {
    if (!amount || typeof amount.commodity !== 'string' || amount.commodity.length === 0) {
      throw new JournalValidationError(`${label} must specify a commodity`, location);
    }
  }

  function validateCommodityTrade(posting, defaultCommodity) {
    if (!posting.amount || !defaultCommodity || posting.amount.commodity === defaultCommodity) return;
    const sign = compareDecimals(parseDecimal(posting.amount.quantity), ZERO);
    const isZeroValueAcquisition = posting.lotCost && posting.cost &&
      compareDecimals(parseDecimal(posting.lotCost.amount.quantity), ZERO) === 0 &&
      compareDecimals(parseDecimal(posting.cost.amount.quantity), ZERO) === 0;
    if (sign > 0 && (!posting.lotCost || (posting.cost && !isZeroValueAcquisition))) {
      throw new JournalValidationError(
        `Positive ${posting.amount.commodity} posting must use a lot cost ({...} or {{...}}) ` +
        `and no transaction price (@ or @@), except when both prices are zero; ` +
        `the default commodity is ${defaultCommodity}`,
        posting.location,
      );
    }
    if (sign < 0 && (!posting.lotCost || !posting.cost)) {
      throw new JournalValidationError(
        `Negative ${posting.amount.commodity} posting must use both a lot cost ({...} or {{...}}) ` +
        `and a transaction price (@ or @@); the default commodity is ${defaultCommodity}`,
        posting.location,
      );
    }
  }

  function validatePosting(posting, defaultCommodity) {
    if (posting.amount) requireCommodity(posting.amount, 'Posting amount', posting.location);
    if (posting.lotCost) requireCommodity(posting.lotCost.amount, 'Lot cost', posting.location);
    if (posting.cost) requireCommodity(posting.cost.amount, 'Posting cost', posting.location);
    if (posting.balanceAssertion) {
      requireCommodity(posting.balanceAssertion, 'Balance assertion', posting.location);
    }
    validateCommodityTrade(posting, defaultCommodity);
  }

  function validateJournal(journal, defaultCommodity) {
    const effectiveDefaultCommodity = defaultCommodity === undefined
      ? valuationCommodityFromJournal(journal)
      : defaultCommodity;
    for (const entry of journal.entries) {
      if (entry.type === 'transaction') {
        entry.postings.forEach((posting) => validatePosting(posting, effectiveDefaultCommodity));
      } else if (entry.type === 'price') {
        requireCommodity(entry.price, 'Price', entry.location);
      }
    }
    return journal;
  }

  return {
    validateJournal,
    $$private: { JournalValidationError },
  };
};
