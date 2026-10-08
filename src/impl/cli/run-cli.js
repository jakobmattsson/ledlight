'use strict';

module.exports = ({ executeCli, output, processRuntime }) => ({
  run() {
    output.handleBrokenPipe();
    const exitCode = executeCli.run(processRuntime.commandLineArguments());
    if (exitCode !== 0) processRuntime.setExitCode(exitCode);
  },
});
