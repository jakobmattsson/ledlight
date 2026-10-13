#!/usr/bin/env node
'use strict';

const { createRepositoryContainer } = require('./composition/repository-container');

createRepositoryContainer(__dirname, 'modules').resolve('cli').run();
