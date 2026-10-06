'use strict';

const { createRepositoryContainer } = require('./composition/repository-container');

const { openJournal } = createRepositoryContainer().resolve('project');

module.exports = { openJournal };
