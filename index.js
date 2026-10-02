'use strict';

const { createRepositoryContainer } = require('./src/composition/repository-container');

module.exports = createRepositoryContainer().resolve('ledlight');
