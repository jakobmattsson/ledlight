'use strict';

module.exports = ({
  journal: { loadJournal },
  packageMetadata: { version },
  publicErrors: { errorCodes },
  ledgerParser: { parse },
  project: projectApi,
}) => {

  function aggregateReport(journalPath, options) {
    return projectApi.aggregateReport(journalPath, options);
  }

  function accountBalances(journalPath, options) {
    return projectApi.accountBalances(journalPath, options);
  }

  function accountPostings(journalPath, options) {
    return projectApi.accountPostings(journalPath, options);
  }

  function balanceHistoryReport(journalPath, options) {
    return projectApi.balanceHistoryReport(journalPath, options);
  }

  function investmentPerformance(journalPath, options) {
    return projectApi.investmentPerformance(journalPath, options);
  }

  function gainReport(journalPath, options) {
    return projectApi.gainReport(journalPath, options);
  }

  function ensureDatabaseCurrent(journalPath) {
    return projectApi.ensureDatabaseCurrent(journalPath);
  }

  function databasePathForJournal(journalPath) {
    return projectApi.databasePathForJournal(journalPath);
  }

  function openJournal(journalPath) {
    return projectApi.openJournal(journalPath);
  }

  return {
    accountBalances,
    accountPostings,
    aggregateReport,
    balanceHistoryReport,
    gainReport,
    investmentPerformance,
    databasePathForJournal,
    ensureDatabaseCurrent,
    errorCodes,
    loadJournal,
    openJournal,
    parse,
    version,
  };
};
