'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'pretty-print the complete journal',
  configure(command) {
    options.journal(command);
    options.addValue(command, '--density <density>', 'select compact or spacious spacing', {
      choices: ['compact', 'spacious'], defaultValue: 'spacious',
    });
    options.addBoolean(command, '--sort-declarations', 'group declarations before transactions');
  },
  formatText(result) {
    return result;
  },
});
