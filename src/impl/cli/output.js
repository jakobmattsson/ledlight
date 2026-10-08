'use strict';

module.exports = ({ processRuntime: { exit, standardOutput, standardError } }) => ({
  handleBrokenPipe() {
    standardOutput.on('error', (error) => {
      if (error.code === 'EPIPE') {
        exit(0);
        return;
      }
      throw error;
    });
  },
  writeError: (value) => standardError.write(value),
  writeOutput: (value) => standardOutput.write(value),
});
