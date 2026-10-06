'use strict';

const options = require('./options');

module.exports = {
  name: 'tags', operation: 'tags', group: 'raw', description: 'show tags',
  configure(command) {
    options.journal(command);
    options.usage(command, 'tags declarations');
    options.format(command);
  },
  parse({ usage, format }) {
    return { options: { usage }, output: { format } };
  },
  run({ options: input, output }, journal, format) {
    return format.formatTags(journal.tags(input), output);
  },
  formatters(shared) {
    const { formatNameRows } = shared;

    const formatTags = (rows, output) => formatNameRows(rows, output, 'tag');
    return { formatTags };
  },
};
