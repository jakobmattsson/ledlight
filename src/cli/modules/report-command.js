'use strict';

module.exports = ({
  cliCommand: { runReportCommandWithWarnings },
}) => ({
  run: (arguments_) => runReportCommandWithWarnings(arguments_),
});
