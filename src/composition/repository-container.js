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
  'src/api/errors.js': 'publicErrors',
  'src/api/index.js': 'ledlight',
  'src/api/options.js': 'apiOptions',
  'src/application/project.js': 'project',
  'src/cli/arguments.js': 'cliArguments',
  'src/cli/command.js': 'cliCommand',
  'src/cli/format.js': 'cliFormat',
  'src/domain/accounting/decimal.js': 'decimal',
  'src/domain/accounting/posting-resolver.js': 'postingResolver',
  'src/domain/accounting/valuation-commodity.js': 'valuationCommodity',
  'src/domain/accounting/validate-journal.js': 'journalValidator',
  'src/domain/investments/returns.js': 'investmentReturns',
  'src/ingestion/database/database.js': 'database',
  'src/ingestion/database/freshness.js': 'databaseFreshness',
  'src/ingestion/database/materialize-valuation-prices.js': 'valuationPriceMaterializer',
  'src/ingestion/database/migrate.js': 'databaseMigration',
  'src/ingestion/database/rebuild-lock.js': 'databaseRebuildLock',
  'src/ingestion/database/write-journal.js': 'journalWriter',
  'src/ingestion/journal/create-loader.js': 'journalLoaderFactory',
  'src/ingestion/journal/include-pattern.js': 'includePattern',
  'src/ingestion/journal/load.js': 'journal',
  'src/ingestion/journal/manifest.js': 'journalManifest',
  'src/ingestion/journal/traverse.js': 'journalTraversal',
  'src/ingestion/syntax/amount-parser.js': 'amountParser',
  'src/ingestion/syntax/errors.js': 'syntaxErrors',
  'src/ingestion/syntax/parser.js': 'ledgerParser',
  'src/ingestion/syntax/reference/parser.js': 'referenceParser',
  'src/queries/account-balances.js': 'accountBalancesQuery',
  'src/queries/account-postings.js': 'accountPostingsQuery',
  'src/queries/account-transactions.js': 'accountTransactionsQuery',
  'src/queries/aggregate.js': 'aggregateQuery',
  'src/queries/balance-history.js': 'balanceHistoryQuery',
  'src/queries/commodity-descriptions.js': 'commodityDescriptionsQuery',
  'src/queries/gain.js': 'gainQuery',
  'src/queries/investment-performance.js': 'investmentPerformanceQuery',
  'src/queries/ledger-accounts.js': 'ledgerAccountsQuery',
  'src/queries/ledger-transaction.js': 'ledgerTransactionQuery',
  'src/queries/ledger-transactions.js': 'ledgerTransactionsQuery',
  'src/queries/support/account-prefix-filter.js': 'accountPrefixFilter',
  'src/queries/support/reconciliation-entries.js': 'reconciliationEntries',
  'src/queries/support/valuation-rates.js': 'valuationRates',
});
const APPLICATION_SOURCE_DIRECTORIES = Object.freeze([
  'api',
  'application',
  'cli',
  'domain',
  'ingestion',
  'queries',
]);
const EXCLUDED_FACTORY_FILES = new Set([
  'src/cli/cli-modules.js',
  'src/cli/run.js',
]);

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  });
}

function repositoryFactoryFiles() {
  return APPLICATION_SOURCE_DIRECTORIES.flatMap((directory) =>
    filesBelow(path.join(REPOSITORY_ROOT, 'src', directory)))
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
