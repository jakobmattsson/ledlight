'use strict';

module.exports = ({
  ledlight: {
    aggregateReport,
    balanceHistoryReport,
    investmentPerformance,
  },
  cliArguments: { parseArguments },
  cliFormat: {
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatInvestmentPerformance,
    formatInvestmentPerformanceJson,
  },
}) => {

  function runReportCommand(arguments_, { startDirectory }) {
    const [command] = arguments_;
    if (command === 'investment-performance') {
      const { reportOptions, json } = parseArguments(arguments_);
      const report = investmentPerformance(reportOptions, startDirectory);
      return json
        ? formatInvestmentPerformanceJson(report)
        : formatInvestmentPerformance(report);
    }

    const { reportOptions, csv } = parseArguments(arguments_);
    if (command === 'balance-history') {
      const reportRows = balanceHistoryReport(reportOptions, startDirectory);
      return csv
        ? formatBalanceHistoryCsv(reportRows)
        : formatBalanceHistoryHumanReadable(reportRows);
    }
    const reportRows = aggregateReport({
      ...reportOptions,
      includeTotal: !csv && reportOptions.inValuationCommodity,
    }, startDirectory);
    return csv
      ? formatCsv(reportRows, reportOptions.inValuationCommodity)
      : formatHumanReadable(reportRows, reportOptions.inValuationCommodity);
  }

  return { runReportCommand };
};
