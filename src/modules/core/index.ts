'use strict';

type Decimal = { coefficient: bigint; scale: number };
type Fraction = { n: bigint; d: bigint };
type CodedError = Error & { code?: string; sqliteCode?: string };
type ReportRow = { commodity: string; quantity: string; valuationValue?: string };
type TotalRow = ReportRow & { account: 'Total'; isTotal: true };
type PriceRow = { date: string; base_commodity: string; quote_commodity: string; quote_quantity: string };
type Facade = {
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
    subtractDecimals(left: Decimal, right: Decimal): Decimal;
  };
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
type Registrations = Pick<Facade, 'decimal' | 'publicErrors' | 'rational'> & {
  cachePaths: { pathsForJournal: Facade['pathsForJournal'] };
  configuration: { read: Facade['readConfiguration'] };
  reportTotals: { appendTotal: Facade['appendTotal'] };
  valuationRateResolver: { createLedgerValuationRateResolver: Facade['createLedgerValuationRateResolver'] };
};

export = ({
  cachePaths: { pathsForJournal }, configuration: { read: readConfiguration },
  decimal, publicErrors,
  rational: { zero, one, neg, add, sub, mul, div, cmp, parse, format },
  reportTotals: { appendTotal }, valuationRateResolver: { createLedgerValuationRateResolver },
}: Registrations): Facade => ({
  pathsForJournal, readConfiguration, decimal, publicErrors,
  rational: { zero, one, neg, add, sub, mul, div, cmp, parse, format },
  appendTotal, createLedgerValuationRateResolver,
});
