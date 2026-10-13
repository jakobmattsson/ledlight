'use strict';

module.exports = ({ reportCommand, cliFormat, output }: any) => ({
  run(args: string[]) {
    let result;
    try {
      result = reportCommand.run(args);
    } catch (error) {
      output.writeError(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    output.writeOutput(result.output);
    const warnings = cliFormat.formatWarnings(result.warnings);
    if (warnings !== '') output.writeError(warnings);
    return 0;
  },
});
