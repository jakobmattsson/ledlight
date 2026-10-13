'use strict';

import type { LedgerEntry, WarningGroup } from '../../../../public-api';

type JournalSource =
  | { kind: 'file'; path: string }
  | { kind: 'stdin'; content: string; baseDirectory: string };

module.exports = ({
  journalTraversal: { traverseJournal },
}: any) => {

  function createJournalLoader(parseSource: any) {
    return function loadJournal(source: JournalSource) {
      const entries: LedgerEntry[] = [];
      const warnings: WarningGroup[] = [];
      const traversal = traverseJournal(source, ({ content, path, include }: any) => {
        const document = parseSource(content, { source: path });
        warnings.push(...(document.warnings || []));
        for (const entry of document.entries) {
          if (entry.type === 'include') include(entry.path, entry.location.line);
          else entries.push(entry);
        }
      });
      return { ...traversal, entries, warnings };
    };
  }

  return { createJournalLoader };
};
