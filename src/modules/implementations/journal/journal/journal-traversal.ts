'use strict';

type RootSource = { content: string; baseDirectory: string };
type JournalFile = { path: string; sha256: string; size: number };
type TraversedFile = { content: string; path: string; include(path: string, line?: number): void };

module.exports = ({
  includePattern: { expandIncludePattern },
  external: {
    buffer,
    crypto,
    fs,
    path
  },
}: any) => {

  function traverseJournal(journalPath: string, processFile: (file: TraversedFile) => void, rootSource?: RootSource) {
    const resolvedJournalPath = rootSource ? journalPath : path.resolve(journalPath);
    const filesByPath = new Map<string, JournalFile>();
    const active = new Set<string>();

    function load(filePath: string, source?: RootSource): void {
      const absolutePath = source ? filePath : path.resolve(filePath);
      if (active.has(absolutePath)) throw new Error(`Circular include detected at ${absolutePath}`);
      if (filesByPath.has(absolutePath)) return;
      active.add(absolutePath);

      try {
        const bytes = source ? buffer.from(source.content, 'utf8') : fs.readFileSync(absolutePath);
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
          include(includePath: string, line?: number) {
            const includePattern = path.resolve(
              source?.baseDirectory ?? path.dirname(absolutePath), includePath,
            );
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

    load(resolvedJournalPath, rootSource);
    return { journalPath: resolvedJournalPath, files: [...filesByPath.values()] };
  }

  return { traverseJournal };
};
