#!/usr/bin/env node
'use strict';

const { createRepositoryContainer } = require('@jakobm/portico');

createRepositoryContainer(__dirname, 'modules').resolve('cli').run();
