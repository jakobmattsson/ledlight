'use strict';

const { Command, InvalidArgumentError, Option } = require('commander');

module.exports = ({
  project: { apiDefinitions: projectDefinitions },
}) => {
  const definitions = Object.freeze({ ...projectDefinitions });

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
    if (settings.apiInput) option.apiInput = settings.apiInput;
    return command.addOption(option);
  }
  function registerCommand(command, operation) {
    command.apiOperation = operation;
    return command.addOption(new Option('-h, --help', 'show command help'));
  }
  const addBooleanOption = (command, flags, description, apiInput) => {
    const option = new Option(flags, description);
    option.apiInput = apiInput;
    return command.addOption(option);
  };
  const addDateOption = (command, flags, description, apiInput) =>
    addValueOption(command, flags, description, { apiInput });
  const addDateBasisOption = (command) => addValueOption(
    command, '--date-basis <basis>', 'select posting or transaction dates',
    { choices: ['posting', 'transaction'], apiInput: 'dateBasis' },
  );
  const addAccountPrefixes = (command) => addValueOption(
    command, '--accounts <prefix>', 'include an account prefix (repeatable)',
    { repeatable: true, apiInput: 'accounts' },
  );
  const addDirectory = (command) => addValueOption(
    command, '--directory <path>', 'start project discovery in this directory',
    { apiInput: 'startDirectory' },
  );
  const addJson = (command) => command.option('--json', 'write the complete API result as JSON');

  function createProgram() {
    const program = new Command().name('ledlight')
      .description('Query Ledger-compatible accounting data').helpOption(false)
      .addHelpCommand(false).exitOverride()
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });
    program.addOption(new Option('-V, --version', 'show the package version'));
    program.addOption(new Option('-h, --help', 'show help'));

    addDirectory(registerCommand(
      program.command('open-project').description('open a project and print its snapshot metadata'),
      'openProject',
    ));

    const accountBalances = registerCommand(
      program.command('account-balances').description('show balances for one exact account'),
      'accountBalances',
    );
    addDirectory(accountBalances);
    addValueOption(accountBalances, '--account <name>', 'select an exact account', {
      required: true, apiInput: 'account',
    });
    addDateOption(accountBalances, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    const accountPostings = registerCommand(
      program.command('account-postings').description('show postings for one exact account'),
      'accountPostings',
    );
    addDirectory(accountPostings);
    addValueOption(accountPostings, '--account <name>', 'select an exact account', {
      required: true, apiInput: 'account',
    });
    addDateOption(accountPostings, '--after <date>', 'include activity after YYYY-MM-DD', 'after');
    const accountTransactions = registerCommand(
      program.command('account-transactions').description('show transactions for one exact account'),
      'accountTransactions',
    );
    addDirectory(accountTransactions);
    addValueOption(accountTransactions, '--account <name>', 'select an exact account', {
      required: true, apiInput: 'account',
    });
    for (const [name, operation, description] of [
      ['commodity-descriptions', 'commodityDescriptions', 'show declared commodities'],
      ['ledger-accounts', 'ledgerAccounts', 'show declared and used accounts'],
    ]) addDirectory(registerCommand(program.command(name).description(description), operation));

    const ledgerTransaction = registerCommand(
      program.command('ledger-transaction').description('show one transaction'),
      'ledgerTransaction',
    );
    addDirectory(ledgerTransaction);
    addValueOption(ledgerTransaction, '--transaction-id <id>', 'select a transaction ID', {
      required: true, apiInput: 'transactionId',
    });
    const ledgerTransactions = registerCommand(
      program.command('ledger-transactions').description('show a page of transactions'),
      'ledgerTransactions',
    );
    addDirectory(ledgerTransactions);
    addValueOption(ledgerTransactions, '--order <order>', 'sort transactions', {
      choices: ['newest', 'oldest'], required: true, apiInput: 'order',
    });
    addValueOption(ledgerTransactions, '--page <number>', 'select a page', {
      required: true, apiInput: 'page',
    });
    addValueOption(ledgerTransactions, '--page-size <number>', 'set the page size (maximum 100)', {
      required: true, apiInput: 'pageSize',
    });
    const valuationRate = registerCommand(
      program.command('valuation-rate').description('resolve a valuation rate'),
      'ledgerValuationRateResolver',
    );
    addDirectory(valuationRate);
    addValueOption(valuationRate, '--commodity <name>', 'select the source commodity', {
      required: true, apiInput: 'commodity',
    });
    addDateOption(valuationRate, '--through-date <date>', 'use prices on or before YYYY-MM-DD', 'throughDate');

    const aggregate = registerCommand(
      program.command('aggregate').description('aggregate account balances'),
      'aggregateReport',
    );
    addDirectory(aggregate);
    addDateOption(aggregate, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(aggregate, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPrefixes(aggregate); addDateBasisOption(aggregate); addJson(aggregate);
    addBooleanOption(aggregate, '--value', 'convert amounts to the valuation commodity', 'inValuationCommodity');
    addBooleanOption(aggregate, '--with-valuation-value', 'add the valuation value to commodity rows', 'withValuationValue');
    addBooleanOption(aggregate, '--invert', 'invert the sign of report amounts', 'invert');
    addBooleanOption(aggregate, '--include-total', 'append an exact total (requires --value)', 'includeTotal');
    aggregate.option('--csv', 'write CSV output');

    const balanceHistory = registerCommand(
      program.command('balance-history').description('show balances over time'),
      'balanceHistoryReport',
    );
    addDirectory(balanceHistory);
    addDateOption(balanceHistory, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(balanceHistory, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPrefixes(balanceHistory); addDateBasisOption(balanceHistory);
    addValueOption(balanceHistory, '--account-factor <account=factor>', 'factor an exact account (repeatable)', {
      repeatable: true, apiInput: 'accountFactors',
    });
    addJson(balanceHistory);
    addBooleanOption(balanceHistory, '--invert', 'invert the sign of report amounts', 'invert');
    balanceHistory.option('--csv', 'write CSV output');

    const gain = registerCommand(
      program.command('gain').description('show investment gains'),
      'gainReport',
    );
    addDirectory(gain);
    addDateOption(gain, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPrefixes(gain); addDateBasisOption(gain); addJson(gain); gain.option('--csv', 'write CSV output');
    const performance = registerCommand(
      program.command('investment-performance').description('show investment performance'),
      'investmentPerformance',
    );
    addDirectory(performance);
    addDateOption(performance, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(performance, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPrefixes(performance);
    addValueOption(performance, '--commodities <name>', 'include a commodity (repeatable)', {
      repeatable: true, apiInput: 'commodities',
    });
    addValueOption(performance, '--exclude-commodities <name>', 'exclude a commodity (repeatable)', {
      repeatable: true, apiInput: 'excludeCommodities',
    });
    addJson(performance);
    return program;
  }

  function usage(commandName) {
    const program = createProgram();
    if (commandName === undefined) {
      return `${program.helpInformation().trimEnd()}\n\n` +
        'Run "ledlight <command> --help" for detailed command usage.';
    }
    const command = program.commands.find((candidate) => candidate.name() === commandName);
    if (!command) throw new Error(`Unknown command: ${commandName}`);
    return command.helpInformation().trimEnd();
  }
  function commandCoverage() {
    return Object.fromEntries(createProgram().commands.map((command) => [
      command.apiOperation,
      {
        command: command.name(),
        inputs: command.options
          .filter((option) => option.apiInput)
          .map((option) => option.apiInput),
      },
    ]));
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
  function parsedResult(commandName, options) {
    const common = { command: commandName, startDirectory: options.directory };
    if (['open-project', 'commodity-descriptions', 'ledger-accounts'].includes(commandName)) return common;
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
      selectedCommand = { name: command.name(), options: commandObject.opts() };
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
    return parsedResult(selectedCommand.name, selectedCommand.options);
  }
  const apiInputCoverage = commandCoverage();
  const apiCommands = Object.freeze(Object.fromEntries(
    Object.entries(apiInputCoverage).map(([operation, coverage]) => [operation, coverage.command]),
  ));
  const operationNames = new Set([
    ...Object.keys(definitions),
    ...Object.keys(apiInputCoverage),
  ]);
  for (const operation of operationNames) {
    const apiInputs = [...(definitions[operation]?.inputs ?? [])].sort();
    const cliInputs = [...(apiInputCoverage[operation]?.inputs ?? [])].sort();
    if (JSON.stringify(apiInputs) !== JSON.stringify(cliInputs)) {
      throw new Error(`CLI inputs do not cover the ${operation} API contract`);
    }
  }
  return { apiCommands, apiInputCoverage, parseArguments, usage };
};
