'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: { registerDecimalFunctions },
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
