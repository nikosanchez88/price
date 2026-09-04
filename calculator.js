export const MARGINS = Object.freeze([
  0.1,
  0.2,
  0.3,
  0.4,
  0.45,
  0.5,
  0.55,
  0.6,
  0.7,
  0.8,
  0.9,
]);

const CURRENCIES = new Set(['RMB', 'CLP']);

export function isPositiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function roundUpClp(value) {
  if (!isPositiveFinite(value)) {
    throw new RangeError('CLP value must be a finite positive number');
  }
  const floatingPointTolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8;
  return Math.ceil((value - floatingPointTolerance) / 10) * 10;
}

function validateCommon({ factoryPrice, currency, rate }) {
  if (!isPositiveFinite(factoryPrice)) {
    throw new RangeError('Factory price must be a finite positive number');
  }
  if (!isPositiveFinite(rate)) {
    throw new RangeError('Exchange rate must be a finite positive number');
  }
  if (!CURRENCIES.has(currency)) {
    throw new RangeError('Currency must be RMB or CLP');
  }
}

function toFactoryPriceClp(factoryPrice, currency, rate) {
  return currency === 'RMB' ? factoryPrice * rate : factoryPrice;
}

export function convertFactoryPrice({ factoryPrice, currency, rate }) {
  validateCommon({ factoryPrice, currency, rate });
  const clp = toFactoryPriceClp(factoryPrice, currency, rate);
  return { clp, rmb: clp / rate };
}

export function calculatePriceRows({
  factoryPrice,
  currency,
  rate,
  margins = MARGINS,
}) {
  validateCommon({ factoryPrice, currency, rate });
  if (
    !Array.isArray(margins)
    || margins.some(
      (margin) => (
        typeof margin !== 'number'
        || !Number.isFinite(margin)
        || margin <= 0
        || margin >= 1
      ),
    )
  ) {
    throw new RangeError('Margins must be finite numbers between 0 and 1');
  }

  const factoryPriceClp = toFactoryPriceClp(factoryPrice, currency, rate);
  return margins.map((margin) => {
    const clp = roundUpClp(factoryPriceClp / (1 - margin));
    return { margin, clp, rmb: clp / rate };
  });
}

export function calculateReverseMargin({
  targetPriceClp,
  factoryPrice,
  currency,
  rate,
}) {
  validateCommon({ factoryPrice, currency, rate });
  if (!isPositiveFinite(targetPriceClp)) {
    throw new RangeError('Target price must be a finite positive number');
  }

  const factoryPriceClp = toFactoryPriceClp(factoryPrice, currency, rate);
  const profitClp = targetPriceClp - factoryPriceClp;
  return {
    factoryPriceClp,
    profitClp,
    profitRmb: profitClp / rate,
    marginPercent: (profitClp / targetPriceClp) * 100,
  };
}
