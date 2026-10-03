'use strict';

const { createRepositoryContainer } = require('./src/composition/repository-container');

const { openJournal } = createRepositoryContainer().resolve('project');

module.exports = { openJournal };
