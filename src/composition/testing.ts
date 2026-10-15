'use strict';

const { createRepositoryContainerRuntime } = require('./repository-container');
const { asValue } = require('../../lib/awilix');

type TestRepositoryContainer = {
  resolve<T = unknown>(moduleName: string): T;
  overrideExternals(values: Record<string, unknown>): void;
  overrideInternal(moduleName: string, name: string, value: unknown): void;
  resolveInternal<T = unknown>(moduleName: string, name: string): T;
  order: readonly string[];
};

function createTestRepositoryContainer(modulesRoot: string): TestRepositoryContainer {
  const runtime = createRepositoryContainerRuntime(modulesRoot);
  return Object.freeze({
    resolve: runtime.resolve,
    overrideExternals(values: Record<string, unknown>) {
      runtime.registerExternals(Object.fromEntries(Object.entries(values)
        .map(([name, value]) => [name, asValue(value)])));
    },
    overrideInternal(moduleName: string, name: string, value: unknown) {
      runtime.registerInternal(moduleName, name, asValue(value));
    },
    resolveInternal: runtime.resolveInternal,
    order: runtime.order,
  });
}

export = { createTestRepositoryContainer };
