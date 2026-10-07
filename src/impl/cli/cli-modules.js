'use strict';

const { createRepositoryContainer } = require('../composition/repository-container');

function loadCliModules() {
  const container = createRepositoryContainer();
  return {
    reportCommand: container.resolve('reportCommand'),
    output: container.resolve('output'),
    cliFormat: container.resolve('cliFormat'),
  };
}

module.exports = { loadCliModules };
