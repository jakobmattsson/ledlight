'use strict';

type Facade = {
  apiOptions: ReturnType<typeof import('./internal/api-options')>;
  cachePaths: ReturnType<typeof import('./internal/cache-paths')>;
  configuration: ReturnType<typeof import('./internal/configuration')>;
  decimal: ReturnType<typeof import('./internal/decimal')>;
  linearProgram: ReturnType<typeof import('./internal/linear-program')>;
  publicErrors: ReturnType<typeof import('./internal/public-errors')>;
  rational: ReturnType<typeof import('./internal/rational')>;
  reportTotals: ReturnType<typeof import('./internal/report-totals')>;
  valuationRateResolver: ReturnType<typeof import('./internal/valuation-rate-resolver')>;
};

export = ({
  apiOptions, cachePaths, configuration, decimal, linearProgram, publicErrors, rational, reportTotals, valuationRateResolver,
}: Facade): Facade => ({
  apiOptions, cachePaths, configuration, decimal, linearProgram, publicErrors, rational, reportTotals, valuationRateResolver,
});
