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
  investmentPerformanceReport: { queryInvestmentPerformance },
  sekRates: { queryLedgerSekRateResolver },
  transactionReport: { queryLedgerTransactions },
  database: { ensureDatabaseCurrent },
}) => {

  const DATABASE_RELATIVE_PATH = path.join('tmp', 'ledger.sqlite');

  function findProjectRoot(startDirectory) {
    let directory = path.resolve(startDirectory ?? process.cwd());
    while (true) {
      if (fs.existsSync(path.join(directory, '.ledgerrc'))) return directory;
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error('Could not find .ledgerrc in this directory or any parent');
      directory = parent;
    }
  }

  function optionValue(rawValue, ledgerRcPath) {
    const value = rawValue.trim();
    if (!value) throw new Error(`Missing --file value in ${ledgerRcPath}`);
    if (value[0] === '"' || value[0] === "'") {
      if (value.at(-1) !== value[0]) throw new Error(`Unterminated quoted --file value in ${ledgerRcPath}`);
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
    if (values.length === 0) throw new Error(`No --file option found in ${ledgerRcPath}`);
    if (values.length > 1) throw new Error(`Multiple --file options found in ${ledgerRcPath}`);
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

  function accountBalances(options, startDirectory) {
    return openProject(startDirectory).accountBalances(options);
  }

  function accountPostings(options, startDirectory) {
    return openProject(startDirectory).accountPostings(options);
  }

  function openProject(startDirectory) {
    const current = ensureProjectDatabaseCurrent(startDirectory);
    const sekPriceCache = new Map();
    let ledgerSekRateResolver;
    return {
      ...current,
      accountBalances(options) {
        return queryAccountBalances(current.databasePath, options);
      },
      accountPostings(options) {
        return queryAccountPostings(current.databasePath, options);
      },
      accountTransactions(options) {
        return queryAccountTransactions(current.databasePath, options);
      },
      aggregateReport(options) {
        return queryAggregateReport(current.databasePath, options, { sekPriceCache });
      },
      balanceHistoryReport(options) {
        return queryBalanceHistoryReport(current.databasePath, options);
      },
      investmentPerformance(options) {
        return queryInvestmentPerformance(current.databasePath, options);
      },
      ledgerSekRateResolver() {
        ledgerSekRateResolver ??= queryLedgerSekRateResolver(current.databasePath);
        return ledgerSekRateResolver;
      },
      ledgerAccounts() {
        return queryLedgerAccounts(current.databasePath);
      },
      ledgerTransaction(options) {
        return queryLedgerTransaction(current.databasePath, options);
      },
      ledgerTransactions(options) {
        return queryLedgerTransactions(current.databasePath, options);
      },
    };
  }

  return {
    accountBalances,
    accountPostings,
    aggregateReport,
    balanceHistoryReport,
    investmentPerformance,
    ensureProjectDatabaseCurrent,
    loadProjectPaths,
    openProject,
  };
};
