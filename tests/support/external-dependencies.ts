'use strict';

module.exports = (factory: any, names: any) => (dependencies: any) => factory({
  ...dependencies,
  external: Object.fromEntries(names.map((name: any) => [name, dependencies[name]])),
});
