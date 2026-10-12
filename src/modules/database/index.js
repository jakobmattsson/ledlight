'use strict';

module.exports = ({ resolve }) => Object.freeze(Object.fromEntries([
  'database', 'databaseReader', 'journalWriter', 'readModelContract',
].map((name) => [name, resolve(name)])));
