'use strict';

module.exports = () => ({
  handleBrokenPipe() {
    process.stdout.on('error', (error) => {
      if (error.code === 'EPIPE') process.exit(0);
      throw error;
    });
  },
  writeError: (value) => process.stderr.write(value),
  writeOutput: (value) => process.stdout.write(value),
});
