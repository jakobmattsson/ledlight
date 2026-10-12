'use strict';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'pretty-print the complete journal',
  examples: [
    'ledlight print --file main.ledger',
    'ledlight print --file main.ledger --density compact --sort-declarations',
  ],
  configure(command: any) {
    options.journal(command);
    options.addValue(command, '--density <density>', 'control blank lines between journal entries', {
      choices: ['compact', 'spacious'], defaultValue: 'spacious',
    });
    options.addBoolean(command, '--sort-declarations', 'print declarations and prices before transactions');
  },
  formatText(result: any) {
    return result;
  },
});
