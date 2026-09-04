import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPositiveFinite,
  roundUpClp,
  convertFactoryPrice,
  calculatePriceRows,
  calculateReverseMargin,
} from '../calculator.js';

test('the default calculation returns the 10% through 90% margin ladder', () => {
  const rows = calculatePriceRows({ factoryPrice: 100, currency: 'RMB', rate: 135 });
  assert.deepEqual(rows.map((row) => row.margin), [0.1, 0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9]);
  assert.deepEqual(rows[0], { margin: 0.1, clp: 15000, rmb: 111.11111111111111 });
});

test('positive-number validation rejects zero, negatives, non-numbers, and infinities', () => {
  assert.equal(isPositiveFinite(1), true);
  for (const value of [0, -1, NaN, Infinity, -Infinity, '135', null]) {
    assert.equal(isPositiveFinite(value), false);
  }
});

test('CLP sale prices round upward to the next 10', () => {
  assert.equal(roundUpClp(1204.875), 1210);
  assert.equal(roundUpClp(18750), 18750);
  assert.equal(roundUpClp(1200.000001), 1210);
});

test('floating-point noise does not add 10 CLP to exact high-margin prices', () => {
  const rows = calculatePriceRows({
    factoryPrice: 100,
    currency: 'RMB',
    rate: 135,
    margins: [0.8, 0.9],
  });
  assert.deepEqual(rows.map((row) => row.clp), [67500, 135000]);
});

test('factory-price conversion does not apply sale-price rounding', () => {
  assert.deepEqual(convertFactoryPrice({ factoryPrice: 100, currency: 'RMB', rate: 135 }), {
    clp: 13500,
    rmb: 100,
  });
  assert.deepEqual(convertFactoryPrice({ factoryPrice: 15000, currency: 'CLP', rate: 135 }), {
    clp: 15000,
    rmb: 111.11111111111111,
  });
});

test('RMB factory prices produce rounded CLP rows and matching RMB equivalents', () => {
  const [row] = calculatePriceRows({
    factoryPrice: 100,
    currency: 'RMB',
    rate: 135,
    margins: [0.2],
  });
  assert.deepEqual(row, { margin: 0.2, clp: 16880, rmb: 125.03703703703704 });
});

test('CLP factory prices produce the expected margin row', () => {
  const [row] = calculatePriceRows({
    factoryPrice: 15000,
    currency: 'CLP',
    rate: 135,
    margins: [0.2],
  });
  assert.deepEqual(row, { margin: 0.2, clp: 18750, rmb: 138.88888888888889 });
});

test('reverse calculation supports an RMB factory price', () => {
  assert.deepEqual(
    calculateReverseMargin({
      targetPriceClp: 16875,
      factoryPrice: 100,
      currency: 'RMB',
      rate: 135,
    }),
    { factoryPriceClp: 13500, profitClp: 3375, profitRmb: 25, marginPercent: 20 },
  );
});

test('reverse calculation supports a CLP factory price', () => {
  assert.deepEqual(
    calculateReverseMargin({
      targetPriceClp: 18750,
      factoryPrice: 15000,
      currency: 'CLP',
      rate: 135,
    }),
    {
      factoryPriceClp: 15000,
      profitClp: 3750,
      profitRmb: 27.77777777777778,
      marginPercent: 20,
    },
  );
});

test('calculator rejects invalid values, currency, and margins', () => {
  for (const factoryPrice of [0, -1, NaN, Infinity]) {
    assert.throws(
      () => calculatePriceRows({ factoryPrice, currency: 'RMB', rate: 135, margins: [0.2] }),
      RangeError,
    );
  }
  assert.throws(
    () => calculatePriceRows({ factoryPrice: 100, currency: 'USD', rate: 135, margins: [0.2] }),
    RangeError,
  );
  assert.throws(
    () => calculatePriceRows({ factoryPrice: 100, currency: 'RMB', rate: 0, margins: [0.2] }),
    RangeError,
  );
  for (const margins of [null, [0], [1], [-0.2], [NaN], [Infinity]]) {
    assert.throws(
      () => calculatePriceRows({ factoryPrice: 100, currency: 'RMB', rate: 135, margins }),
      RangeError,
    );
  }
  assert.throws(
    () => calculateReverseMargin({ targetPriceClp: -1, factoryPrice: 100, currency: 'RMB', rate: 135 }),
    RangeError,
  );
});
