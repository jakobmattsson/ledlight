'use strict';

export = ({
  executeCli,
  output,
  external: {
    processRuntime
  },
}: any) => ({
  run() {
    output.handleBrokenPipe();
    const exitCode = executeCli.run(processRuntime.commandLineArguments());
    if (exitCode !== 0) processRuntime.setExitCode(exitCode);
  },
});
