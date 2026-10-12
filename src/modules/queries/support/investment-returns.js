'use strict';

module.exports = () => {

  const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

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
      }
    }
    return Math.expm1((low + high) / 2);
  }

  function cashFlowSpanYears(cashFlows) {
    const dates = cashFlows
      .filter(({ amount }) => Math.abs(amount) > 1e-9)
      .map(({ date }) => date)
      .sort();
    if (dates.length < 2 || dates[0] === dates.at(-1)) return null;
    return daysBetween(dates[0], dates.at(-1)) / 365;
  }

  function annualizedTimeWeightedReturn(totalReturn, from, to) {
    if (totalReturn === null) return null;
    if (from === null || to === null) return null;
    const years = daysBetween(from, to) / 365;
    if (years <= 0) return null;
    const annualizedReturn = Math.expm1(Math.log1p(totalReturn) / years);
    return Number.isFinite(annualizedReturn) ? annualizedReturn : null;
  }

  function totalReturnFromXirr(annualizedReturn, cashFlows) {
    if (annualizedReturn === null) return null;
    const years = cashFlowSpanYears(cashFlows);
    if (years === null) return null;
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
        timeWeightedReturnAnnualized: null,
        moneyWeightedReturn: null,
        moneyWeightedReturnTotal: null,
        points: [],
      };
    }
    const effectiveFrom = options.from ?? values[0].date;
    const effectiveTo = options.to ?? [effectiveFrom, values.at(-1).date].sort().at(-1);
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
    // Exclude empty time before the first investment and after the last exit,
    // while retaining any empty interval between investments.
    let returnStartDate = Math.abs(openingValue) > 1e-9 ? effectiveFrom : null;
    let lastReturnDate = null;
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
        const timeWeightedReturn = validReturn && hasReturn ? growthFactor - 1 : null;
        points.push({
          date: row.date,
          value: row.value,
          netContributions,
          profitLoss: row.value - openingValue - netContributions,
          timeWeightedReturn,
          timeWeightedReturnAnnualized: annualizedTimeWeightedReturn(timeWeightedReturn, returnStartDate, lastReturnDate),
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
      returnStartDate ??= row.date;
      lastReturnDate = row.date;
      priorValue = row.value;
      const pointCashFlows = [...investorCashFlows, { date: row.date, amount: row.value }];
      const moneyWeightedReturn = xirr(pointCashFlows);
      const timeWeightedReturn = validReturn ? growthFactor - 1 : null;
      points.push({
        date: row.date,
        value: row.value,
        netContributions,
        profitLoss: row.value - openingValue - netContributions,
        timeWeightedReturn,
        timeWeightedReturnAnnualized: annualizedTimeWeightedReturn(timeWeightedReturn, returnStartDate, lastReturnDate),
        moneyWeightedReturn,
        moneyWeightedReturnTotal: totalReturnFromXirr(moneyWeightedReturn, pointCashFlows),
      });
    }
    const terminalCashFlows = [...investorCashFlows];
    if (Math.abs(endingValue) > 1e-9) terminalCashFlows.push({ date: effectiveTo, amount: endingValue });
    const moneyWeightedReturn = xirr(terminalCashFlows);
    const timeWeightedReturn = validReturn && hasReturn ? growthFactor - 1 : null;
    return {
      from: effectiveFrom,
      to: effectiveTo,
      commodities,
      valuationCommodity,
      openingValue,
      endingValue,
      netContributions,
      profitLoss: endingValue - openingValue - netContributions,
      timeWeightedReturn,
      timeWeightedReturnAnnualized: annualizedTimeWeightedReturn(
        timeWeightedReturn, returnStartDate, Math.abs(endingValue) > 1e-9 ? effectiveTo : lastReturnDate,
      ),
      moneyWeightedReturn,
      moneyWeightedReturnTotal: totalReturnFromXirr(moneyWeightedReturn, terminalCashFlows),
      points,
    };
  }

  return {
    calculatePerformance,
    $$private: { xirr },
  };
};
