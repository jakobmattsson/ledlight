'use strict';

module.exports = ({
  srcLedlightJournalTraverse: { traverseJournal },
}) => {



  function includePaths(sourceText) {
    const includes = [];
    for (const rawLine of sourceText.split(/\r?\n/u)) {
      if (!rawLine.startsWith('include') || !/[ \t]/u.test(rawLine[7] || '')) continue;
      const value = rawLine.slice(8).trimStart();
      let quote = null;
      let end = value.length;
      for (let index = 0; index < value.length; index++) {
        const character = value[index];
        if (quote) {
          if (character === quote) quote = null;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === ';') {
          end = index;
          break;
        }
      }
      const includePath = value.slice(0, end).trimEnd();
      if (includePath) includes.push(includePath);
    }
    return includes;
  }

  function loadJournalManifest(entryPath) {
    return traverseJournal(entryPath, ({ content, include }) => {
      for (const includePath of includePaths(content)) include(includePath);
    });
  }

  return { loadJournalManifest };
};
