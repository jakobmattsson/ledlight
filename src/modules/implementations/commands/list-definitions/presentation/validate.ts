'use strict';

import type { Command } from 'commander';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'check the journal and show any errors or warnings',
  examples: ['ledlight validate --file main.ledger'],
  configure(command: Command) {
    options.journal(command);
  },
  formatText(result: string) {
    return result;
  },
});
