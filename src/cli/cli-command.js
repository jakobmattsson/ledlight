'use strict';

module.exports = ({
  ledlight,
  packageMetadata: { version },
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

  function jsonJournalSnapshot(journal) {
    return Object.fromEntries(Object.entries(journal).filter(([, value]) => typeof value !== 'function'));
  }

  function runJsonCommand(parsed) {
    const { command, journalPath, options } = parsed;
    if (command === 'database-path') return formatJson(ledlight.databasePathForJournal(journalPath));
    if (command === 'ensure-database') {
      return formatJson(ledlight.ensureDatabaseCurrent(journalPath));
    }
    if (command === 'open-journal') {
      return formatJson(jsonJournalSnapshot(ledlight.openJournal(journalPath)));
    }
    if (command === 'account-balances') {
      return formatJson(ledlight.accountBalances(journalPath, options));
    }
    if (command === 'account-postings') {
      return formatJson(ledlight.accountPostings(journalPath, options));
    }

    const journal = ledlight.openJournal(journalPath);
    if (command === 'account-transactions') return formatJson(journal.accountTransactions(options));
    if (command === 'commodity-descriptions') return formatJson(journal.commodityDescriptions());
    if (command === 'ledger-accounts') return formatJson(journal.ledgerAccounts());
    if (command === 'ledger-transaction') return formatJson(journal.ledgerTransaction(options));
    if (command === 'ledger-transactions') return formatJson(journal.ledgerTransactions(options));
    if (command === 'valuation-rate') {
      return formatJson(journal.ledgerValuationRateResolver()(options.commodity, options.throughDate));
    }
    throw new Error(`Unsupported command: ${command}`);
  }

  function runReport(parsed) {
    const { command, reportOptions, journalPath, output } = parsed;
    const journal = ledlight.openJournal(journalPath);
    if (command === 'investment-performance') {
      const report = journal.investmentPerformance(reportOptions);
      return output.json
        ? formatJson(report)
        : formatInvestmentPerformance(report, journal.commodityDescriptions());
    }
    if (command === 'gain') {
      const rows = journal.gainReport(reportOptions);
      if (output.json) return formatJson(rows);
      return output.csv
        ? formatCsv(rows, true)
        : formatHumanReadable(rows, true, journal.commodityDescriptions());
    }
    if (command === 'balance-history') {
      const rows = journal.balanceHistoryReport(reportOptions);
      if (output.json) return formatJson(rows);
      return output.csv
        ? formatBalanceHistoryCsv(rows)
        : formatBalanceHistoryHumanReadable(rows, journal.commodityDescriptions());
    }
    const aggregateOptions = {
      ...reportOptions,
      includeTotal: reportOptions.includeTotal ??
        (!output.csv && !output.json && reportOptions.inValuationCommodity),
    };
    const rows = journal.aggregateReport(aggregateOptions);
    if (output.json) return formatJson(rows);
    return output.csv
      ? formatCsv(rows, reportOptions.inValuationCommodity)
      : formatHumanReadable(
        rows,
        reportOptions.inValuationCommodity,
        journal.commodityDescriptions(),
      );
  }

  function runReportCommand(arguments_) {
    if (arguments_.length === 0 ||
        (arguments_.length === 1 && ['--help', '-h'].includes(arguments_[0]))) {
      return `${usage()}\n`;
    }
    if (arguments_.length === 1 && ['--version', '-V'].includes(arguments_[0])) {
      return `${version}\n`;
    }
    if (arguments_.length >= 2 && arguments_.slice(1).some((argument) => ['--help', '-h'].includes(argument))) {
      return `${usage(arguments_[0])}\n`;
    }
    const parsed = parseArguments(arguments_);
    return ['aggregate', 'balance-history', 'gain', 'investment-performance'].includes(parsed.command)
      ? runReport(parsed)
      : runJsonCommand(parsed);
  }

  return { runReportCommand };
};
