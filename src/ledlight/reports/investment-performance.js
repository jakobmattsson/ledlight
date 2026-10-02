'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: { registerDecimalFunctions },
  accountPrefixFilter: { accountPrefixFilter },
  reportOptions: {
    assertDateInterval,
    knownOptions,
    stringList,
  },
  valuationCommodity: { fromDatabase },
}) => {

  const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

  function normalizeOptions(options) {
    const input = knownOptions(options, [
      'accounts',
      'commodities',
      'excludeCommodities',
      'from',
      'to',
    ], 'investmentPerformance');
    const normalized = {
      from: input.from,
      to: input.to,
      accounts: stringList(input.accounts, 'accounts', true),
      commodities: stringList(input.commodities, 'commodities', true),
      excludeCommodities: stringList(input.excludeCommodities, 'excludeCommodities', true),
    };
    assertDateInterval(normalized.from, normalized.to);
    if (normalized.commodities.some((commodity) => normalized.excludeCommodities.includes(commodity))) {
      throw new Error('A commodity cannot be both included and excluded');
    }
    return normalized;
  }

  function selectedCommodities(database, options) {
    if (options.commodities.length > 0) return options.commodities;
    const clauses = [];
    const parameters = [];
    if (options.accounts.length > 0) {
      const filter = accountPrefixFilter('p.account', options.accounts);
      clauses.push(filter.sql);
      parameters.push(...filter.parameters);
    }
    if (options.excludeCommodities.length > 0) {
      clauses.push(`r.commodity NOT IN (${options.excludeCommodities.map(() => '?').join(', ')})`);
      parameters.push(...options.excludeCommodities);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join('\n      AND ')}` : '';
    return database.prepare(`
    SELECT DISTINCT r.commodity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    ${where}
    ORDER BY r.commodity
  `).all(...parameters).map((row) => row.commodity);
  }

  function selectionFilter(options, commodities, alias) {
    const clauses = [`${alias}.commodity IN (${commodities.map(() => '?').join(', ')})`];
    const parameters = [...commodities];
    if (options.accounts.length > 0) {
      const filter = accountPrefixFilter('p.account', options.accounts);
      clauses.push(filter.sql);
      parameters.push(...filter.parameters);
    }
    return { sql: clauses.join('\n          AND '), parameters };
  }

  function queryDailyValues(database, options, commodities, valuationCommodity) {
    const filter = selectionFilter(options, commodities, 'r');
    const reportEnd = options.to
      ? `SELECT MIN(date) AS value FROM (
        SELECT MAX(date) AS date FROM (
          SELECT MAX(p.report_date) AS date
          FROM resolved_posting_amounts AS r
          JOIN postings AS p ON p.id = r.posting_id
          JOIN transactions AS t ON t.entry_id = p.transaction_id
          WHERE ${filter.sql}
          UNION ALL
          SELECT MAX(date) AS date FROM prices
        )
        UNION ALL
        SELECT ? AS date
      )`
      : `SELECT MAX(date) AS value FROM (
        SELECT MAX(p.report_date) AS date
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        WHERE ${filter.sql}
        UNION ALL
        SELECT MAX(date) AS date FROM prices
      )`;
    const parameters = [...filter.parameters, ...filter.parameters];
    if (options.to) parameters.push(options.to);
    return database.prepare(`
    WITH RECURSIVE
      selected_changes AS (
        SELECT p.report_date AS date, r.commodity, decimal_sum(r.quantity) AS quantity
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        WHERE ${filter.sql}
        GROUP BY p.report_date, r.commodity
      ),
      commodity_bounds AS (
        SELECT commodity, MIN(date) AS start_date
        FROM selected_changes
        GROUP BY commodity
      ),
      report_end(value) AS (
        ${reportEnd}
      ),
      positions(commodity, date, quantity) AS (
        SELECT bounds.commodity, bounds.start_date, COALESCE(changes.quantity, '0')
        FROM commodity_bounds AS bounds
        JOIN report_end ON bounds.start_date <= report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = bounds.commodity AND changes.date = bounds.start_date
        UNION ALL
        SELECT positions.commodity, date(positions.date, '+1 day'),
          decimal_add(positions.quantity, COALESCE(changes.quantity, '0'))
        FROM positions
        JOIN report_end ON positions.date < report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = positions.commodity
          AND changes.date = date(positions.date, '+1 day')
      )
    SELECT positions.date,
      decimal_sum(decimal_mul(positions.quantity, valuation_prices.rate)) AS value,
      MIN(CASE WHEN valuation_prices.rate IS NULL AND decimal_cmp(positions.quantity, '0') != 0
        THEN positions.commodity END) AS missing_commodity
    FROM positions
    LEFT JOIN valuation_prices
      ON valuation_prices.commodity = positions.commodity AND valuation_prices.date = positions.date
    GROUP BY positions.date
    ORDER BY positions.date
  `).all(...parameters).map((row) => {
      if (row.missing_commodity) {
        throw new Error(`No price for ${row.missing_commodity} on or before ${row.date} can convert it to ${valuationCommodity}`);
      }
      return { date: row.date, value: Number(row.value) };
    });
  }

  function queryDailyFlows(database, options, commodities, valuationCommodity) {
    const accountClauses = [];
    const accountParameters = [];
    if (options.accounts.length > 0) {
      const filter = accountPrefixFilter('p.account', options.accounts);
      accountClauses.push(filter.sql);
      accountParameters.push(...filter.parameters);
    }
    const accountWhere = accountClauses.length > 0 ? `AND ${accountClauses.join(' AND ')}` : '';
    const parameters = [...commodities, ...commodities, ...accountParameters];
    const rows = database.prepare(`
    WITH transaction_values AS (
      SELECT t.entry_id, p.report_date AS date, p.account,
        decimal_sum(CASE WHEN r.commodity IN (${commodities.map(() => '?').join(', ')})
          THEN decimal_mul(r.quantity, valuation_prices.rate) ELSE '0' END) AS selected_value,
        decimal_sum(CASE WHEN r.commodity NOT IN (${commodities.map(() => '?').join(', ')})
          THEN decimal_mul(r.quantity, valuation_prices.rate) ELSE '0' END) AS unselected_value,
        MIN(CASE WHEN valuation_prices.rate IS NULL AND decimal_cmp(r.quantity, '0') != 0
          THEN r.commodity END) AS missing_commodity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      LEFT JOIN valuation_prices ON valuation_prices.commodity = r.commodity AND valuation_prices.date = p.report_date
      WHERE 1 = 1 ${accountWhere}
      GROUP BY t.entry_id, p.report_date, p.account
    )
    SELECT date,
      decimal_sum(CASE
        WHEN decimal_cmp(selected_value, '0') = 0 THEN '0'
        WHEN decimal_cmp(unselected_value, '0') != 0 THEN decimal_mul(unselected_value, '-1')
        ELSE selected_value
      END) AS flow,
      MIN(missing_commodity) AS missing_commodity
    FROM transaction_values
    WHERE decimal_cmp(selected_value, '0') != 0
    GROUP BY date
    ORDER BY date
  `).all(...parameters);
    return rows.map((row) => {
      if (row.missing_commodity) {
        throw new Error(`No price for ${row.missing_commodity} on or before ${row.date} can convert a cash flow to ${valuationCommodity}`);
      }
      return { date: row.date, flow: Number(row.flow) };
    });
  }

  function daysBetween(first, second) {
    return (Date.parse(`${second}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MILLISECONDS;
  }

  function xirr(cashFlows) {
    const combined = new Map();
    for (const { date, amount } of cashFlows) combined.set(date, (combined.get(date) ?? 0) + amount);
    const flows = [...combined].map(([date, amount]) => ({ date, amount }))
      .filter(({ amount }) => Math.abs(amount) > 1e-9)
      .sort((left, right) => left.date.localeCompare(right.date));
    if (!flows.some(({ amount }) => amount < 0) || !flows.some(({ amount }) => amount > 0)) return null;
    const start = flows[0].date;
    const npv = (logRate) => flows.reduce((total, flow) =>
      total + flow.amount * Math.exp(-logRate * daysBetween(start, flow.date) / 365), 0);
    let low = -20;
    let high = Math.log(2);
    let lowValue = npv(low);
    let highValue = npv(high);
    while (Math.sign(lowValue) === Math.sign(highValue) && high < 700) {
      high = Math.min(700, high * 2 + 1);
      highValue = npv(high);
    }
    if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || Math.sign(lowValue) === Math.sign(highValue)) return null;
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const middle = (low + high) / 2;
      const middleValue = npv(middle);
      if (Math.abs(middleValue) < 1e-8) return Math.expm1(middle);
      if (Math.sign(middleValue) === Math.sign(lowValue)) {
        low = middle;
        lowValue = middleValue;
      } else {
        high = middle;
        highValue = middleValue;
      }
    }
    return Math.expm1((low + high) / 2);
  }

  function totalReturnFromXirr(annualizedReturn, cashFlows) {
    if (annualizedReturn === null) return null;
    const dates = cashFlows
      .filter(({ amount }) => Math.abs(amount) > 1e-9)
      .map(({ date }) => date)
      .sort();
    if (dates.length < 2 || dates[0] === dates.at(-1)) return null;
    const years = daysBetween(dates[0], dates.at(-1)) / 365;
    return Math.expm1(Math.log1p(annualizedReturn) * years);
  }

  function calculatePerformance(values, flows, options, commodities, valuationCommodity) {
    if (values.length === 0) {
      return {
        from: options.from ?? null,
        to: options.to ?? null,
        commodities,
        valuationCommodity,
        openingValue: 0,
        endingValue: 0,
        netContributions: 0,
        profitLoss: 0,
        timeWeightedReturn: null,
        moneyWeightedReturn: null,
        moneyWeightedReturnTotal: null,
        points: [],
      };
    }
    const effectiveFrom = options.from ?? values[0].date;
    const effectiveTo = options.to ?? values.at(-1).date;
    const previous = [...values].reverse().find((row) => row.date < effectiveFrom);
    const periodValues = values.filter((row) => row.date >= effectiveFrom && row.date <= effectiveTo);
    const openingValue = previous?.value ?? 0;
    const endingValue = periodValues.at(-1)?.value ?? openingValue;
    const periodFlows = flows.filter((row) => row.date >= effectiveFrom && row.date <= effectiveTo);
    const flowsByDate = new Map(periodFlows.map((row) => [row.date, row.flow]));
    let priorValue = openingValue;
    let growthFactor = 1;
    let hasReturn = false;
    let validReturn = true;
    let netContributions = 0;
    const investorCashFlows = [];
    if (Math.abs(openingValue) > 1e-9) investorCashFlows.push({ date: effectiveFrom, amount: -openingValue });
    const points = [];
    for (const row of periodValues) {
      const flow = flowsByDate.get(row.date) ?? 0;
      netContributions += flow;
      if (Math.abs(flow) > 1e-9) investorCashFlows.push({ date: row.date, amount: -flow });
      let factor;
      // The journal has daily closing values but no intraday valuations. Treat a
      // dated external flow as occurring at the end of that day; on the first
      // funded day, compare the closing value directly with the contribution.
      if (Math.abs(priorValue) > 1e-9) {
        factor = (row.value - flow) / priorValue;
      } else if (flow > 0) {
        factor = row.value / flow;
      } else if (Math.abs(row.value) <= 1e-9) {
        priorValue = row.value;
        const pointCashFlows = [...investorCashFlows, { date: row.date, amount: row.value }];
        const moneyWeightedReturn = xirr(pointCashFlows);
        points.push({
          date: row.date,
          value: row.value,
          netContributions,
          profitLoss: row.value - openingValue - netContributions,
          timeWeightedReturn: validReturn && hasReturn ? growthFactor - 1 : null,
          moneyWeightedReturn,
          moneyWeightedReturnTotal: totalReturnFromXirr(moneyWeightedReturn, pointCashFlows),
        });
        continue;
      } else {
        validReturn = false;
        break;
      }
      if (!Number.isFinite(factor) || factor < 0) {
        validReturn = false;
        break;
      }
      growthFactor *= factor;
      hasReturn = true;
      priorValue = row.value;
      const pointCashFlows = [...investorCashFlows, { date: row.date, amount: row.value }];
      const moneyWeightedReturn = xirr(pointCashFlows);
      points.push({
        date: row.date,
        value: row.value,
        netContributions,
        profitLoss: row.value - openingValue - netContributions,
        timeWeightedReturn: validReturn ? growthFactor - 1 : null,
        moneyWeightedReturn,
        moneyWeightedReturnTotal: totalReturnFromXirr(moneyWeightedReturn, pointCashFlows),
      });
    }
    const terminalCashFlows = [...investorCashFlows];
    if (Math.abs(endingValue) > 1e-9) terminalCashFlows.push({ date: effectiveTo, amount: endingValue });
    const moneyWeightedReturn = xirr(terminalCashFlows);
    return {
      from: effectiveFrom,
      to: effectiveTo,
      commodities,
      valuationCommodity,
      openingValue,
      endingValue,
      netContributions,
      profitLoss: endingValue - openingValue - netContributions,
      timeWeightedReturn: validReturn && hasReturn ? growthFactor - 1 : null,
      moneyWeightedReturn,
      moneyWeightedReturnTotal: totalReturnFromXirr(moneyWeightedReturn, terminalCashFlows),
      points,
    };
  }

  function queryInvestmentPerformance(databasePath, options) {
    const normalized = normalizeOptions(options);
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      registerDecimalFunctions(database);
      const valuationCommodity = fromDatabase(database);
      const commodities = selectedCommodities(database, normalized);
      if (commodities.length === 0) return calculatePerformance([], [], normalized, [], valuationCommodity);
      const values = queryDailyValues(database, { ...normalized, from: undefined }, commodities, valuationCommodity);
      const flows = queryDailyFlows(database, normalized, commodities, valuationCommodity);
      return calculatePerformance(values, flows, normalized, commodities, valuationCommodity);
    } finally {
      database.close();
    }
  }

  return {
    queryInvestmentPerformance,
    $$private: { xirr },
  };
};
