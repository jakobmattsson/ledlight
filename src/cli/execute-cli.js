'use strict';

function executeCli(reportCommand, args) {
  try {
    const result = reportCommand.run(args);
    return { output: result.output, warnings: result.warnings, error: '', exitCode: 0 };
  } catch (error) {
    return { output: '', warnings: [], error: `${error.message}\n`, exitCode: 1 };
  }
}

module.exports = { executeCli };
