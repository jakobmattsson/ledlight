'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show tags',
  examples: [
    'ledlight tags --file main.ledger',
    'ledlight tags --file main.ledger --usage unused',
  ],
  configure(command) {
    options.journal(command);
    options.usage(command, 'tag declarations');
    options.format(command);
  },
  prepareOutput(rows) {
    return rows.map(({ tag }) => tag);
  },
  formatCsv(names, _cliOptions, { csvField }) {
    return `${['tag', ...names.map(csvField)].join('\n')}\n`;
  },
  formatText(names) {
    return names.length === 0 ? '' : `${names.join('\n')}\n`;
  },
});
