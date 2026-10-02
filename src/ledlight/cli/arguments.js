'use strict';

module.exports = () => {

  function usage() {
    return [
      'Usage:',
      '  ledlight aggregate [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--accounts PREFIX]... [--date-basis posting|transaction] [--value] [--invert] [--csv]',
      '  ledlight balance-history [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--accounts PREFIX]... [--date-basis posting|transaction] [--invert] [--csv]',
      '  ledlight investment-performance [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--accounts PREFIX]... [--commodities NAME]... [--exclude-commodities NAME]... [--json]',
    ].join('\n');
  }

  function parseInvestmentPerformanceArguments(argumentsWithoutCommand) {
    const reportOptions = { accounts: [], commodities: [], excludeCommodities: [] };
    let json = false;
    for (let index = 0; index < argumentsWithoutCommand.length; index += 1) {
      const argument = argumentsWithoutCommand[index];
      if (argument === '--json') {
        json = true;
        continue;
      }
      const repeatedOption = argument === '--accounts' || argument === '--commodities' ||
      argument === '--exclude-commodities';
      if (argument === '--from' || argument === '--to' || repeatedOption) {
        const value = argumentsWithoutCommand[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(usage());
        index += 1;
        if (repeatedOption) {
          const property = argument === '--exclude-commodities'
            ? 'excludeCommodities'
            : argument.slice(2);
          reportOptions[property].push(value);
        } else {
          const property = argument.slice(2);
          if (reportOptions[property] !== undefined) throw new Error(`${argument} may only be specified once`);
          reportOptions[property] = value;
        }
        continue;
      }
      throw new Error(usage());
    }
    return { reportOptions, json };
  }

  function parseArguments(arguments_) {
    const [command, ...argumentsWithoutCommand] = arguments_;
    if (command === 'investment-performance') {
      return parseInvestmentPerformanceArguments(argumentsWithoutCommand);
    }
    if (command !== 'aggregate' && command !== 'balance-history') throw new Error(usage());
    const reportOptions = { accounts: [], inValuationCommodity: false };
    let csv = false;
    let invert = false;

    for (let index = 0; index < argumentsWithoutCommand.length; index += 1) {
      const argument = argumentsWithoutCommand[index];
      if (argument === '--value') {
        if (command === 'balance-history') throw new Error(usage());
        reportOptions.inValuationCommodity = true;
        continue;
      }
      if (argument === '--csv') {
        csv = true;
        continue;
      }
      if (argument === '--invert') {
        invert = true;
        continue;
      }
      if (argument === '--from' || argument === '--to' || argument === '--accounts' || argument === '--date-basis') {
        const value = argumentsWithoutCommand[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(usage());
        index += 1;
        if (argument === '--accounts') {
          reportOptions.accounts.push(value);
        } else {
          const property = argument === '--date-basis' ? 'dateBasis' : argument.slice(2);
          if (reportOptions[property] !== undefined) {
            throw new Error(`${argument} may only be specified once`);
          }
          if (argument === '--date-basis' && value !== 'posting' && value !== 'transaction') {
            throw new Error(usage());
          }
          reportOptions[property] = value;
        }
        continue;
      }
      throw new Error(usage());
    }

    reportOptions.dateBasis ??= 'posting';
    return { reportOptions, csv, invert };
  }

  return {
    parseArguments,
    $$private: { usage },
  };
};
