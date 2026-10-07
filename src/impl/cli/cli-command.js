'use strict';

module.exports = ({
  commands,
  project,
  cliStdinJournal,
  packageMetadata: { version },
  cliArguments: { parseArguments, usage },
  cliFormat,
}) => {
  const commandByName = new Map(commands.map((command) => [command.name, command]));
  let lastWarnings = [];

  function runReportCommand(arguments_, stdinSource) {
    if (arguments_.length === 0 ||
        (arguments_.length === 1 && arguments_[0] === '--help')) {
      return `${usage()}\n`;
    }
    if (arguments_.length === 1 && arguments_[0] === '--version') {
      return `${version}\n`;
    }
    if (arguments_.length >= 2 && arguments_.slice(1).includes('--help')) {
      return `${usage(arguments_[0])}\n`;
    }
    const parsed = parseArguments(arguments_);
    const run = (journal) => {
      lastWarnings = journal.warnings || [];
      const command = commandByName.get(parsed.command);
      if (!command) throw new Error(`Unsupported command: ${parsed.command}`);
      const query = journal[command.operation];
      if (typeof query !== 'function') {
        throw new Error(`Unsupported API operation: ${command.operation}`);
      }
      const result = command.parameterless
        ? query.call(journal)
        : query.call(journal, parsed.options);
      const output = command.prepareOutput
        ? command.prepareOutput(result, parsed.cliOptions, cliFormat)
        : result;
      if (parsed.cliOptions.format === 'json') return cliFormat.formatJson(output);
      const formatData = command.loadFormatData && parsed.cliOptions.format === 'text'
        ? command.loadFormatData(journal)
        : undefined;
      return parsed.cliOptions.format === 'csv'
        ? command.formatCsv(output, parsed.cliOptions, cliFormat)
        : command.formatText(output, parsed.cliOptions, cliFormat, formatData);
    };
    return parsed.journalPath === '-'
      ? cliStdinJournal.withJournal(stdinSource, run)
      : run(project.openJournal(parsed.journalPath));
  }

  function runReportCommandWithWarnings(arguments_, stdinSource) {
    lastWarnings = [];
    const output = runReportCommand(arguments_, stdinSource);
    return { output, warnings: lastWarnings };
  }

  return { runReportCommand, runReportCommandWithWarnings };
};
