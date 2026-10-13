'use strict';

type Decimal = { coefficient: bigint; scale: number };
type Fraction = { n: bigint; d: bigint };
type CodedError = Error & { code?: string; sqliteCode?: string };
type OptionSchema<Value> = {
  safeParse(input: unknown): { success: boolean; data?: Value };
  default(value: Value): OptionSchema<Value>;
};
type ValidationSchema<Options> = { safeParse(value: unknown):
  | { success: true; data: Options }
  | { success: false; error: { issues: Array<{
    code: string; keys?: string[]; path: Array<string | number>; message: string;
  }> } };
};
type IndexedFraction = ReadonlyArray<readonly [number, Fraction]>;
type Constraint = { coefficients: IndexedFraction; bound: Fraction };
type Optimization =
  | { status: 'infeasible' | 'unbounded' }
  | { status: 'optimal'; value: Fraction; solution: Fraction[] };
type ReportRow = { commodity: string; quantity: string; valuationValue?: string };
type TotalRow = ReportRow & { account: 'Total'; isTotal: true };
type PriceRow = { date: string; base_commodity: string; quote_commodity: string; quote_quantity: string };
type DecimalDatabase = {
  aggregate(name: string, options: {
    start(): Decimal;
    step(total: Decimal, value: string | null): Decimal;
    result(total: Decimal): string;
  }): void;
  function(name: string, options: { deterministic: boolean },
    callback: (left: string | null, right: string | null) => string | number | null): void;
};

type Facade = {
  apiOptions: {
    accounts: OptionSchema<string[]>;
    booleanOption: OptionSchema<boolean>;
    dateBasis: OptionSchema<'posting' | 'transaction'>;
    dateOption: OptionSchema<string | undefined>;
    dateRange: { from: OptionSchema<string | undefined>; to: OptionSchema<string | undefined> };
    stringList: OptionSchema<string[]>;
    usage: OptionSchema<'all' | 'used' | 'unused'>;
    valuation: OptionSchema<'cost' | 'market'>;
    validateDateRange(input: { from?: string; to?: string }, context: { addIssue(issue: { code: 'custom'; message: string; path: string[] }): void; }): void;
    parseOptions<Options>(schema: ValidationSchema<Options>, value: unknown, operationName: string): Options;
  };
  pathsForJournal(journalPath: string): { journalPath: string; databasePath: string };
  readConfiguration(): { journalPath?: string; cacheHome?: string };
  decimal: {
    addDecimals(left: Decimal, right: Decimal): Decimal;
    compareDecimals(left: Decimal, right: Decimal): number;
    divideDecimals(left: Decimal, right: Decimal, scale: number): Decimal;
    divideDecimalsHalfEven(left: Decimal, right: Decimal, scale: number): Decimal;
    formatDecimal(decimal: Decimal): string;
    formatDecimalFixed(decimal: Decimal, scale: number): string;
    multiplyDecimals(left: Decimal, right: Decimal): Decimal;
    negateDecimal(decimal: Decimal): Decimal;
    parseDecimal(value: string): Decimal;
    registerDecimalFunctions(database: DecimalDatabase): void;
    subtractDecimals(left: Decimal, right: Decimal): Decimal;
  };
  maximize(variableCount: number, constraints: ReadonlyArray<Constraint>, objective: IndexedFraction): Optimization;
  publicErrors: {
    createError(code: string, message: string, ErrorType?: new (message: string) => CodedError): CodedError;
    databaseError(error: CodedError): CodedError;
    errorCodes: Readonly<{
      SYNTAX: 'LEDLIGHT_SYNTAX';
      INVALID_API_INPUT: 'LEDLIGHT_INVALID_API_INPUT';
      PROJECT_CONFIGURATION: 'LEDLIGHT_PROJECT_CONFIGURATION';
      MISSING_VALUATION_DATA: 'LEDLIGHT_MISSING_VALUATION_DATA';
      DATABASE: 'LEDLIGHT_DATABASE';
    }>;
    withCode(error: CodedError, code: string): CodedError;
  };
  rational: {
    zero: Fraction;
    one: Fraction;
    neg(value: Fraction): Fraction;
    add(left: Fraction, right: Fraction): Fraction;
    sub(left: Fraction, right: Fraction): Fraction;
    mul(left: Fraction, right: Fraction): Fraction;
    div(left: Fraction, right: Fraction): Fraction;
    cmp(left: Fraction, right: Fraction): number;
    parse(value: string): Fraction;
    format(value: Fraction): string;
  };
  appendTotal<Row extends ReportRow>(rows: Row[]): Array<Row | TotalRow>;
  createLedgerValuationRateResolver(priceRows: PriceRow[], valuationCommodity: string): (commodity: unknown, throughDate: unknown) => string;
};
type Registrations = Pick<Facade, 'apiOptions' | 'decimal' | 'publicErrors' | 'rational'> & {
  cachePaths: { pathsForJournal: Facade['pathsForJournal'] };
  configuration: { read: Facade['readConfiguration'] };
  linearProgram: { maximize: Facade['maximize'] };
  reportTotals: { appendTotal: Facade['appendTotal'] };
  valuationRateResolver: { createLedgerValuationRateResolver: Facade['createLedgerValuationRateResolver'] };
};

export = ({
  apiOptions, cachePaths: { pathsForJournal }, configuration: { read: readConfiguration },
  decimal, linearProgram: { maximize }, publicErrors,
  rational: { zero, one, neg, add, sub, mul, div, cmp, parse, format },
  reportTotals: { appendTotal }, valuationRateResolver: { createLedgerValuationRateResolver },
}: Registrations): Facade => ({
  apiOptions, pathsForJournal, readConfiguration, decimal, maximize, publicErrors,
  rational: { zero, one, neg, add, sub, mul, div, cmp, parse, format },
  appendTotal, createLedgerValuationRateResolver,
});
