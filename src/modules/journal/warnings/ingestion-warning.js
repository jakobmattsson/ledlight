'use strict';

module.exports = () => {

  const maximumWarningInstances = 10;

  const warningCodes = Object.freeze({
    BALANCE_ASSERTION_FAILED: 'BALANCE_ASSERTION_FAILED',
    DUPLICATE_ACCOUNT_DECLARATION: 'DUPLICATE_ACCOUNT_DECLARATION',
    DUPLICATE_COMMODITY_DECLARATION: 'DUPLICATE_COMMODITY_DECLARATION',
    DUPLICATE_TAG_DECLARATION: 'DUPLICATE_TAG_DECLARATION',
    FOREIGN_LOT_COST_CURRENCY: 'FOREIGN_LOT_COST_CURRENCY',
    IMPOSSIBLE_COST_BASIS: 'IMPOSSIBLE_COST_BASIS',
    INVALID_COMMODITY_TRADE: 'INVALID_COMMODITY_TRADE',
    MISSING_COMMODITY_FORMAT: 'MISSING_COMMODITY_FORMAT',
    MISSING_DEFAULT_COMMODITY: 'MISSING_DEFAULT_COMMODITY',
    MULTIPLE_DEFAULT_COMMODITIES: 'MULTIPLE_DEFAULT_COMMODITIES',
    MULTIPLE_IMPLICIT_POSTINGS: 'MULTIPLE_IMPLICIT_POSTINGS',
    NEGATIVE_POSTING_DATE_HOLDING: 'NEGATIVE_POSTING_DATE_HOLDING',
    POSTING_DATE_BEFORE_TRANSACTION: 'POSTING_DATE_BEFORE_TRANSACTION',
    RESIDUAL_COST_BASIS: 'RESIDUAL_COST_BASIS',
    SALE_PROCEEDS_MISMATCH: 'SALE_PROCEEDS_MISMATCH',
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

  function groupWarnings(warnings) {
    const groups = new Map();
    for (const warning of warnings) {
      const key = JSON.stringify([warning.code, warning.message]);
      let group = groups.get(key);
      if (!group) {
        group = { code: warning.code, message: warning.message, instances: [] };
        groups.set(key, group);
      }
      if (group.instances.length < maximumWarningInstances) {
        group.instances.push(Object.freeze({
          source: warning.source,
          line: warning.line,
          column: warning.column,
          startLine: warning.startLine,
          endLine: warning.endLine,
        }));
      }
    }
    return Object.freeze([...groups.values()].map((group) => Object.freeze({
      ...group,
      instances: Object.freeze(group.instances),
    })));
  }

  return { createWarning, groupWarnings, warningCodes };
};
