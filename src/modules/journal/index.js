'use strict';

module.exports = ({ resolve }) => Object.freeze(Object.fromEntries([
  'ingestionWarning', 'journal', 'journalManifest', 'ledgerParser',
].map((name) => [name, resolve(name)])));
