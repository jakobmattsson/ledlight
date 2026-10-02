'use strict';

module.exports = ({
  project: { openProject },
  cliArguments: { parseArguments },
  cliFormat: {
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatInvestmentPerformance,
    formatInvestmentPerformanceJson,
    invertBalanceHistory,
    invertRows,
  },
}) => {

  function runReportCommand(arguments_, { project, startDirectory }) {
    const [command] = arguments_;
    if (command === 'investment-performance') {
      const { reportOptions, json } = parseArguments(arguments_);
      const report = (project ?? openProject(startDirectory)).investmentPerformance(reportOptions);
      return json
        ? formatInvestmentPerformanceJson(report)
        : formatInvestmentPerformance(report);
    }

    const { reportOptions, csv, invert } = parseArguments(arguments_);
    const currentProject = project ?? openProject(startDirectory);
    if (command === 'balance-history') {
      const balanceRows = currentProject.balanceHistoryReport(reportOptions);
      const reportRows = invert ? invertBalanceHistory(balanceRows) : balanceRows;
      return csv
        ? formatBalanceHistoryCsv(reportRows)
        : formatBalanceHistoryHumanReadable(reportRows);
    }
    const aggregateRows = currentProject.aggregateReport(reportOptions);
    const reportRows = invert ? invertRows(aggregateRows) : aggregateRows;
    return csv
      ? formatCsv(reportRows, reportOptions.inSek)
      : formatHumanReadable(reportRows, reportOptions.inSek);
  }

  return { runReportCommand };
};
