'use strict';

module.exports = ({
  crypto,
  fs,
  path,
  includePattern: { expandIncludePattern },
}) => {

  function traverseJournal(journalPath, processFile) {
    const resolvedJournalPath = path.resolve(journalPath);
    const filesByPath = new Map();
    const active = new Set();

    function load(filePath) {
      const absolutePath = path.resolve(filePath);
      if (active.has(absolutePath)) throw new Error(`Circular include detected at ${absolutePath}`);
      if (filesByPath.has(absolutePath)) return;
      active.add(absolutePath);

      try {
        const bytes = fs.readFileSync(absolutePath);
        const content = bytes.toString('utf8');
        if (!filesByPath.has(absolutePath)) {
          filesByPath.set(absolutePath, {
            path: absolutePath,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            size: bytes.length,
          });
        }

        processFile({
          content,
          path: absolutePath,
          include(includePath, line) {
            const includePattern = path.resolve(path.dirname(absolutePath), includePath);
            const matches = expandIncludePattern(includePattern);
            if (matches.length === 0) {
              const location = line === undefined ? absolutePath : `${absolutePath}:${line}`;
              throw new Error(`${location}: include matched no files: ${includePath}`);
            }
            for (const match of matches) load(match);
          },
        });
      } finally {
        active.delete(absolutePath);
      }
    }

    load(resolvedJournalPath);
    return { journalPath: resolvedJournalPath, files: [...filesByPath.values()] };
  }

  return { traverseJournal };
};
