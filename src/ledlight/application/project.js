'use strict';

module.exports = ({
  fs,
  path,
  accountDetails: {
    queryAccountBalances,
    queryAccountPostings,
    queryAccountTransactions,
    queryLedgerAccounts,
    queryLedgerTransaction,
  },
  aggregateReport: { queryAggregateReport },
  balanceHistoryReport: { queryBalanceHistoryReport },
  commodityDescriptions: { queryCommodityDescriptions },
  gainReport: { queryGainReport },
  investmentPerformanceReport: { queryInvestmentPerformance },
  valuationRates: { queryLedgerValuationRateResolver },
  transactionReport: { queryLedgerTransactions },
  database: { ensureDatabaseCurrent },
  publicErrors: { createError, databaseError, errorCodes },
}) => {

  const DATABASE_RELATIVE_PATH = path.join('tmp', 'ledger.sqlite');
  const projectConfigurationError = (message) =>
    createError(errorCodes.PROJECT_CONFIGURATION, message);

  function queryDatabase(operation) {
    try {
      return operation();
    } catch (error) {
      throw databaseError(error);
    }
  }

  function findProjectRoot(startDirectory) {
    let directory = path.resolve(startDirectory ?? process.cwd());
    while (true) {
      if (fs.existsSync(path.join(directory, '.ledgerrc'))) return directory;
      const parent = path.dirname(directory);
      if (parent === directory) throw projectConfigurationError('Could not find .ledgerrc in this directory or any parent');
      directory = parent;
    }
  }

  function optionValue(rawValue, ledgerRcPath) {
    const value = rawValue.trim();
    if (!value) throw projectConfigurationError(`Missing --file value in ${ledgerRcPath}`);
    if (value[0] === '"' || value[0] === "'") {
      if (value.at(-1) !== value[0]) throw projectConfigurationError(`Unterminated quoted --file value in ${ledgerRcPath}`);
      return value.slice(1, -1);
    }
    return value;
  }

  function journalPathFromLedgerRc(projectRoot) {
    const ledgerRcPath = path.join(projectRoot, '.ledgerrc');
    const source = fs.readFileSync(ledgerRcPath, 'utf8');
    const values = [];
    for (const rawLine of source.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;
      const match = /^--file(?:\s+|=)(.*)$/u.exec(line);
      if (match) values.push(optionValue(match[1], ledgerRcPath));
    }
    if (values.length === 0) throw projectConfigurationError(`No --file option found in ${ledgerRcPath}`);
    if (values.length > 1) throw projectConfigurationError(`Multiple --file options found in ${ledgerRcPath}`);
    return path.resolve(projectRoot, values[0]);
  }

  function loadProjectPaths(startDirectory) {
    const projectRoot = findProjectRoot(startDirectory);
    return {
      projectRoot,
      journalPath: journalPathFromLedgerRc(projectRoot),
      databasePath: path.join(projectRoot, DATABASE_RELATIVE_PATH),
    };
  }

  function ensureProjectDatabaseCurrent(startDirectory) {
    const paths = loadProjectPaths(startDirectory);
    fs.mkdirSync(path.dirname(paths.databasePath), { recursive: true });
    return { ...paths, ...ensureDatabaseCurrent(paths.databasePath, paths.journalPath) };
  }

  function aggregateReport(options, startDirectory) {
    return openProject(startDirectory).aggregateReport(options);
  }

  function balanceHistoryReport(options, startDirectory) {
    return openProject(startDirectory).balanceHistoryReport(options);
  }

  function investmentPerformance(options, startDirectory) {
    return openProject(startDirectory).investmentPerformance(options);
  }

  function gainReport(options, startDirectory) {
    return openProject(startDirectory).gainReport(options);
  }

  function accountBalances(options, startDirectory) {
    return openProject(startDirectory).accountBalances(options);
  }

  function accountPostings(options, startDirectory) {
    return openProject(startDirectory).accountPostings(options);
  }

  function openProject(startDirectory) {
    const current = ensureProjectDatabaseCurrent(startDirectory);
    const valuationPriceCache = new Map();
    let ledgerValuationRateResolver;
    return {
      ...current,
      accountBalances(options) {
        return queryDatabase(() => queryAccountBalances(current.databasePath, options));
      },
      accountPostings(options) {
        return queryDatabase(() => queryAccountPostings(current.databasePath, options));
      },
      accountTransactions(options) {
        return queryDatabase(() => queryAccountTransactions(current.databasePath, options));
      },
      aggregateReport(options) {
        return queryDatabase(() => queryAggregateReport(current.databasePath, options, { valuationPriceCache }));
      },
      balanceHistoryReport(options) {
        return queryDatabase(() => queryBalanceHistoryReport(current.databasePath, options));
      },
      commodityDescriptions() {
        return queryDatabase(() => queryCommodityDescriptions(current.databasePath));
      },
      gainReport(options) {
        return queryDatabase(() => queryGainReport(current.databasePath, options, { valuationPriceCache }));
      },
      investmentPerformance(options) {
        return queryDatabase(() => queryInvestmentPerformance(current.databasePath, options));
      },
      ledgerValuationRateResolver() {
        ledgerValuationRateResolver ??= queryDatabase(() => queryLedgerValuationRateResolver(current.databasePath));
        return ledgerValuationRateResolver;
      },
      ledgerAccounts() {
        return queryDatabase(() => queryLedgerAccounts(current.databasePath));
      },
      ledgerTransaction(options) {
        return queryDatabase(() => queryLedgerTransaction(current.databasePath, options));
      },
      ledgerTransactions(options) {
        return queryDatabase(() => queryLedgerTransactions(current.databasePath, options));
      },
    };
  }

  return {
    accountBalances,
    accountPostings,
    aggregateReport,
    balanceHistoryReport,
    gainReport,
    investmentPerformance,
    ensureProjectDatabaseCurrent,
    loadProjectPaths,
    openProject,
  };
};
