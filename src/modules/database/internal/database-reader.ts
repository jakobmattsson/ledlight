'use strict';

module.exports = ({
  core: {
    decimal: { registerDecimalFunctions },
  },
  external: {
    path,
    sqlite: Database
  },
}: any) => {
  function readDatabase(databasePath: any, query: any) {
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
