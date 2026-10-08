'use strict';

const { createRepositoryContainer } = require('./composition/repository-container');

createRepositoryContainer().resolve('runCli').run();
