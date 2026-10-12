'use strict';

module.exports = ({
  external: {
    processRuntime: { exit, standardOutput, standardError }
  },
}: any) => ({
  handleBrokenPipe() {
    standardOutput.on('error', (error: any) => {
      if (error.code === 'EPIPE') {
        exit(0);
        return;
      }
      throw error;
    });
  },
  writeError: (value: any) => standardError.write(value),
  writeOutput: (value: any) => standardOutput.write(value),
});
