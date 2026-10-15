#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRepositoryContainer } = require('@jakobm/portico');

createRepositoryContainer(path.join(__dirname, 'modules')).resolve('cli').run();
