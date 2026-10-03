'use strict';

module.exports = ({
  journal: { loadJournal },
  packageMetadata: { version },
  publicErrors: { errorCodes },
  ledgerParser: { parse },
  project: projectApi,
}) => {

  function aggregateReport(options, startDirectory) {
    return projectApi.aggregateReport(options, startDirectory);
  }

  function accountBalances(options, startDirectory) {
    return projectApi.accountBalances(options, startDirectory);
  }

  function accountPostings(options, startDirectory) {
    return projectApi.accountPostings(options, startDirectory);
  }

  function balanceHistoryReport(options, startDirectory) {
    return projectApi.balanceHistoryReport(options, startDirectory);
  }

  function investmentPerformance(options, startDirectory) {
    return projectApi.investmentPerformance(options, startDirectory);
  }

  function gainReport(options, startDirectory) {
    return projectApi.gainReport(options, startDirectory);
  }

  function ensureProjectDatabaseCurrent(startDirectory) {
    return projectApi.ensureProjectDatabaseCurrent(startDirectory);
  }

  function loadProjectPaths(startDirectory) {
    return projectApi.loadProjectPaths(startDirectory);
  }

  function openProject(startDirectory) {
    return projectApi.openProject(startDirectory);
  }

  return {
    accountBalances,
    accountPostings,
    aggregateReport,
    balanceHistoryReport,
    gainReport,
    investmentPerformance,
    ensureProjectDatabaseCurrent,
    errorCodes,
    loadJournal,
    loadProjectPaths,
    openProject,
    parse,
    version,
  };
};
