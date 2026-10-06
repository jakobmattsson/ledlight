'use strict';

const commands = [
  require('./accounts'),
  require('./tags'),
  require('./commodities'),
  require('./prices'),
  require('./transactions'),
  require('./postings'),
  require('./aggregate'),
  require('./balance-history'),
  require('./unrealized-gains'),
  require('./investment-performance'),
];

module.exports = Object.freeze(commands);
