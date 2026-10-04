'use strict';

const {
  Command, Help, InvalidArgumentError, Option,
} = require('commander');

const HELP_GROUP = Symbol('helpGroup');
const HELP_DETAILS = Symbol('helpDetails');

function formatGroupedHelp(command, helper) {
  const help = Help.prototype.formatHelp.call(helper, command, helper);
  if (command.parent || command.commands.length === 0) return help;

  const termWidth = helper.padWidth(command, helper);
  const commands = helper.visibleCommands(command);
  const formatCommands = (group) => commands
    .filter((candidate) => candidate[HELP_GROUP] === group)
    .map((candidate) => helper.formatItem(
      helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
      termWidth,
      helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
      helper,
    ));
  const defaultCommandList = commands.map((candidate) => helper.formatItem(
    helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
    termWidth,
    helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
    helper,
  ));
  const defaultSection = [helper.styleTitle('Commands:'), ...defaultCommandList, ''].join('\n');
  const groupedSection = ['raw', 'reports', 'misc'].flatMap((group) => [
    helper.styleTitle(`${group}:`),
    ...formatCommands(group),
    '',
  ]).join('\n');

  return help.replace(defaultSection, groupedSection);
}

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
  function registerCommand(command, operation, helpGroup) {
    command.apiOperation = operation;
    command[HELP_GROUP] = helpGroup;
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
  const addCliBooleanOption = (command, flags, description) => {
    const option = new Option(flags, description);
    option.cliInput = true;
    return command.addOption(option);
  };
  const addDateOption = (command, flags, description, apiInput) =>
    addValueOption(command, flags, description, { apiInput });
  const addDateBasisOption = (command) => addValueOption(
    command, '--date-basis <basis>', 'select posting or transaction dates',
    { choices: ['posting', 'transaction'], apiInput: 'dateBasis' },
  );
  const addAccountPatterns = (command) => addValueOption(
    command, '--accounts <pattern>', 'include accounts matching a pattern (repeatable)',
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
      .configureHelp({
        formatHelp: formatGroupedHelp,
        subcommandTerm: (command) => [command.name(), ...command.aliases()].join('|'),
      })
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });

    const accounts = registerCommand(
      program.command('accounts').description('show declared accounts'),
      'accounts',
      'raw',
    );
    addJournal(accounts);
    addAccountPatterns(accounts);
    addOutputBooleanOption(
      accounts, '--details', 'include comments and transaction counts', 'details',
    );
    addOutputValueOption(accounts, '--format <format>', 'select the output format', {
      choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format',
    });
    for (const [name, operation, description] of [
      ['tags', 'tags', 'show declared tags'],
      ['commodities', 'commodities', 'show declared commodities'],
      ['prices', 'prices', 'show price directives'],
    ]) {
      const command = registerCommand(
        program.command(name).description(description), operation, 'raw',
      );
      addJournal(command);
      addOutputValueOption(command, '--format <format>', 'select the output format', {
        choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format',
      });
    }
    const accountPostings = registerCommand(
      program.command('account-postings').description('show postings for matching accounts'),
      'accountPostings',
      'misc',
    );
    addJournal(accountPostings);
    addValueOption(accountPostings, '--accounts <pattern>', 'select matching accounts (repeatable)', {
      repeatable: true, required: true, apiInput: 'accounts',
    });
    addDateOption(accountPostings, '--after <date>', 'include activity after YYYY-MM-DD', 'after');
    const accountTransactions = registerCommand(
      program.command('account-transactions').description('show transactions for matching accounts'),
      'accountTransactions',
      'misc',
    );
    addJournal(accountTransactions);
    addValueOption(accountTransactions, '--accounts <pattern>', 'select matching accounts (repeatable)', {
      repeatable: true, required: true, apiInput: 'accounts',
    });
    const commodityDescriptions = registerCommand(
      program.command('commodity-descriptions').description('show declared commodities'),
      'commodityDescriptions',
      'misc',
    );
    addJournal(commodityDescriptions);

    const transactions = registerCommand(
      program.command('transactions').alias('print')
        .description('show a page of transactions'),
      'transactions',
      'raw',
    );
    addJournal(transactions);
    addAccountPatterns(transactions);
    addValueOption(transactions, '--id <id>', 'select one transaction ID', {
      apiInput: 'id',
    });
    addValueOption(transactions, '--order <order>', 'sort transactions', {
      choices: ['newest', 'oldest'], apiInput: 'order',
    });
    addValueOption(transactions, '--page <number>', 'select a page', {
      apiInput: 'page',
    });
    addValueOption(transactions, '--page-size <number>', 'set the page size (maximum 100)', {
      apiInput: 'pageSize',
    });
    addOutputValueOption(transactions, '--format <format>', 'select the output format', {
      choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format',
    });
    const reconciliationEntries = registerCommand(
      program.command('reconciliation-entries')
        .description('show entries for reconciling matching accounts'),
      'reconciliationEntries',
      'misc',
    );
    addJournal(reconciliationEntries);
    addValueOption(reconciliationEntries, '--account <pattern>', 'select matching accounts (repeatable)', {
      repeatable: true, required: true, apiInput: 'accounts',
    });
    addBooleanOption(
      reconciliationEntries,
      '--related',
      'show other postings from the selected accounts\' transactions',
      'related',
    );
    const aggregate = registerCommand(
      program.command('balance').description('show account balances'),
      'aggregateReport',
      'misc',
    );
    addJournal(aggregate);
    addDateOption(aggregate, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(aggregate, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPatterns(aggregate); addDateBasisOption(aggregate);
    addValueOption(aggregate, '--group-by <dimension>', 'group balances by account or commodity', {
      choices: ['account', 'commodity'], apiInput: 'groupBy',
    });
    addBooleanOption(aggregate, '--value', 'convert amounts to the valuation commodity', 'inValuationCommodity');
    addBooleanOption(aggregate, '--with-valuation-value', 'add the valuation value to commodity rows', 'withValuationValue');
    addBooleanOption(aggregate, '--invert', 'invert the sign of report amounts', 'invert');
    addBooleanOption(aggregate, '--include-total', 'append an exact total (requires --value)', 'includeTotal');
    addOutputValueOption(aggregate, '--format <format>', 'select the output format', {
      choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format',
    });

    const balanceHistory = registerCommand(
      program.command('balance-history').description('show balances over time'),
      'balanceHistoryReport',
      'misc',
    );
    addJournal(balanceHistory);
    addDateOption(balanceHistory, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(balanceHistory, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPatterns(balanceHistory); addDateBasisOption(balanceHistory);
    addValueOption(balanceHistory, '--account-factor <pattern=factor>', 'factor matching accounts (repeatable)', {
      repeatable: true, apiInput: 'accountFactors',
    });
    addJson(balanceHistory);
    addBooleanOption(balanceHistory, '--invert', 'invert the sign of report amounts', 'invert');
    addOutputBooleanOption(balanceHistory, '--csv', 'write CSV output', 'csv');

    const unrealizedGains = registerCommand(
      program.command('unrealized-gains').description('show unrealized investment gains'),
      'unrealizedGains',
      'reports',
    );
    addJournal(unrealizedGains);
    addDateOption(unrealizedGains, '--at <date>', 'show gains at YYYY-MM-DD', 'at');
    addAccountPatterns(unrealizedGains); addDateBasisOption(unrealizedGains);
    addOutputValueOption(unrealizedGains, '--format <format>', 'select the output format', {
      choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format',
    });
    addOutputBooleanOption(unrealizedGains, '--total', 'append the total gain', 'total');
    const performance = registerCommand(
      program.command('investment-performance').description('show investment performance'),
      'investmentPerformance',
      'misc',
    );
    performance[HELP_DETAILS] = `Return measures:
  Time-weighted return
    The compounded daily investment return after removing each day's net
    external cash flow from its closing value. Cash flows are treated as
    occurring at the end of the day, so their amount and timing do not affect
    the measured investment performance.

  Money-weighted return (total)
    The cumulative investor return accounting for the amount and date of the
    opening value, contributions, withdrawals, and ending value. It is the
    annualized XIRR compounded over the interval from the first to the last
    non-zero investor cash flow.

  Money-weighted return (annualized)
    The yearly compound rate (XIRR) that makes the present value of the dated
    opening value, contributions, withdrawals, and ending value equal zero.
    It allows periods of different lengths to be compared.`;
    addJournal(performance);
    addDateOption(performance, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    addDateOption(performance, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    addAccountPatterns(performance);
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
      addCliBooleanOption(
        command,
        '--ledger',
        'show the equivalent standalone Ledger command',
      );
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
    const command = program.commands.find((candidate) =>
      candidate.name() === commandName || candidate.aliases().includes(commandName));
    if (!command) throw new Error(`Unknown command: ${commandName}`);
    return [command.helpInformation().trimEnd(), command[HELP_DETAILS]]
      .filter(Boolean)
      .join('\n\n');
  }
  function commandCoverage() {
    return Object.fromEntries(createProgram().commands.map((command) => {
      for (const option of command.options.filter((candidate) =>
        candidate.attributeName() !== 'help' && !candidate.cliInput)) {
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
        options: { accounts: options.accounts || [] },
        output: { details: options.details || false, format: options.format },
      };
    }
    if (['tags', 'commodities', 'prices'].includes(commandName)) {
      return { ...common, output: { format: options.format } };
    }
    if (commandName === 'account-postings') return { ...common, options: compact({ accounts: options.accounts, after: options.after }) };
    if (commandName === 'account-transactions') return { ...common, options: { accounts: options.accounts } };
    if (commandName === 'transactions') {
      return {
        ...common,
        options: compact({
          accounts: options.accounts || [], id: options.id, order: options.order,
          page: options.page, pageSize: options.pageSize,
        }),
        output: { format: options.format },
      };
    }
    if (commandName === 'reconciliation-entries') {
      return { ...common, options: compact({ accounts: options.account, related: options.related || undefined }) };
    }
    const reportOptions = compact({
      from: options.from, to: options.to, at: options.at, accounts: options.accounts || [],
      dateBasis: options.dateBasis, invert: options.invert || undefined,
    });
    if (commandName === 'balance') {
      Object.assign(reportOptions, compact({
        inValuationCommodity: options.value || undefined,
        withValuationValue: options.withValuationValue || undefined,
        includeTotal: options.includeTotal || undefined,
        groupBy: options.groupBy,
      }));
      return { ...common, reportOptions, output: { format: options.format } };
    }
    if (commandName === 'unrealized-gains') {
      return {
        ...common,
        reportOptions,
        output: { format: options.format, total: options.total || false },
      };
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
    const parsed = parsedResult(selectedCommand.name, selectedCommand.options);
    return selectedCommand.options.ledger ? { ...parsed, ledger: true } : parsed;
  }
  function shellArgument(value) {
    if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) return value;
    return `'${value.replaceAll("'", "'\\''")}'`;
  }
  function ledgerCommand(parsed) {
    const prefix = `ledger --args-only --no-pager --file ${shellArgument(parsed.journalPath)}`;
    if (parsed.command === 'accounts' &&
        !parsed.output.details && parsed.output.format === 'text') {
      const filters = parsed.options.accounts.map(shellArgument);
      return [prefix, 'accounts', ...filters].join(' ');
    }
    if (parsed.command === 'transactions' &&
        parsed.options.id === undefined && parsed.options.order === undefined &&
        parsed.options.page === undefined && parsed.options.pageSize === undefined &&
        parsed.output.format === 'text') {
      const filters = parsed.options.accounts.map(shellArgument);
      return [prefix, 'print', ...filters].join(' ');
    }
    return 'No ledger equivalent command exists';
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
  return { apiCommands, apiInputCoverage, ledgerCommand, parseArguments, usage };
};
