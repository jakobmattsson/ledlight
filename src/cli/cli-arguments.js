'use strict';

const { Command, InvalidArgumentError, Option } = require('commander');

module.exports = ({
  cliConfiguration,
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
    const optionDescription = settings.required ? `(REQUIRED) ${description}` : description;
    const option = new Option(flags, optionDescription);
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
    return command;
  }
  const addBooleanOption = (command, flags, description, apiInput) => {
    const option = new Option(flags, description);
    option.apiInput = apiInput;
    return command.addOption(option);
  };
  const addOutputBooleanOption = (command, flags, description, outputInput) => {
    const option = new Option(flags, description);
    option.outputInput = outputInput;
    return command.addOption(option);
  };
  const addOutputValueOption = (command, flags, description, settings_) => {
    const option = new Option(flags, description);
    const settings = settings_ ?? {};
    option.argParser(singleValue(flags.split(' ')[0]));
    if (settings.choices) option.choices(settings.choices);
    if (settings.defaultValue !== undefined) option.default(settings.defaultValue);
    option.outputInput = settings.outputInput;
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
  const addJournal = (command) => addValueOption(
    command, '--file <path>', 'read the journal rooted at this file',
    { required: true, apiInput: 'journalPath' },
  );
  const addJson = (command) => addOutputBooleanOption(
    command, '--json', 'write the complete API result as JSON', 'json',
  );

  function createProgram() {
    const program = new Command().name('ledlight').usage('<command> [options]')
      .description('Query Ledger-compatible accounting data').helpOption(false)
      .addHelpCommand(false).exitOverride()
      .configureHelp({ subcommandTerm: (command) => command.name() })
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });

    const accounts = registerCommand(
      program.command('accounts').description('show declared and used accounts'),
      'accounts',
    );
    addJournal(accounts);
    addOutputBooleanOption(
      accounts, '--details', 'include comments and transaction counts', 'details',
    );
    addOutputValueOption(accounts, '--format <format>', 'select the output format', {
      choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format',
    });
    const accountBalances = registerCommand(
      program.command('account-balances').description('show balances for one exact account'),
      'accountBalances',
    );
    addJournal(accountBalances);
    addValueOption(accountBalances, '--account <name>', 'select an exact account', {
      required: true, apiInput: 'account',
    });
    addDateOption(accountBalances, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    const accountPostings = registerCommand(
      program.command('account-postings').description('show postings for one exact account'),
      'accountPostings',
    );
    addJournal(accountPostings);
    addValueOption(accountPostings, '--account <name>', 'select an exact account', {
      required: true, apiInput: 'account',
    });
    addDateOption(accountPostings, '--after <date>', 'include activity after YYYY-MM-DD', 'after');
    const accountTransactions = registerCommand(
      program.command('account-transactions').description('show transactions for one exact account'),
      'accountTransactions',
    );
    addJournal(accountTransactions);
    addValueOption(accountTransactions, '--account <name>', 'select an exact account', {
      required: true, apiInput: 'account',
    });
    const commodityDescriptions = registerCommand(
      program.command('commodity-descriptions').description('show declared commodities'),
      'commodityDescriptions',
    );
    addJournal(commodityDescriptions);

    const ledgerTransaction = registerCommand(
      program.command('ledger-transaction').description('show one transaction'),
      'ledgerTransaction',
    );
    addJournal(ledgerTransaction);
    addValueOption(ledgerTransaction, '--transaction-id <id>', 'select a transaction ID', {
      required: true, apiInput: 'transactionId',
    });
    const ledgerTransactions = registerCommand(
      program.command('ledger-transactions').description('show a page of transactions'),
      'ledgerTransactions',
    );
    addJournal(ledgerTransactions);
    addValueOption(ledgerTransactions, '--order <order>', 'sort transactions', {
      choices: ['newest', 'oldest'], apiInput: 'order',
    });
    addValueOption(ledgerTransactions, '--page <number>', 'select a page', {
      apiInput: 'page',
    });
    addValueOption(ledgerTransactions, '--page-size <number>', 'set the page size (maximum 100)', {
      apiInput: 'pageSize',
    });
    addOutputValueOption(ledgerTransactions, '--format <format>', 'select the output format', {
      choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format',
    });
    const reconciliationEntries = registerCommand(
      program.command('reconciliation-entries')
        .description('show entries for reconciling exact accounts'),
      'reconciliationEntries',
    );
    addJournal(reconciliationEntries);
    addValueOption(reconciliationEntries, '--account <name>', 'select an exact account (repeatable)', {
      repeatable: true, required: true, apiInput: 'accounts',
    });
    addBooleanOption(
      reconciliationEntries,
      '--related',
      'show other postings from the selected accounts\' transactions',
      'related',
    );
    const valuationRate = registerCommand(
      program.command('valuation-rate').description('resolve a valuation rate'),
      'ledgerValuationRateResolver',
    );
    addJournal(valuationRate);
    addValueOption(valuationRate, '--commodity <name>', 'select the source commodity', {
      required: true, apiInput: 'commodity',
    });
    addDateOption(valuationRate, '--through-date <date>', 'use prices on or before YYYY-MM-DD', 'throughDate');

    const aggregate = registerCommand(
      program.command('aggregate').description('aggregate account balances'),
      'aggregateReport',
    );
    addJournal(aggregate);
    addDateOption(aggregate, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(aggregate, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPrefixes(aggregate); addDateBasisOption(aggregate); addJson(aggregate);
    addBooleanOption(aggregate, '--value', 'convert amounts to the valuation commodity', 'inValuationCommodity');
    addBooleanOption(aggregate, '--with-valuation-value', 'add the valuation value to commodity rows', 'withValuationValue');
    addBooleanOption(aggregate, '--invert', 'invert the sign of report amounts', 'invert');
    addBooleanOption(aggregate, '--include-total', 'append an exact total (requires --value)', 'includeTotal');
    addOutputBooleanOption(aggregate, '--csv', 'write CSV output', 'csv');

    const balanceHistory = registerCommand(
      program.command('balance-history').description('show balances over time'),
      'balanceHistoryReport',
    );
    addJournal(balanceHistory);
    addDateOption(balanceHistory, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(balanceHistory, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPrefixes(balanceHistory); addDateBasisOption(balanceHistory);
    addValueOption(balanceHistory, '--account-factor <account=factor>', 'factor an exact account (repeatable)', {
      repeatable: true, apiInput: 'accountFactors',
    });
    addJson(balanceHistory);
    addBooleanOption(balanceHistory, '--invert', 'invert the sign of report amounts', 'invert');
    addOutputBooleanOption(balanceHistory, '--csv', 'write CSV output', 'csv');

    const gain = registerCommand(
      program.command('gain').description('show investment gains'),
      'gainReport',
    );
    addJournal(gain);
    addDateOption(gain, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPrefixes(gain); addDateBasisOption(gain); addJson(gain);
    addOutputBooleanOption(gain, '--csv', 'write CSV output', 'csv');
    const performance = registerCommand(
      program.command('investment-performance').description('show investment performance'),
      'investmentPerformance',
    );
    addJournal(performance);
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
    for (const command of program.commands) {
      const mandatoryOptions = command.options
        .filter((option) => option.mandatory)
        .map((option) => option.flags);
      command.usage(`${mandatoryOptions.join(' ')} [options]`);
      command.addOption(new Option('--help', 'show command help'));
    }
    program.addOption(new Option('--version', 'show the package version'));
    program.addOption(new Option('--help', 'show help'));
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
    return Object.fromEntries(createProgram().commands.map((command) => {
      for (const option of command.options.filter((candidate) => candidate.attributeName() !== 'help')) {
        if (Boolean(option.apiInput) === Boolean(option.outputInput)) {
          throw new Error(
            `CLI option ${option.flags} must declare exactly one API or output input`,
          );
        }
      }
      return [command.apiOperation, {
        command: command.name(),
        inputs: command.options
          .filter((option) => option.apiInput)
          .map((option) => option.apiInput),
        outputInputs: command.options
          .filter((option) => option.outputInput)
          .map((option) => option.outputInput),
      }];
    }));
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
    const common = { command: commandName, journalPath: options.file };
    if (commandName === 'commodity-descriptions') return common;
    if (commandName === 'accounts') {
      return {
        ...common,
        output: { details: options.details || false, format: options.format },
      };
    }
    if (commandName === 'account-balances') return { ...common, options: compact({ account: options.account, to: options.to }) };
    if (commandName === 'account-postings') return { ...common, options: compact({ account: options.account, after: options.after }) };
    if (commandName === 'account-transactions') return { ...common, options: { account: options.account } };
    if (commandName === 'ledger-transaction') return { ...common, options: { transactionId: options.transactionId } };
    if (commandName === 'ledger-transactions') {
      return {
        ...common,
        options: compact({ order: options.order, page: options.page, pageSize: options.pageSize }),
        output: { format: options.format },
      };
    }
    if (commandName === 'reconciliation-entries') {
      return { ...common, options: compact({ accounts: options.account, related: options.related || undefined }) };
    }
    if (commandName === 'valuation-rate') return { ...common, options: compact({ commodity: options.commodity, throughDate: options.throughDate }) };
    const reportOptions = compact({
      from: options.from, to: options.to, accounts: options.accounts || [],
      dateBasis: options.dateBasis, invert: options.invert || undefined,
    });
    if (commandName === 'aggregate') {
      Object.assign(reportOptions, compact({
        inValuationCommodity: options.value || undefined,
        withValuationValue: options.withValuationValue || undefined,
        includeTotal: options.includeTotal || undefined,
      }));
    }
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
    arguments_ = cliConfiguration.apply(arguments_);
    const program = createProgram();
    if (arguments_.length === 0) throw new Error(usage());
    let selectedCommand;
    for (const command of program.commands) {
      command.action((...actionArguments) => {
        const commandObject = actionArguments.at(-1);
        selectedCommand = { name: command.name(), options: commandObject.opts() };
      });
    }
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
