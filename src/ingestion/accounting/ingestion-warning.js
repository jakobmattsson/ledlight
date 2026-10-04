'use strict';

module.exports = () => {

  const warningCodes = Object.freeze({
    AMBIGUOUS_BALANCE_ASSIGNMENT: 'AMBIGUOUS_BALANCE_ASSIGNMENT',
    BALANCE_ASSERTION_FAILED: 'BALANCE_ASSERTION_FAILED',
    INVALID_COMMODITY_TRADE: 'INVALID_COMMODITY_TRADE',
    MISSING_COMMODITY: 'MISSING_COMMODITY',
    MULTIPLE_DEFAULT_COMMODITIES: 'MULTIPLE_DEFAULT_COMMODITIES',
    MULTIPLE_IMPLICIT_POSTINGS: 'MULTIPLE_IMPLICIT_POSTINGS',
    UNBALANCED_TRANSACTION: 'UNBALANCED_TRANSACTION',
  });

  function createWarning(code, message, location) {
    return Object.freeze({
      code,
      message,
      source: location.source,
      line: location.line,
      column: location.column,
    });
  }

  return { createWarning, warningCodes };
};
