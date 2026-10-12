'use strict';

module.exports = ({ reportCommand, cliFormat, output }) => ({
  run(args) {
    let result;
    try {
      result = reportCommand.run(args);
    } catch (error) {
      output.writeError(`${error.message}\n`);
      return 1;
    }
    output.writeOutput(result.output);
    const warnings = cliFormat.formatWarnings(result.warnings);
    if (warnings !== '') output.writeError(warnings);
    return 0;
  },
});
