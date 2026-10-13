'use strict';

const { resolveRepositoryModule } = require('../../../../support/repository-container');
const assert = require('node:assert/strict');
const test = require('node:test');
const { registerDecimalFunctions } = resolveRepositoryModule('src/modules/implementations/database/internal/decimal-sql-functions.js');

test('retains parsed decimal state until a database sum completes', () => {
  type Decimal = { coefficient: bigint; scale: number };
  type Aggregate = {
    start(): Decimal;
    step(total: Decimal, value: string | null): Decimal;
    result(total: Decimal): string;
  };
  let aggregate: Aggregate | undefined;
  const database = {
    aggregate(name: string, options: Aggregate) {
      if (name === 'decimal_sum') aggregate = options;
    },
    function() {},
  };
  registerDecimalFunctions(database);

  assert.ok(aggregate);
  const configured = aggregate as Aggregate;
  let total = configured.start();
  total = configured.step(total, '1.25');
  total = configured.step(total, null);
  total = configured.step(total, '2.5');

  assert.deepEqual(total, { coefficient: 375n, scale: 2 });
  assert.equal(configured.result(total), '3.75');
  assert.equal(configured.result(configured.start()), '0');
});
