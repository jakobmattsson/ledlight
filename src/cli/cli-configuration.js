'use strict';

module.exports = ({ fs, path, processEnvironment, currentWorkingDirectory }) => {
  function configurationPaths() {
    const candidates = [];
    if (processEnvironment.HOME) {
      candidates.push(path.join(processEnvironment.HOME, '.ledlightrc'));
    }
    candidates.push(path.join(currentWorkingDirectory(), '.ledlightrc'));
    return [...new Set(candidates)];
  }

  function configuredJournalPath() {
    const configurationPath = configurationPaths().find((candidate) => fs.existsSync(candidate));
    if (!configurationPath) return undefined;

    const settings = fs.readFileSync(configurationPath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith(';'));
    if (settings.length === 0) return undefined;
    if (settings.length !== 1) {
      throw new Error(`${configurationPath} may only contain one --file option`);
    }

    const match = /^--file(?:\s+|=)(.+)$/u.exec(settings[0]);
    if (!match) throw new Error(`${configurationPath} only supports the --file option`);
    let journalPath = match[1].trim();
    if ((journalPath.startsWith('"') && journalPath.endsWith('"')) ||
        (journalPath.startsWith("'") && journalPath.endsWith("'"))) {
      journalPath = journalPath.slice(1, -1);
    }
    if (journalPath.length === 0) {
      throw new Error(`${configurationPath} --file option expects a path`);
    }
    if (journalPath === '~' && processEnvironment.HOME) return processEnvironment.HOME;
    if (journalPath.startsWith('~/') && processEnvironment.HOME) {
      return path.join(processEnvironment.HOME, journalPath.slice(2));
    }
    return journalPath;
  }

  function apply(arguments_) {
    if (arguments_.some((argument) => argument === '--file' || argument.startsWith('--file='))) {
      return arguments_;
    }
    const journalPath = configuredJournalPath();
    if (journalPath === undefined || arguments_.length === 0) return arguments_;
    return [arguments_[0], '--file', journalPath, ...arguments_.slice(1)];
  }

  return { apply };
};
