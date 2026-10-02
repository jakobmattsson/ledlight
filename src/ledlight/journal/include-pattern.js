'use strict';

module.exports = ({
  nodeFs: fs,
  nodePath: path,
}) => {

  function hasMagic(value) {
    return value.includes('*') || value.includes('?');
  }

  function expandIncludePattern(pattern) {
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
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return directoryEntries
      .filter((entry) => entry.isFile() && matcher.test(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right, 'en'));
  }

  return { expandIncludePattern };
};
