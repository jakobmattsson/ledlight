'use strict';

module.exports = ({
  journalTraversal: { traverseJournal },
}) => {

  function createJournalLoader(parseSource) {
    return function loadJournal(entryPath) {
      const entries = [];
      const traversal = traverseJournal(entryPath, ({ content, path, include }) => {
        const document = parseSource(content, { source: path });
        for (const entry of document.entries) {
          if (entry.type === 'include') include(entry.path, entry.location.line);
          else entries.push(entry);
        }
      });
      return { ...traversal, entries };
    };
  }

  return { createJournalLoader };
};
