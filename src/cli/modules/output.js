'use strict';

module.exports = ({ cliFormat: { formatWarnings } }) => ({
  handleBrokenPipe() {
    process.stdout.on('error', (error) => {
      if (error.code === 'EPIPE') process.exit(0);
      throw error;
    });
  },
  writeWarnings(warnings) {
    const output = formatWarnings(warnings);
    if (output !== '') process.stderr.write(output);
  },
  writeError: (value) => process.stderr.write(value),
  writeOutput: (value) => process.stdout.write(value),
});
