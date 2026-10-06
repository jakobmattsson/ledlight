'use strict';

function executeCli({ reportCommand, output }, arguments_) {
  try {
    const result = reportCommand.run(arguments_);
    output.writeOutput(result.output);
    output.writeWarnings(result.warnings);
    return 0;
  } catch (error) {
    output.writeError(`${error.message}\n`);
    return 1;
  }
}

module.exports = { executeCli };
