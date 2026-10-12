'use strict';

module.exports = ({
  cliCommand: { runReportCommandWithWarnings },
  cliArguments: { apiCommands },
  external: {
    standardInput
  },
}: any) => {
  function run(arguments_: string[]) {
    const hasFile = arguments_.some((argument: string) =>
      argument === '--file' || argument.startsWith('--file='));
    const readsJournal = Object.values(apiCommands).includes(arguments_[0]) &&
      !arguments_.includes('--help');
    let source;
    if (readsJournal && !hasFile && !standardInput.isTTY()) {
      source = standardInput.read();
      if (source.length > 0) {
        arguments_ = [arguments_[0], '--file', '-', ...arguments_.slice(1)];
      }
    }
    return runReportCommandWithWarnings(arguments_, source);
  }
  return { run };
};
