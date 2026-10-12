'use strict';

module.exports = ({ resolve }) => Object.freeze(Object.fromEntries([
  'apiOptions', 'cachePaths', 'configuration', 'decimal', 'linearProgram',
  'publicErrors', 'rational', 'reportTotals', 'valuationRateResolver',
].map((name) => [name, resolve(name)])));
