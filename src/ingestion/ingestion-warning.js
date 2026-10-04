'use strict';

module.exports = () => {

  const warningCodes = Object.freeze({
    AMBIGUOUS_BALANCE_ASSIGNMENT: 'AMBIGUOUS_BALANCE_ASSIGNMENT',
    BALANCE_ASSERTION_FAILED: 'BALANCE_ASSERTION_FAILED',
    DUPLICATE_ACCOUNT_DECLARATION: 'DUPLICATE_ACCOUNT_DECLARATION',
    DUPLICATE_COMMODITY_DECLARATION: 'DUPLICATE_COMMODITY_DECLARATION',
    DUPLICATE_TAG_DECLARATION: 'DUPLICATE_TAG_DECLARATION',
    INVALID_COMMODITY_TRADE: 'INVALID_COMMODITY_TRADE',
    MISSING_COMMODITY: 'MISSING_COMMODITY',
    MULTIPLE_DEFAULT_COMMODITIES: 'MULTIPLE_DEFAULT_COMMODITIES',
    MULTIPLE_IMPLICIT_POSTINGS: 'MULTIPLE_IMPLICIT_POSTINGS',
    SYNTAX_ERROR: 'SYNTAX_ERROR',
    UNBALANCED_TRANSACTION: 'UNBALANCED_TRANSACTION',
    UNDECLARED_ACCOUNT: 'UNDECLARED_ACCOUNT',
    UNDECLARED_COMMODITY: 'UNDECLARED_COMMODITY',
    UNDECLARED_TAG: 'UNDECLARED_TAG',
  });

  function createWarning(code, message, location) {
    return Object.freeze({
      code,
      message,
      source: location.source,
      line: location.line,
      column: location.column,
      startLine: location.startLine || location.line,
      endLine: location.endLine || location.line,
    });
  }

  return { createWarning, warningCodes };
};
