'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  listModules,
  Lifetime,
} = require('awilix');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const MODULE_NAMES = Object.freeze({
  'src/api/errors.js': 'publicErrors',
  'src/api/index.js': 'ledlight',
  'src/api/options.js': 'apiOptions',
  'src/application/cache-paths.js': 'cachePaths',
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
  'src/ingestion/database/read.js': 'databaseReader',
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
const QUERY_MODULE_PATTERN = 'src/queries/*.js';

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  });
}

function repositoryFactoryFiles() {
  const queryFiles = new Set(listModules(QUERY_MODULE_PATTERN, { cwd: REPOSITORY_ROOT })
    .map(({ path: fileName }) => fileName));
  return APPLICATION_SOURCE_DIRECTORIES.flatMap((directory) =>
    filesBelow(path.join(REPOSITORY_ROOT, 'src', directory)))
    .filter((fileName) => fileName.endsWith('.js'))
    .filter((fileName) => !queryFiles.has(fileName))
    .filter((fileName) => !fileName.includes(`${path.sep}modules${path.sep}`))
    .filter((fileName) => !EXCLUDED_FACTORY_FILES.has(
      path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/'),
    ));
}

function loadQueries(dependencies) {
  const names = new Set();
  return Object.freeze(listModules(QUERY_MODULE_PATTERN, { cwd: REPOSITORY_ROOT })
    .map(({ path: fileName }) => {
      const query = require(fileName)(dependencies);
      if (!query || typeof query !== 'object' || Array.isArray(query)) {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must return a query object.`);
      }
      if (typeof query.name !== 'string' || query.name.length === 0) {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must expose a name.`);
      }
      if (names.has(query.name)) throw new Error(`Duplicate query name: ${query.name}`);
      if (typeof query.inputSchema?.safeParse !== 'function') {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must expose an inputSchema.`);
      }
      if (typeof query.execute !== 'function') {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must expose an execute function.`);
      }
      names.add(query.name);
      return Object.freeze(query);
    }));
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
    envPaths: asValue(require('env-paths')),
    fs: asValue(require('node:fs')),
    packageMetadata: asValue(require('../../package.json')),
    path: asValue(require('node:path')),
    processEnvironment: asValue(process.env),
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
  container.register('queries', asFunction(loadQueries, { lifetime: Lifetime.SINGLETON }));
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
