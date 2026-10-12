'use strict';

module.exports = ({
  external: {
    fs,
    path
  },
}: any) => {

  function hasMagic(value: any) {
    return value.includes('*') || value.includes('?');
  }

  function expandIncludePattern(pattern: any) {
    const absolute = path.resolve(pattern);
    if (!hasMagic(absolute)) return [absolute];

    const directory = path.dirname(absolute);
    const basename = path.basename(absolute);
    if (hasMagic(directory)) {
      throw new Error(`Wildcards in include directories are not supported yet: ${pattern}`);
    }
    const escaped = basename.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replaceAll('?', '.');
    const matcher = new RegExp(`^${escaped}$`, 'u');
    let directoryEntries;
    try {
      directoryEntries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return directoryEntries
      .filter((entry: any) => entry.isFile() && matcher.test(entry.name))
      .map((entry: any) => path.join(directory, entry.name))
      .sort((left: any, right: any) => left.localeCompare(right, 'en'));
  }

  return { expandIncludePattern };
};
