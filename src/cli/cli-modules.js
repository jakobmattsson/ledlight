'use strict';

const path = require('node:path');
const { loadApplicationModules } = require('../lib/application-modules');

function loadCliModules(directory) {
  return loadApplicationModules({
    directory: directory || path.join(__dirname, 'modules'),
    patterns: ['*.js'],
  });
}

module.exports = { loadCliModules };
