'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'check the journal and show any errors or warnings',
  examples: ['ledlight validate --file main.ledger'],
  configure(command) {
    options.journal(command);
  },
  formatText(result) {
    return result;
  },
});
