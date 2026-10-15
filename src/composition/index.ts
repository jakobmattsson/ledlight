'use strict';

const repository = require('./repository-container');

type RepositoryContainer = { resolve<T = unknown>(moduleName: string): T };
type ArchitecturePaths = {
  modulesRoot: string;
  dependsOnPath: string;
  usedByPath: string;
  diagramPath: string;
};

function createRepositoryContainer(modulesRoot: string): RepositoryContainer {
  return repository.createRepositoryContainer(modulesRoot);
}

function generateArchitecture(paths: ArchitecturePaths): Promise<void> {
  return require('./architecture').generateArchitecture(paths);
}

export = { createRepositoryContainer, generateArchitecture };
