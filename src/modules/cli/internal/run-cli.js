'use strict';

module.exports = ({
  executeCli,
  output,
  external: {
    processRuntime
  },
}) => ({
  run() {
    output.handleBrokenPipe();
    const exitCode = executeCli.run(processRuntime.commandLineArguments());
    if (exitCode !== 0) processRuntime.setExitCode(exitCode);
  },
});
