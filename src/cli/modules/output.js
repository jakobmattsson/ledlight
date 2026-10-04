'use strict';

module.exports = () => ({
  handleBrokenPipe() {
    process.stdout.on('error', (error) => {
      if (error.code === 'EPIPE') process.exit(0);
      throw error;
    });
  },
  writeWarnings(warnings) {
    if (warnings.length > 0) process.stderr.write(`${JSON.stringify(warnings, null, 2)}\n`);
  },
  writeError: (value) => process.stderr.write(value),
  writeOutput: (value) => process.stdout.write(value),
});
