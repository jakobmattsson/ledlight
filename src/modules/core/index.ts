'use strict';

type CodedError = Error & { code?: string; sqliteCode?: string };
type ReportRow = { commodity: string; quantity: string; valuationValue?: string };
type TotalRow = ReportRow & { account: 'Total'; isTotal: true };
type PriceRow = { date: string; base_commodity: string; quote_commodity: string; quote_quantity: string };
type Facade = {
  readConfiguration(): { journalPath?: string; cacheHome?: string };
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
  appendTotal<Row extends ReportRow>(rows: Row[]): Array<Row | TotalRow>;
  createLedgerValuationRateResolver(priceRows: PriceRow[], valuationCommodity: string): (commodity: unknown, throughDate: unknown) => string;
};
type Registrations = Pick<Facade, 'publicErrors'> & {
  configuration: { read: Facade['readConfiguration'] };
  reportTotals: { appendTotal: Facade['appendTotal'] };
  valuationRateResolver: { createLedgerValuationRateResolver: Facade['createLedgerValuationRateResolver'] };
};

export = ({
  configuration: { read: readConfiguration },
  publicErrors,
  reportTotals: { appendTotal }, valuationRateResolver: { createLedgerValuationRateResolver },
}: Registrations): Facade => ({
  readConfiguration, publicErrors,
  appendTotal, createLedgerValuationRateResolver,
});
