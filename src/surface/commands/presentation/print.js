'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'pretty-print the complete journal',
  parameterless: true,
  configure(command) {
    options.journal(command);
  },
  formatText(result) {
    return result;
  },
});
