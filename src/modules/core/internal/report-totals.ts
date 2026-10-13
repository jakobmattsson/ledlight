'use strict';

type Decimal = { coefficient: bigint; scale: number };
type ReportRow = { commodity: string; quantity: string; valuationValue?: string };
type TotalRow = ReportRow & { account: 'Total'; isTotal: true };
type Total = { quantity: Decimal; valuationValue?: Decimal };
type Dependencies = {
  decimal: {
    addDecimals(left: Decimal, right: Decimal): Decimal;
    formatDecimal(value: Decimal): string;
    parseDecimal(value: string): Decimal;
  };
};
type ReportTotals = { appendTotal<Row extends ReportRow>(rows: Row[]): Array<Row | TotalRow> };

export = ({ decimal: { addDecimals, formatDecimal, parseDecimal } }: Dependencies): ReportTotals => {
  function appendTotal<Row extends ReportRow>(rows: Row[]): Array<Row | TotalRow> {
    const totals = new Map<string, Total>();
    for (const row of rows) {
      let total = totals.get(row.commodity);
      if (!total) {
        total = { quantity: parseDecimal('0') };
        totals.set(row.commodity, total);
      }
      total.quantity = addDecimals(total.quantity, parseDecimal(row.quantity));
      if (row.valuationValue !== undefined) {
        total.valuationValue = addDecimals(
          total.valuationValue ?? parseDecimal('0'),
          parseDecimal(row.valuationValue),
        );
      }
    }
    return [...rows, ...[...totals.keys()].sort().map((commodity): TotalRow => {
      const total = totals.get(commodity)!;
      return {
        account: 'Total',
        commodity,
        isTotal: true,
        quantity: formatDecimal(total.quantity),
        ...(total.valuationValue === undefined ? {} : {
          valuationValue: formatDecimal(total.valuationValue),
        }),
      };
    })];
  }

  return { appendTotal };
};
