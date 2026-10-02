'use strict';

module.exports = ({
  srcLedlightJournalLoad: { loadJournal },
  srcLedlightSyntaxErrors: { LedgerSyntaxError },
  srcLedlightSyntaxParser: { parse },
  srcLedlightApplicationProject: projectApi,
  srcLedlightCliCommand: { runReportCommand },
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
    LedgerSyntaxError,
    accountBalances,
    accountPostings,
    aggregateReport,
    balanceHistoryReport,
    investmentPerformance,
    ensureProjectDatabaseCurrent,
    loadJournal,
    loadProjectPaths,
    openProject,
    parse,
    runReportCommand,
  };
};
