'use strict';

type Facade = {
  database: ReturnType<typeof import('./internal/database')>;
  databaseReader: ReturnType<typeof import('./internal/database-reader')>;
  journalWriter: ReturnType<typeof import('./internal/journal-writer')>;
  readModelContract: ReturnType<typeof import('./internal/read-model-contract')>;
};

export = ({
  database, databaseReader, journalWriter, readModelContract,
}: Facade): Facade => ({
  database, databaseReader, journalWriter, readModelContract,
});
