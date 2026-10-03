'use strict';

module.exports = () => {
  const definitions = Object.freeze({
    parse: { inputs: ['sourceText', 'source'], options: ['source'] },
    loadJournal: { inputs: ['entryPath'], options: [] },
    loadProjectPaths: { inputs: ['startDirectory'], options: [] },
    ensureProjectDatabaseCurrent: { inputs: ['startDirectory'], options: [] },
    openProject: { inputs: ['startDirectory'], options: [] },
    accountBalances: {
      inputs: ['account', 'to', 'startDirectory'], options: ['account', 'to'],
    },
    accountPostings: {
      inputs: ['account', 'after', 'startDirectory'], options: ['account', 'after'],
    },
    aggregateReport: {
      inputs: [
        'accounts', 'dateBasis', 'from', 'includeTotal', 'inValuationCommodity',
        'invert', 'to', 'withValuationValue', 'startDirectory',
      ],
      options: [
        'accounts', 'dateBasis', 'from', 'includeTotal', 'inValuationCommodity',
        'invert', 'to', 'withValuationValue',
      ],
    },
    balanceHistoryReport: {
      inputs: ['accountFactors', 'accounts', 'dateBasis', 'from', 'invert', 'to', 'startDirectory'],
      options: ['accountFactors', 'accounts', 'dateBasis', 'from', 'invert', 'to'],
    },
    gainReport: {
      inputs: ['accounts', 'dateBasis', 'to', 'startDirectory'],
      options: ['accounts', 'dateBasis', 'to'],
    },
    investmentPerformance: {
      inputs: ['accounts', 'commodities', 'excludeCommodities', 'from', 'to', 'startDirectory'],
      options: ['accounts', 'commodities', 'excludeCommodities', 'from', 'to'],
    },
    accountTransactions: {
      inputs: ['account', 'startDirectory'], options: ['account'],
    },
    commodityDescriptions: { inputs: ['startDirectory'], options: [] },
    ledgerAccounts: { inputs: ['startDirectory'], options: [] },
    ledgerTransaction: {
      inputs: ['transactionId', 'startDirectory'], options: ['transactionId'],
    },
    ledgerTransactions: {
      inputs: ['order', 'page', 'pageSize', 'startDirectory'],
      options: ['order', 'page', 'pageSize'],
    },
    ledgerValuationRateResolver: {
      inputs: ['commodity', 'throughDate', 'startDirectory'], options: [],
    },
  });

  const inputNames = (operation) => definitions[operation].inputs;
  const optionNames = (operation) => definitions[operation].options;

  return { definitions, inputNames, optionNames };
};
