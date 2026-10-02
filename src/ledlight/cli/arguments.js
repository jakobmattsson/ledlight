'use strict';

const { Command, InvalidArgumentError, Option } = require('commander');

module.exports = () => {
  const API_COMMANDS = Object.freeze({
    parse: 'parse', loadJournal: 'load-journal', loadProjectPaths: 'project-paths',
    ensureProjectDatabaseCurrent: 'ensure-database', openProject: 'open-project',
    accountBalances: 'account-balances', accountPostings: 'account-postings',
    aggregateReport: 'aggregate', balanceHistoryReport: 'balance-history',
    gainReport: 'gain', investmentPerformance: 'investment-performance',
    accountTransactions: 'account-transactions', commodityDescriptions: 'commodity-descriptions',
    ledgerAccounts: 'ledger-accounts', ledgerTransaction: 'ledger-transaction',
    ledgerTransactions: 'ledger-transactions', ledgerValuationRateResolver: 'valuation-rate',
  });

  const collect = (value, previous) => (previous || []).concat(value);
  const singleValue = (optionName) => (value, previous) => {
    if (value.startsWith('--')) throw new InvalidArgumentError(`${optionName} expects a value`);
    if (previous !== undefined) throw new InvalidArgumentError(`${optionName} may only be specified once`);
    return value;
  };
  function addValueOption(command, flags, description, settings_) {
    const settings = settings_ ?? {};
    const option = new Option(flags, description);
    const parseValue = settings.repeatable ? collect : singleValue(flags.split(' ')[0]);
    if (settings.choices) {
      option.choices(settings.choices);
      const parseChoice = option.parseArg;
      option.argParser((value, previous) => parseChoice(parseValue(value, previous), previous));
    } else {
      option.argParser(parseValue);
    }
    if (settings.required) option.makeOptionMandatory();
    return command.addOption(option);
  }
  const addDateOption = (command, flags, description) => addValueOption(command, flags, description);
  const addDateBasisOption = (command) => addValueOption(
    command, '--date-basis <basis>', 'select posting or transaction dates',
    { choices: ['posting', 'transaction'] },
  );
  const addAccountPrefixes = (command) => addValueOption(
    command, '--accounts <prefix>', 'include an account prefix (repeatable)', { repeatable: true },
  );
  const addDirectory = (command) => addValueOption(
    command, '--directory <path>', 'start project discovery in this directory',
  );
  const addJson = (command) => command.option('--json', 'write the complete API result as JSON');

  function createProgram() {
    const program = new Command().name('ledlight')
      .description('Query Ledger-compatible accounting data').helpOption(false)
      .addHelpCommand(false).exitOverride()
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });

    const parse = program.command('parse <source-text>').description('parse Ledger source text');
    addValueOption(parse, '--source <name>', 'identify the source in locations and errors');
    program.command('load-journal <entry-path>').description('load a journal and its include tree');
    for (const [name, description] of [
      ['project-paths', 'discover project, journal, and database paths'],
      ['ensure-database', 'ensure that the project database is current'],
      ['open-project', 'open a project and print its snapshot metadata'],
    ]) addDirectory(program.command(name).description(description));

    const accountBalances = program.command('account-balances').description('show balances for one exact account');
    addDirectory(accountBalances);
    addValueOption(accountBalances, '--account <name>', 'select an exact account', { required: true });
    addDateOption(accountBalances, '--to <date>', 'include entries on or before YYYY-MM-DD');
    const accountPostings = program.command('account-postings').description('show postings for one exact account');
    addDirectory(accountPostings);
    addValueOption(accountPostings, '--account <name>', 'select an exact account', { required: true });
    addDateOption(accountPostings, '--after <date>', 'include activity after YYYY-MM-DD');
    const accountTransactions = program.command('account-transactions').description('show transactions for one exact account');
    addDirectory(accountTransactions);
    addValueOption(accountTransactions, '--account <name>', 'select an exact account', { required: true });
    for (const [name, description] of [
      ['commodity-descriptions', 'show declared commodities'],
      ['ledger-accounts', 'show declared and used accounts'],
    ]) addDirectory(program.command(name).description(description));

    const ledgerTransaction = program.command('ledger-transaction').description('show one transaction');
    addDirectory(ledgerTransaction);
    addValueOption(ledgerTransaction, '--transaction-id <id>', 'select a transaction ID', { required: true });
    const ledgerTransactions = program.command('ledger-transactions').description('show a page of transactions');
    addDirectory(ledgerTransactions);
    addValueOption(ledgerTransactions, '--order <order>', 'sort transactions', { choices: ['newest', 'oldest'], required: true });
    addValueOption(ledgerTransactions, '--page <number>', 'select a page', { required: true });
    addValueOption(ledgerTransactions, '--page-size <number>', 'set the page size (maximum 100)', { required: true });
    const valuationRate = program.command('valuation-rate').description('resolve a valuation rate');
    addDirectory(valuationRate);
    addValueOption(valuationRate, '--commodity <name>', 'select the source commodity', { required: true });
    addDateOption(valuationRate, '--through-date <date>', 'use prices on or before YYYY-MM-DD');

    const aggregate = program.command('aggregate').description('aggregate account balances');
    addDirectory(aggregate);
    addDateOption(aggregate, '--from <date>', 'include entries on or after YYYY-MM-DD');
    addDateOption(aggregate, '--to <date>', 'include entries on or before YYYY-MM-DD');
    addAccountPrefixes(aggregate); addDateBasisOption(aggregate); addJson(aggregate);
    aggregate.option('--value', 'convert amounts to the valuation commodity')
      .option('--with-valuation-value', 'add the valuation value to commodity rows')
      .option('--invert', 'invert the sign of report amounts')
      .option('--include-total', 'append an exact total (requires --value)')
      .option('--csv', 'write CSV output');

    const balanceHistory = program.command('balance-history').description('show balances over time');
    addDirectory(balanceHistory);
    addDateOption(balanceHistory, '--from <date>', 'include entries on or after YYYY-MM-DD');
    addDateOption(balanceHistory, '--to <date>', 'include entries on or before YYYY-MM-DD');
    addAccountPrefixes(balanceHistory); addDateBasisOption(balanceHistory);
    addValueOption(balanceHistory, '--account-factor <account=factor>', 'factor an exact account (repeatable)', { repeatable: true });
    addJson(balanceHistory);
    balanceHistory.option('--invert', 'invert the sign of report amounts').option('--csv', 'write CSV output');

    const gain = program.command('gain').description('show investment gains');
    addDirectory(gain); addDateOption(gain, '--to <date>', 'include entries on or before YYYY-MM-DD');
    addAccountPrefixes(gain); addDateBasisOption(gain); addJson(gain); gain.option('--csv', 'write CSV output');
    const performance = program.command('investment-performance').description('show investment performance');
    addDirectory(performance);
    addDateOption(performance, '--from <date>', 'include entries on or after YYYY-MM-DD');
    addDateOption(performance, '--to <date>', 'include entries on or before YYYY-MM-DD');
    addAccountPrefixes(performance);
    addValueOption(performance, '--commodities <name>', 'include a commodity (repeatable)', { repeatable: true });
    addValueOption(performance, '--exclude-commodities <name>', 'exclude a commodity (repeatable)', { repeatable: true });
    addJson(performance);
    return program;
  }

  function usage() {
    const program = createProgram();
    return [program, ...program.commands].map((command) => command.helpInformation().trimEnd()).join('\n\n');
  }
  function accountFactors(values) {
    if (values === undefined) return undefined;
    return Object.fromEntries(values.map((value) => {
      const separator = value.indexOf('=');
      if (separator <= 0 || separator === value.length - 1) {
        throw new InvalidArgumentError('--account-factor expects ACCOUNT=FACTOR');
      }
      return [value.slice(0, separator), value.slice(separator + 1)];
    }));
  }
  const compact = (object) => Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  );
  function parsedResult(commandName, options, positional) {
    const common = { command: commandName, startDirectory: options.directory };
    if (commandName === 'parse') return { ...common, arguments: [positional[0], compact({ source: options.source })] };
    if (commandName === 'load-journal') return { ...common, arguments: [positional[0]] };
    if (['project-paths', 'ensure-database', 'open-project', 'commodity-descriptions', 'ledger-accounts'].includes(commandName)) return common;
    if (commandName === 'account-balances') return { ...common, options: compact({ account: options.account, to: options.to }) };
    if (commandName === 'account-postings') return { ...common, options: compact({ account: options.account, after: options.after }) };
    if (commandName === 'account-transactions') return { ...common, options: { account: options.account } };
    if (commandName === 'ledger-transaction') return { ...common, options: { transactionId: options.transactionId } };
    if (commandName === 'ledger-transactions') return { ...common, options: { order: options.order, page: options.page, pageSize: options.pageSize } };
    if (commandName === 'valuation-rate') return { ...common, options: compact({ commodity: options.commodity, throughDate: options.throughDate }) };
    const reportOptions = compact({
      from: options.from, to: options.to, accounts: options.accounts || [],
      dateBasis: options.dateBasis, invert: options.invert || undefined,
    });
    if (commandName === 'aggregate') Object.assign(reportOptions, compact({
      inValuationCommodity: options.value || undefined,
      withValuationValue: options.withValuationValue || undefined,
      includeTotal: options.includeTotal || undefined,
    }));
    if (commandName === 'balance-history') {
      const factors = accountFactors(options.accountFactor);
      if (factors !== undefined) reportOptions.accountFactors = factors;
    }
    if (commandName === 'investment-performance') {
      reportOptions.commodities = options.commodities || [];
      reportOptions.excludeCommodities = options.excludeCommodities || [];
    }
    return { ...common, reportOptions, output: { csv: options.csv || false, json: options.json || false } };
  }
  function parseArguments(arguments_) {
    const program = createProgram();
    if (arguments_.length === 0) throw new Error(usage());
    let selectedCommand;
    for (const command of program.commands) command.action((...actionArguments) => {
      const commandObject = actionArguments.at(-1);
      selectedCommand = { name: command.name(), options: commandObject.opts(), positional: actionArguments.slice(0, -1) };
    });
    try {
      program.parse(arguments_, { from: 'user' });
    } catch (error) {
      if (!(error.code?.startsWith('commander.') || error instanceof InvalidArgumentError)) throw error;
      const message = error.message.replace(/^error: /u, '');
      const command = program.commands.find((candidate) => candidate.name() === arguments_[0]);
      throw new Error(`${message}\n\n${(command || program).helpInformation().trimEnd()}`);
    }
    if (!selectedCommand) throw new Error(usage());
    return parsedResult(selectedCommand.name, selectedCommand.options, selectedCommand.positional);
  }
  return { apiCommands: API_COMMANDS, parseArguments, usage };
};
