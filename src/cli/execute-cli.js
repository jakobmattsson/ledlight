'use strict';

function executeCli(reportCommand, arguments_) {
  try {
    const result = reportCommand.run(arguments_);
    return { output: result.output, warnings: result.warnings, error: '', exitCode: 0 };
  } catch (error) {
    return { output: '', warnings: [], error: `${error.message}\n`, exitCode: 1 };
  }
}

module.exports = { executeCli };
