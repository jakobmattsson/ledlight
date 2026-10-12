'use strict';

module.exports = ({
  core: {
    decimal: { registerDecimalFunctions },
  },
  external: {
    path,
    sqlite: Database
  },
}) => {
  function readDatabase(databasePath, query) {
    const database = new Database(path.resolve(databasePath), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      registerDecimalFunctions(database);
      return query(database);
    } finally {
      database.close();
    }
  }

  return { readDatabase };
};
