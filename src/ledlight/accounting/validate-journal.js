'use strict';

module.exports = () => {

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

  function validatePosting(posting) {
    if (posting.amount) requireCommodity(posting.amount, 'Posting amount', posting.location);
    if (posting.cost) requireCommodity(posting.cost.amount, 'Posting cost', posting.location);
    if (posting.balanceAssertion) {
      requireCommodity(posting.balanceAssertion, 'Balance assertion', posting.location);
    }
  }

  function validateJournal(journal) {
    for (const entry of journal.entries) {
      if (entry.type === 'transaction') {
        entry.postings.forEach(validatePosting);
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
