import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePositiveInput, readSavedRate, persistRate } from '../script.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('input parsing distinguishes empty, invalid, and positive values', () => {
  assert.deepEqual(parsePositiveInput(''), { state: 'empty' });
  assert.deepEqual(parsePositiveInput('   '), { state: 'empty' });
  for (const raw of ['0', '-1', 'Infinity', 'abc']) {
    assert.deepEqual(parsePositiveInput(raw), { state: 'invalid' });
  }
  assert.deepEqual(parsePositiveInput('135.5'), { state: 'valid', value: 135.5 });
  assert.deepEqual(parsePositiveInput('12,5'), { state: 'valid', value: 12.5 });
});

test('CLP inputs read Chilean thousands separators and pasted price text', () => {
  for (const raw of ['12.990', '12,990', '$12.990', '$ 12.990', '12.990 CLP', '12990']) {
    assert.deepEqual(parsePositiveInput(raw, { clp: true }), { state: 'valid', value: 12990 });
  }
  assert.deepEqual(parsePositiveInput('1.234.567', { clp: true }), { state: 'valid', value: 1234567 });
  assert.deepEqual(parsePositiveInput('12,5', { clp: true }), { state: 'valid', value: 12.5 });
  assert.deepEqual(parsePositiveInput('1.234,567', { clp: true }), { state: 'invalid' });
  assert.deepEqual(parsePositiveInput('$', { clp: true }), { state: 'invalid' });
  // RMB prices and the exchange rate keep decimal points.
  assert.deepEqual(parsePositiveInput('12.990'), { state: 'valid', value: 12.99 });
});

test('rate persistence stores valid values, ignores invalid values, and clears empty input', () => {
  const storage = createStorage();
  persistRate(storage, '135.5');
  assert.equal(readSavedRate(storage), '135.5');
  persistRate(storage, '-2');
  assert.equal(readSavedRate(storage), '135.5');
  persistRate(storage, '');
  assert.equal(readSavedRate(storage), '');
});

test('blocked browser storage does not break rate helpers', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(readSavedRate(storage), '');
  assert.doesNotThrow(() => persistRate(storage, '135'));
});
