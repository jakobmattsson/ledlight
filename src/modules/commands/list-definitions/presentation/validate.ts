'use strict';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'check the journal and show any errors or warnings',
  examples: ['ledlight validate --file main.ledger'],
  configure(command: any) {
    options.journal(command);
  },
  formatText(result: any) {
    return result;
  },
});
