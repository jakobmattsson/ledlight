'use strict';

module.exports = ({
  ledlight,
  cliArguments: { parseArguments, usage },
  cliFormat: {
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatInvestmentPerformance,
    formatJson,
  },
}) => {

  function jsonProjectSnapshot(project) {
    return Object.fromEntries(Object.entries(project).filter(([, value]) => typeof value !== 'function'));
  }

  function runJsonCommand(parsed) {
    const { command, startDirectory, options } = parsed;
    if (command === 'parse') return formatJson(ledlight.parse(...parsed.arguments));
    if (command === 'load-journal') return formatJson(ledlight.loadJournal(...parsed.arguments));
    if (command === 'project-paths') return formatJson(ledlight.loadProjectPaths(startDirectory));
    if (command === 'ensure-database') {
      return formatJson(ledlight.ensureProjectDatabaseCurrent(startDirectory));
    }
    if (command === 'open-project') {
      return formatJson(jsonProjectSnapshot(ledlight.openProject(startDirectory)));
    }
    if (command === 'account-balances') {
      return formatJson(ledlight.accountBalances(options, startDirectory));
    }
    if (command === 'account-postings') {
      return formatJson(ledlight.accountPostings(options, startDirectory));
    }

    const project = ledlight.openProject(startDirectory);
    if (command === 'account-transactions') return formatJson(project.accountTransactions(options));
    if (command === 'commodity-descriptions') return formatJson(project.commodityDescriptions());
    if (command === 'ledger-accounts') return formatJson(project.ledgerAccounts());
    if (command === 'ledger-transaction') return formatJson(project.ledgerTransaction(options));
    if (command === 'ledger-transactions') return formatJson(project.ledgerTransactions(options));
    if (command === 'valuation-rate') {
      return formatJson(project.ledgerValuationRateResolver()(options.commodity, options.throughDate));
    }
    throw new Error(`Unsupported command: ${command}`);
  }

  function runReport(parsed) {
    const { command, reportOptions, startDirectory, output } = parsed;
    const project = ledlight.openProject(startDirectory);
    if (command === 'investment-performance') {
      const report = project.investmentPerformance(reportOptions);
      return output.json
        ? formatJson(report)
        : formatInvestmentPerformance(report, project.commodityDescriptions());
    }
    if (command === 'gain') {
      const rows = project.gainReport(reportOptions);
      if (output.json) return formatJson(rows);
      return output.csv
        ? formatCsv(rows, true)
        : formatHumanReadable(rows, true, project.commodityDescriptions());
    }
    if (command === 'balance-history') {
      const rows = project.balanceHistoryReport(reportOptions);
      if (output.json) return formatJson(rows);
      return output.csv
        ? formatBalanceHistoryCsv(rows)
        : formatBalanceHistoryHumanReadable(rows, project.commodityDescriptions());
    }
    const aggregateOptions = {
      ...reportOptions,
      includeTotal: reportOptions.includeTotal ??
        (!output.csv && !output.json && reportOptions.inValuationCommodity),
    };
    const rows = project.aggregateReport(aggregateOptions);
    if (output.json) return formatJson(rows);
    return output.csv
      ? formatCsv(rows, reportOptions.inValuationCommodity)
      : formatHumanReadable(
        rows,
        reportOptions.inValuationCommodity,
        project.commodityDescriptions(),
      );
  }

  function runReportCommand(arguments_, { startDirectory }) {
    if (arguments_.length === 1 && (arguments_[0] === '--help' || arguments_[0] === '-h')) {
      return `${usage()}\n`;
    }
    if (arguments_.length === 1 && arguments_[0] === '--version') return `${ledlight.version}\n`;
    const parsed = parseArguments(arguments_);
    if (parsed.startDirectory === undefined) parsed.startDirectory = startDirectory;
    return ['aggregate', 'balance-history', 'gain', 'investment-performance'].includes(parsed.command)
      ? runReport(parsed)
      : runJsonCommand(parsed);
  }

  return { runReportCommand };
};
