'use strict';
import type { SqliteConstructor, SqliteDatabase } from './sqlite-contracts';

type DecimalFunctions = ReturnType<typeof import('./decimal-sql-functions')>;
type Dependencies = {
  decimalSqlFunctions: DecimalFunctions;
  external: { path: Pick<typeof import('node:path'), 'resolve'>; sqlite: SqliteConstructor };
};
type Result = { readDatabase<Value>(databasePath: string, query: (database: SqliteDatabase) => Value): Value };

export = ({
  decimalSqlFunctions: { registerDecimalFunctions },
  external: {
    path,
    sqlite: Database
  },
}: Dependencies): Result => {
  function readDatabase<Value>(databasePath: string, query: (database: SqliteDatabase) => Value): Value {
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
