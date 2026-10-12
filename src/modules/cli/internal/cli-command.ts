'use strict';

module.exports = ({
  commands: { definitions: commands },
  project,
  cliStdinJournal,
  cliArguments: { parseArguments, usage },
  cliFormat,
  external: {
    packageMetadata: { version }
  },
}: any) => {
  const commandByName = new Map(commands.map((command: any) => [command.name, command]));
  let lastWarnings: any = [];

  function runReportCommand(arguments_: any, stdinSource: any) {
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
    const run = (journal: any) => {
      lastWarnings = journal.warnings || [];
      const command = commandByName.get(parsed.command);
      if (!command) throw new Error(`Unsupported command: ${parsed.command}`);
      const query = journal[(command as any).operation];
      if (typeof query !== 'function') {
        throw new Error(`Unsupported API operation: ${(command as any).operation}`);
      }
      const result = query.call(journal, parsed.options);
      const output = (command as any).prepareOutput
        ? (command as any).prepareOutput(result, parsed.cliOptions, cliFormat)
        : result;
      if (parsed.cliOptions.format === 'json') return cliFormat.formatJson(output);
      const formatData = (command as any).loadFormatData && parsed.cliOptions.format === 'text'
        ? (command as any).loadFormatData(journal)
        : undefined;
      return parsed.cliOptions.format === 'csv'
        ? (command as any).formatCsv(output, parsed.cliOptions, cliFormat)
        : (command as any).formatText(output, parsed.cliOptions, cliFormat, formatData);
    };
    return parsed.journalPath === '-'
      ? cliStdinJournal.withJournal(stdinSource, run)
      : run(project.openJournal(parsed.journalPath));
  }

  function runReportCommandWithWarnings(arguments_: any, stdinSource: any) {
    lastWarnings = [];
    const output = runReportCommand(arguments_, stdinSource);
    return { output, warnings: lastWarnings };
  }

  return { runReportCommand, runReportCommandWithWarnings };
};
