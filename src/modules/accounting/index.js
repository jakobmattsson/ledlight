'use strict';

module.exports = ({ resolve }) => Object.freeze(Object.fromEntries([
  'commodityMovements', 'effectivePostingCosts', 'globalAccountingValidator',
  'journalValidator', 'journalValuationCommodity', 'postingResolver',
].map((name) => [name, resolve(name)])));
