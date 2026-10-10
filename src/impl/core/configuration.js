'use strict';

module.exports = ({ fs, path, processEnvironment, currentWorkingDirectory }) => {
  function configurationPaths() {
    const candidates = [];
    let directory = path.resolve(currentWorkingDirectory());
    while (true) {
      candidates.push(path.join(directory, '.ledlightrc'));
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    if (processEnvironment.HOME) {
      candidates.push(path.join(processEnvironment.HOME, '.ledlightrc'));
    }
    return [...new Set(candidates)];
  }

  function resolveSetting(value, configurationPath, option) {
    let setting = value.trim();
    if ((setting.startsWith('"') && setting.endsWith('"')) ||
        (setting.startsWith("'") && setting.endsWith("'"))) {
      setting = setting.slice(1, -1);
    }
    if (setting.trim().length === 0) {
      throw new Error(`${configurationPath} --${option} option expects a path`);
    }
    if (setting === '~' && processEnvironment.HOME) return processEnvironment.HOME;
    if (setting.startsWith('~/') && processEnvironment.HOME) {
      return path.join(processEnvironment.HOME, setting.slice(2));
    }
    return path.resolve(path.dirname(configurationPath), setting);
  }

  function read() {
    const configurationPath = configurationPaths().find((candidate) => fs.existsSync(candidate));
    if (!configurationPath) return {};

    const settings = {};
    const lines = fs.readFileSync(configurationPath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith(';'));
    for (const line of lines) {
      const match = /^--(file|cache-home)(?:\s+|=)(.*)$/u.exec(line);
      if (!match) {
        throw new Error(`${configurationPath} only supports --file and --cache-home options`);
      }
      const [, option, value] = match;
      if (Object.hasOwn(settings, option)) {
        throw new Error(`${configurationPath} may only contain one --${option} option`);
      }
      settings[option] = resolveSetting(value, configurationPath, option);
    }
    return { journalPath: settings.file, cacheHome: settings['cache-home'] };
  }

  return { read };
};
