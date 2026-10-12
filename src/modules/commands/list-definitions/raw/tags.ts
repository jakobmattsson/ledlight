'use strict';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show tags',
  examples: [
    'ledlight tags --file main.ledger',
    'ledlight tags --file main.ledger --usage unused',
  ],
  configure(command: any) {
    options.journal(command);
    options.usage(command, 'tag declarations');
    options.format(command);
  },
  prepareOutput(rows: any) {
    return rows.map(({ tag }: any) => tag);
  },
  formatCsv(names: any, _cliOptions: any, { csvField }: any) {
    return `${['tag', ...names.map(csvField)].join('\n')}\n`;
  },
  formatText(names: any) {
    return names.length === 0 ? '' : `${names.join('\n')}\n`;
  },
});
