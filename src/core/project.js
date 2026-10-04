'use strict';

module.exports = ({
  cachePaths: { pathsForJournal },
  fs,
  path,
  queries,
  database: { ensureDatabaseCurrent },
  databaseReader: { readDatabase },
  ingestionWarning: { groupWarnings },
  publicErrors: { createError, databaseError, errorCodes },
}) => {

  const queryByName = new Map(queries.map((query) => [query.name, query]));
  const query = (name) => {
    const definition = queryByName.get(name);
    if (!definition) throw new Error(`Unknown query: ${name}`);
    return definition;
  };
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
  const {
    inputSchema: unrealizedGainsOptionsSchema,
    execute: queryUnrealizedGains,
  } = query('unrealizedGains');
  const {
    inputSchema: investmentPerformanceOptionsSchema,
    execute: queryInvestmentPerformance,
  } = query('investmentPerformance');
  const {
    inputSchema: accountsOptionsSchema,
    execute: queryAccounts,
  } = query('accounts');
  const {
    inputSchema: tagsOptionsSchema,
    execute: queryTags,
  } = query('tags');
  const {
    inputSchema: commoditiesOptionsSchema,
    execute: queryCommodities,
  } = query('commodities');
  const {
    inputSchema: pricesOptionsSchema,
    execute: queryPrices,
  } = query('prices');
  const {
    inputSchema: transactionsOptionsSchema,
    execute: queryTransactions,
  } = query('transactions');
  const {
    inputSchema: reconciliationEntriesOptionsSchema,
    execute: queryReconciliationEntries,
  } = query('reconciliationEntries');
  const schemaInputs = (schema) => Object.keys(schema.shape);
  const journalInputs = (schema) => ['journalPath', ...schemaInputs(schema)];
  const apiDefinitions = Object.freeze({
    accountPostings: { inputs: journalInputs(accountPostingsOptionsSchema) },
    aggregateReport: { inputs: journalInputs(aggregateReportOptionsSchema) },
    balanceHistoryReport: { inputs: journalInputs(balanceHistoryOptionsSchema) },
    unrealizedGains: { inputs: journalInputs(unrealizedGainsOptionsSchema) },
    investmentPerformance: { inputs: journalInputs(investmentPerformanceOptionsSchema) },
    accountTransactions: { inputs: journalInputs(accountTransactionsOptionsSchema) },
    commodityDescriptions: { inputs: journalInputs(commodityDescriptionsOptionsSchema) },
    accounts: { inputs: journalInputs(accountsOptionsSchema) },
    tags: { inputs: journalInputs(tagsOptionsSchema) },
    commodities: { inputs: journalInputs(commoditiesOptionsSchema) },
    prices: { inputs: journalInputs(pricesOptionsSchema) },
    transactions: { inputs: journalInputs(transactionsOptionsSchema) },
    reconciliationEntries: { inputs: journalInputs(reconciliationEntriesOptionsSchema) },
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
    const warnings = groupWarnings(queryDatabase(
      current.databasePath,
      (database) => database.prepare(`
        SELECT code, message, source, line, column,
          start_line AS startLine, end_line AS endLine
        FROM ingestion_warnings
        ORDER BY position
      `).all(),
    ));
    const caches = Object.freeze({ valuationPriceCache: new Map() });
    const runQuery = (queryFunction, options) => queryDatabase(
      current.databasePath,
      (database) => queryFunction(database, options, caches),
    );
    return {
      ...current,
      warnings,
      accountPostings(options) {
        return runQuery(queryAccountPostings, options);
      },
      accountTransactions(options) {
        return runQuery(queryAccountTransactions, options);
      },
      aggregateReport(options) {
        return runQuery(queryAggregate, options);
      },
      balanceHistoryReport(options) {
        return runQuery(queryBalanceHistory, options);
      },
      commodityDescriptions() {
        return runQuery(queryCommodityDescriptions, {});
      },
      unrealizedGains(options) {
        return runQuery(queryUnrealizedGains, options);
      },
      investmentPerformance(options) {
        return runQuery(queryInvestmentPerformance, options);
      },
      accounts(options) {
        return runQuery(queryAccounts, options);
      },
      tags() {
        return runQuery(queryTags, {});
      },
      commodities() {
        return runQuery(queryCommodities, {});
      },
      prices() {
        return runQuery(queryPrices, {});
      },
      transactions(options) {
        return runQuery(queryTransactions, options);
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
