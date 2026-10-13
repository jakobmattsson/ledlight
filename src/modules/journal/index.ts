'use strict';

type Facade = {
  ingestionWarning: ReturnType<typeof import('./warnings/ingestion-warning')>;
  journal: ReturnType<typeof import('./journal/journal')>;
  journalManifest: ReturnType<typeof import('./journal/journal-manifest')>;
  ledgerParser: ReturnType<typeof import('./syntax/ledger-parser')>;
};

export = ({
  ingestionWarning, journal, journalManifest, ledgerParser,
}: Facade): Facade => ({
  ingestionWarning, journal, journalManifest, ledgerParser,
});
