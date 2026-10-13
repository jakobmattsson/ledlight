'use strict';

module.exports = ({
  external: {
    processRuntime: { exit, standardOutput, standardError }
  },
}: any) => ({
  handleBrokenPipe() {
    standardOutput.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') {
        exit(0);
        return;
      }
      throw error;
    });
  },
  writeError: (value: string) => standardError.write(value),
  writeOutput: (value: string) => standardOutput.write(value),
});
