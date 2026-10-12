'use strict';

module.exports = (factory: any, names: string[]) => (dependencies: any) => factory({
  ...dependencies,
  external: Object.fromEntries(names.map((name: string) => [name, dependencies[name]])),
});
