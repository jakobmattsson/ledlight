'use strict';

module.exports = ({
  cachePaths: { pathsForJournal },
  fs,
  path,
  queries,
  valuationRates: { queryLedgerValuationRateResolver, resolverInputNames },
  database: { ensureDatabaseCurrent },
  databaseReader: { readDatabase },
  publicErrors: { createError, databaseError, errorCodes },
}) => {

  const queryByName = new Map(queries.map((query) => [query.name, query]));
  const query = (name) => {
    const definition = queryByName.get(name);
    if (!definition) throw new Error(`Unknown query: ${name}`);
    return definition;
  };
  const {
    inputSchema: accountBalancesOptionsSchema,
    execute: queryAccountBalances,
  } = query('accountBalances');
  const {
    inputSchema: accountPostingsOptionsSchema,
    execute: queryAccountPostings,
  } = query('accountPostings');
  const {
    inputSchema: accountTransactionsOptionsSchema,
    execute: queryAccountTransactions,
  } = query('accountTransactions');
  const {
    inputSchema: aggregateReportOptionsSchema,
    execute: queryAggregate,
  } = query('aggregateReport');
  const {
    inputSchema: balanceHistoryOptionsSchema,
    execute: queryBalanceHistory,
  } = query('balanceHistoryReport');
  const {
    inputSchema: commodityDescriptionsOptionsSchema,
    execute: queryCommodityDescriptions,
  } = query('commodityDescriptions');
  const { inputSchema: gainReportOptionsSchema, execute: queryGain } = query('gainReport');
  const {
    inputSchema: investmentPerformanceOptionsSchema,
    execute: queryInvestmentPerformance,
  } = query('investmentPerformance');
  const {
    inputSchema: ledgerAccountsOptionsSchema,
    execute: queryLedgerAccounts,
  } = query('ledgerAccounts');
  const {
    inputSchema: ledgerTransactionOptionsSchema,
    execute: queryLedgerTransaction,
  } = query('ledgerTransaction');
  const {
    inputSchema: ledgerTransactionsOptionsSchema,
    execute: queryLedgerTransactions,
  } = query('ledgerTransactions');
  const {
    inputSchema: reconciliationEntriesOptionsSchema,
    execute: queryReconciliationEntries,
  } = query('reconciliationEntries');
  const schemaInputs = (schema) => Object.keys(schema.shape);
  const journalInputs = (schema) => ['journalPath', ...schemaInputs(schema)];
  const apiDefinitions = Object.freeze({
    accountBalances: { inputs: journalInputs(accountBalancesOptionsSchema) },
    accountPostings: { inputs: journalInputs(accountPostingsOptionsSchema) },
    aggregateReport: { inputs: journalInputs(aggregateReportOptionsSchema) },
    balanceHistoryReport: { inputs: journalInputs(balanceHistoryOptionsSchema) },
    gainReport: { inputs: journalInputs(gainReportOptionsSchema) },
    investmentPerformance: { inputs: journalInputs(investmentPerformanceOptionsSchema) },
    accountTransactions: { inputs: journalInputs(accountTransactionsOptionsSchema) },
    commodityDescriptions: { inputs: journalInputs(commodityDescriptionsOptionsSchema) },
    ledgerAccounts: { inputs: journalInputs(ledgerAccountsOptionsSchema) },
    ledgerTransaction: { inputs: journalInputs(ledgerTransactionOptionsSchema) },
    ledgerTransactions: { inputs: journalInputs(ledgerTransactionsOptionsSchema) },
    reconciliationEntries: { inputs: journalInputs(reconciliationEntriesOptionsSchema) },
    ledgerValuationRateResolver: {
      inputs: ['journalPath', ...resolverInputNames],
    },
  });
  const projectConfigurationError = (message) =>
    createError(errorCodes.PROJECT_CONFIGURATION, message);

  function queryDatabase(databasePath, operation) {
    try {
      return readDatabase(databasePath, operation);
    } catch (error) {
      throw databaseError(error);
    }
  }

  function journalPaths(journalPath) {
    try {
      return pathsForJournal(journalPath);
    } catch (error) {
      throw projectConfigurationError(error.message);
    }
  }

  function ensureCurrent(journalPath) {
    const paths = journalPaths(journalPath);
    try {
      fs.mkdirSync(path.dirname(paths.databasePath), { recursive: true, mode: 0o700 });
      const current = { ...paths, ...ensureDatabaseCurrent(paths.databasePath, paths.journalPath) };
      fs.chmodSync(paths.databasePath, 0o600);
      return current;
    } catch (error) {
      if (Object.values(errorCodes).includes(error.code)) throw error;
      throw createError(errorCodes.DATABASE, error.message);
    }
  }

  function openJournal(journalPath) {
    const current = ensureCurrent(journalPath);
    const valuationPriceCache = new Map();
    let ledgerValuationRateResolver;
    return {
      ...current,
      accountBalances(options) {
        return queryDatabase(current.databasePath, (database) => queryAccountBalances(database, options));
      },
      accountPostings(options) {
        return queryDatabase(current.databasePath, (database) => queryAccountPostings(database, options));
      },
      accountTransactions(options) {
        return queryDatabase(current.databasePath, (database) => queryAccountTransactions(database, options));
      },
      aggregateReport(options) {
        return queryDatabase(current.databasePath,
          (database) => queryAggregate(database, options, { valuationPriceCache }));
      },
      balanceHistoryReport(options) {
        return queryDatabase(current.databasePath, (database) => queryBalanceHistory(database, options));
      },
      commodityDescriptions() {
        return queryDatabase(current.databasePath, (database) => queryCommodityDescriptions(database, {}));
      },
      gainReport(options) {
        return queryDatabase(current.databasePath,
          (database) => queryGain(database, options, { valuationPriceCache }));
      },
      investmentPerformance(options) {
        return queryDatabase(current.databasePath,
          (database) => queryInvestmentPerformance(database, options));
      },
      ledgerValuationRateResolver() {
        ledgerValuationRateResolver ??= queryDatabase(current.databasePath,
          (database) => queryLedgerValuationRateResolver(database));
        return ledgerValuationRateResolver;
      },
      ledgerAccounts() {
        return queryDatabase(current.databasePath, (database) => queryLedgerAccounts(database, {}));
      },
      ledgerTransaction(options) {
        return queryDatabase(current.databasePath, (database) => queryLedgerTransaction(database, options));
      },
      ledgerTransactions(options) {
        return queryDatabase(current.databasePath, (database) => queryLedgerTransactions(database, options));
      },
      reconciliationEntries(options) {
        return queryDatabase(current.databasePath,
          (database) => queryReconciliationEntries(database, options));
      },
    };
  }

  return {
    apiDefinitions,
    openJournal,
  };
};
