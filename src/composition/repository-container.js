'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  Lifetime,
} = require('awilix');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const MODULE_NAMES = Object.freeze({
  'src/ledlight/accounting/decimal.js': 'decimal',
  'src/ledlight/accounting/posting-resolver.js': 'postingResolver',
  'src/ledlight/accounting/valuation-commodity.js': 'valuationCommodity',
  'src/ledlight/accounting/validate-journal.js': 'journalValidator',
  'src/ledlight/api/options.js': 'apiOptions',
  'src/ledlight/application/project.js': 'project',
  'src/ledlight/cli/arguments.js': 'cliArguments',
  'src/ledlight/cli/command.js': 'cliCommand',
  'src/ledlight/cli/format.js': 'cliFormat',
  'src/ledlight/errors.js': 'publicErrors',
  'src/ledlight/index.js': 'ledlight',
  'src/ledlight/journal/create-loader.js': 'journalLoaderFactory',
  'src/ledlight/journal/include-pattern.js': 'includePattern',
  'src/ledlight/journal/load.js': 'journal',
  'src/ledlight/journal/manifest.js': 'journalManifest',
  'src/ledlight/journal/traverse.js': 'journalTraversal',
  'src/ledlight/investments/reconciliation-entries.js': 'reconciliationEntries',
  'src/ledlight/investments/returns.js': 'investmentReturns',
  'src/ledlight/queries/account-balances.js': 'accountBalancesQuery',
  'src/ledlight/queries/account-postings.js': 'accountPostingsQuery',
  'src/ledlight/queries/account-prefix-filter.js': 'accountPrefixFilter',
  'src/ledlight/queries/account-transactions.js': 'accountTransactionsQuery',
  'src/ledlight/queries/commodity-descriptions.js': 'commodityDescriptionsQuery',
  'src/ledlight/queries/ledger-accounts.js': 'ledgerAccountsQuery',
  'src/ledlight/queries/ledger-transaction.js': 'ledgerTransactionQuery',
  'src/ledlight/queries/ledger-transactions.js': 'ledgerTransactionsQuery',
  'src/ledlight/reports/aggregate.js': 'aggregateReport',
  'src/ledlight/reports/balance-history.js': 'balanceHistoryReport',
  'src/ledlight/reports/gain.js': 'gainReport',
  'src/ledlight/reports/investment-performance.js': 'investmentPerformanceReport',
  'src/ledlight/sqlite/database.js': 'database',
  'src/ledlight/sqlite/freshness.js': 'databaseFreshness',
  'src/ledlight/sqlite/materialize-valuation-prices.js': 'valuationPriceMaterializer',
  'src/ledlight/sqlite/migrate.js': 'databaseMigration',
  'src/ledlight/sqlite/rebuild-lock.js': 'databaseRebuildLock',
  'src/ledlight/sqlite/write-journal.js': 'journalWriter',
  'src/ledlight/syntax/amount-parser.js': 'amountParser',
  'src/ledlight/syntax/errors.js': 'syntaxErrors',
  'src/ledlight/syntax/parser.js': 'ledgerParser',
  'src/ledlight/syntax/reference/parser.js': 'referenceParser',
  'src/ledlight/valuation/rates.js': 'valuationRates',
});
const EXCLUDED_FACTORY_FILES = new Set([
  'src/ledlight/cli/cli-modules.js',
  'src/ledlight/cli/run.js',
]);

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  });
}

function repositoryFactoryFiles() {
  return filesBelow(path.join(REPOSITORY_ROOT, 'src/ledlight'))
    .filter((fileName) => fileName.endsWith('.js'))
    .filter((fileName) => !fileName.includes(`${path.sep}modules${path.sep}`))
    .filter((fileName) => !EXCLUDED_FACTORY_FILES.has(
      path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/'),
    ));
}

function repositoryModuleName(fileName) {
  const relativeName = path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/');
  const name = MODULE_NAMES[relativeName];
  if (!name) throw new Error(`No dependency-injection name is defined for ${relativeName}`);
  return name;
}

function registerExternalModules(container) {
  container.register({
    crypto: asValue(require('node:crypto')),
    fs: asValue(require('node:fs')),
    packageMetadata: asValue(require('../../package.json')),
    path: asValue(require('node:path')),
    systemClock: asValue({
      now: () => Date.now(),
      sleep(milliseconds) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
      },
    }),
    ohm: asValue({
      grammar(...arguments_) {
        return require('ohm-js').grammar(...arguments_);
      },
    }),
    sqlite: asValue(function LazyDatabase(...arguments_) {
      const Database = require('better-sqlite3');
      return new Database(...arguments_);
    }),
    zod: asValue(require('zod')),
  });
}

function registerRepositoryModules(container) {
  registerExternalModules(container);
  for (const fileName of repositoryFactoryFiles()) {
    const relativeName = path.relative(REPOSITORY_ROOT, fileName);
    const factory = require(fileName);
    if (typeof factory !== 'function') {
      throw new TypeError(`${relativeName} must export an Awilix factory.`);
    }
    container.register(
      repositoryModuleName(fileName),
      asFunction(factory, { lifetime: Lifetime.SINGLETON }),
    );
  }
  return container;
}

function createRepositoryContainer() {
  return registerRepositoryModules(createContainer({ injectionMode: InjectionMode.PROXY }));
}

module.exports = {
  createRepositoryContainer,
  registerRepositoryModules,
  $$private: { repositoryModuleName },
};
