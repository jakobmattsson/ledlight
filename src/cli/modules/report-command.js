'use strict';

module.exports = ({
  cliCommand: { runReportCommand },
}) => ({
  run: (arguments_) => runReportCommand(arguments_),
});
