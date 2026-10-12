'use strict';

import type { LedgerEntry, WarningGroup } from '../../../public-api';

module.exports = ({
  journalTraversal: { traverseJournal },
}: any) => {

  function createJournalLoader(parseSource: any) {
    return function loadJournal(journalPath: string, rootSource: string | undefined) {
      const entries: LedgerEntry[] = [];
      const warnings: WarningGroup[] = [];
      const traversal = traverseJournal(journalPath, ({ content, path, include }: any) => {
        const document = parseSource(content, { source: path });
        warnings.push(...(document.warnings || []));
        for (const entry of document.entries) {
          if (entry.type === 'include') include(entry.path, entry.location.line);
          else entries.push(entry);
        }
      }, rootSource);
      return { ...traversal, entries, warnings };
    };
  }

  return { createJournalLoader };
};
