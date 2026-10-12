'use strict';

module.exports = ({ database, databaseReader, journalWriter, readModelContract }) =>
  Object.freeze({ database, databaseReader, journalWriter, readModelContract });
