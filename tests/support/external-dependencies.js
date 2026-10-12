'use strict';

module.exports = (factory, names) => (dependencies) => factory({
  ...dependencies,
  external: Object.fromEntries(names.map((name) => [name, dependencies[name]])),
});
