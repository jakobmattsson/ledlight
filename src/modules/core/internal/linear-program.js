'use strict';

module.exports = ({ rational: { zero, one, neg, sub, mul, div, cmp } }) => {
  // Two-phase simplex over exact rational numbers. Variables are nonnegative;
  // each constraint is coefficients * x <= bound. Bland's rule prevents cycling.
  function maximize(variableCount, constraints, objective) {
    const m = constraints.length;
    const n = variableCount;
    const basic = Array.from({ length: m }, (_, i) => n + i);
    const nonbasic = Array.from({ length: n + 1 }, (_, i) => i === n ? -1 : i);
    const table = Array.from({ length: m + 2 }, () => Array(n + 2).fill(zero));
    constraints.forEach(({ coefficients, bound }, i) => {
      for (const [j, value] of coefficients) table[i][j] = value;
      table[i][n] = neg(one);
      table[i][n + 1] = bound;
    });
    for (const [j, value] of objective) table[m][j] = neg(value);
    table[m + 1][n] = one;

    function pivot(row, column) {
      const inverse = div(one, table[row][column]);
      for (let i = 0; i < m + 2; i++) {
        if (i === row || !table[i][column].n) continue;
        const factor = mul(table[i][column], inverse);
        for (let j = 0; j < n + 2; j++) {
          if (j !== column && table[row][j].n) {
            table[i][j] = sub(table[i][j], mul(table[row][j], factor));
          }
        }
      }
      for (let j = 0; j < n + 2; j++) {
        if (j !== column) table[row][j] = mul(table[row][j], inverse);
      }
      for (let i = 0; i < m + 2; i++) {
        if (i !== row) table[i][column] = mul(table[i][column], neg(inverse));
      }
      table[row][column] = inverse;
      [basic[row], nonbasic[column]] = [nonbasic[column], basic[row]];
    }

    function simplex(phase) {
      const objectiveRow = phase === 1 ? m + 1 : m;
      for (;;) {
        let column = -1;
        for (let j = 0; j <= n; j++) {
          if ((phase === 2 && nonbasic[j] === -1) || table[objectiveRow][j].n >= 0n) continue;
          if (column === -1 || nonbasic[j] < nonbasic[column]) column = j;
        }
        if (column === -1) return true;
        let row = -1;
        for (let i = 0; i < m; i++) {
          if (table[i][column].n <= 0n) continue;
          const comparison = row === -1 ? -1 : cmp(
            div(table[i][n + 1], table[i][column]),
            div(table[row][n + 1], table[row][column]),
          );
          if (comparison < 0 || (comparison === 0 && basic[i] < basic[row])) row = i;
        }
        if (row === -1) return false;
        pivot(row, column);
      }
    }

    let row = -1;
    for (let i = 0; i < m; i++) {
      if (row === -1 || cmp(table[i][n + 1], table[row][n + 1]) < 0) row = i;
    }
    if (row !== -1 && table[row][n + 1].n < 0n) {
      pivot(row, n);
      if (!simplex(1) || table[m + 1][n + 1].n !== 0n) return { status: 'infeasible' };
      row = basic.indexOf(-1);
      if (row !== -1) {
        let column = -1;
        for (let j = 0; j <= n; j++) {
          if (table[row][j].n && (column === -1 || nonbasic[j] < nonbasic[column])) column = j;
        }
        if (column !== -1) pivot(row, column);
      }
    }
    if (!simplex(2)) return { status: 'unbounded' };
    const solution = Array(n).fill(zero);
    for (let i = 0; i < m; i++) if (basic[i] < n && basic[i] >= 0) solution[basic[i]] = table[i][n + 1];
    return { status: 'optimal', value: table[m][n + 1], solution };
  }
  return { maximize };
};
