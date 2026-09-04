import {
  MARGINS,
  calculatePriceRows,
  calculateReverseMargin,
  convertFactoryPrice,
} from './calculator.js';

const RATE_STORAGE_KEY = 'exchangeRate';
const fmtClp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const fmtRmb = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function parsePositiveInput(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return { state: 'empty' };
  }
  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0
    ? { state: 'valid', value }
    : { state: 'invalid' };
}

export function readSavedRate(storage) {
  try {
    const saved = storage.getItem(RATE_STORAGE_KEY);
    return parsePositiveInput(saved ?? '').state === 'valid' ? saved : '';
  } catch {
    return '';
  }
}

export function persistRate(storage, rawValue) {
  try {
    const parsed = parsePositiveInput(rawValue);
    if (parsed.state === 'empty') {
      storage.removeItem(RATE_STORAGE_KEY);
    } else if (parsed.state === 'valid') {
      storage.setItem(RATE_STORAGE_KEY, rawValue.trim());
    }
  } catch {
    // Storage is optional; calculations continue to work without it.
  }
}

async function copyPrice(button, text, statusElement) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard unavailable');
    }
    await navigator.clipboard.writeText(text);
    statusElement.dataset.state = 'success';
    statusElement.textContent = `已复制 ${text}`;
    button.dataset.copied = 'true';
    window.setTimeout(() => {
      button.dataset.copied = 'false';
      if (statusElement.dataset.state === 'success') {
        statusElement.textContent = '';
        delete statusElement.dataset.state;
      }
    }, 1500);
  } catch {
    button.dataset.copied = 'false';
    statusElement.dataset.state = 'error';
    statusElement.textContent = '复制失败，请手动复制';
  }
}

function initializeApp() {
  const elements = {
    rate: document.querySelector('#rateInput'),
    factoryPrice: document.querySelector('#factoryPriceInput'),
    targetPrice: document.querySelector('#targetPriceInput'),
    currencyButtons: [...document.querySelectorAll('[data-currency]')],
    factoryPriceLabel: document.querySelector('#factoryPriceLabel'),
    rateError: document.querySelector('#rateError'),
    factoryPriceError: document.querySelector('#factoryPriceError'),
    targetPriceError: document.querySelector('#targetPriceError'),
    priceList: document.querySelector('#priceList'),
    costSummary: document.querySelector('#costSummary'),
    costContext: document.querySelector('#costContext'),
    landedPriceSummary: document.querySelector('#landedPriceSummary'),
    copyStatus: document.querySelector('#copyStatus'),
    reverseResult: document.querySelector('#reverseResult'),
    reverseMargin: document.querySelector('#reverseMargin'),
    reverseProfitRmb: document.querySelector('#reverseProfitRmb'),
  };
  let currentCurrency = 'RMB';

  function showValidation(input, errorElement, parsed) {
    const invalid = parsed.state === 'invalid';
    errorElement.textContent = invalid ? '请输入大于 0 的有效数字' : '';
    if (invalid) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function appendPriceText(container, label, { clp, rmb }) {
    const labelElement = document.createElement('span');
    labelElement.className = 'row-label';
    labelElement.textContent = label;

    const amounts = document.createElement('span');
    amounts.className = 'row-amounts';
    const clpElement = document.createElement('strong');
    clpElement.textContent = `${fmtClp.format(clp)} CLP`;
    const rmbElement = document.createElement('small');
    rmbElement.textContent = `${fmtRmb.format(rmb)} RMB`;
    amounts.append(clpElement, rmbElement);
    container.append(labelElement, amounts);
  }

  function appendLandedRow(values) {
    const row = document.createElement('div');
    row.className = 'price-row landed-row';
    appendPriceText(row, '入库价', values);
    elements.priceList.append(row);
  }

  function appendMarginRow(label, values) {
    const row = document.createElement('div');
    row.className = 'price-row margin-row';
    appendPriceText(row, label, values);
    const copyButton = document.createElement('button');
    const copyText = `${fmtClp.format(values.clp)} CLP`;
    copyButton.type = 'button';
    copyButton.className = 'copy-button';
    copyButton.dataset.copied = 'false';
    copyButton.setAttribute('aria-label', `复制 ${copyText} 售价`);
    copyButton.textContent = '复制';
    copyButton.addEventListener('click', () => copyPrice(copyButton, copyText, elements.copyStatus));
    row.append(copyButton);
    elements.priceList.append(row);
  }

  function render() {
    const rate = parsePositiveInput(elements.rate.value);
    const factoryPrice = parsePositiveInput(elements.factoryPrice.value);
    const targetPrice = parsePositiveInput(elements.targetPrice.value);

    showValidation(elements.rate, elements.rateError, rate);
    showValidation(elements.factoryPrice, elements.factoryPriceError, factoryPrice);
    showValidation(elements.targetPrice, elements.targetPriceError, targetPrice);

    elements.priceList.replaceChildren();
    elements.costSummary.hidden = true;
    elements.costContext.textContent = '';
    elements.landedPriceSummary.textContent = '';
    elements.copyStatus.textContent = '';
    delete elements.copyStatus.dataset.state;
    elements.reverseResult.hidden = true;

    if (rate.state !== 'valid' || factoryPrice.state !== 'valid') return;

    const landedPrice = convertFactoryPrice({
      factoryPrice: factoryPrice.value,
      currency: currentCurrency,
      rate: rate.value,
    });
    elements.costSummary.hidden = false;
    elements.costContext.textContent = currentCurrency === 'RMB'
      ? `${fmtRmb.format(factoryPrice.value)} RMB × ${rate.value}`
      : `${fmtClp.format(factoryPrice.value)} CLP`;
    elements.landedPriceSummary.textContent = `${fmtClp.format(landedPrice.clp)} CLP`;
    appendLandedRow(landedPrice);

    const priceRows = calculatePriceRows({
      factoryPrice: factoryPrice.value,
      currency: currentCurrency,
      rate: rate.value,
      margins: MARGINS,
    });
    for (const row of priceRows) {
      appendMarginRow(`毛利 ${Math.round(row.margin * 100)}%`, row);
    }

    if (targetPrice.state !== 'valid') return;

    const reverse = calculateReverseMargin({
      targetPriceClp: targetPrice.value,
      factoryPrice: factoryPrice.value,
      currency: currentCurrency,
      rate: rate.value,
    });
    elements.reverseResult.hidden = false;
    elements.reverseMargin.textContent = `${reverse.marginPercent.toFixed(1)}%`;
    elements.reverseProfitRmb.textContent = fmtRmb.format(reverse.profitRmb);
    elements.reverseMargin.className = reverse.marginPercent < 20
      ? 'margin-low'
      : reverse.marginPercent > 40 ? 'margin-high' : 'margin-medium';
  }

  elements.rate.value = readSavedRate(window.localStorage);
  elements.rate.addEventListener('input', () => {
    persistRate(window.localStorage, elements.rate.value);
    render();
  });
  elements.factoryPrice.addEventListener('input', render);
  elements.targetPrice.addEventListener('input', render);

  for (const button of elements.currencyButtons) {
    button.addEventListener('click', () => {
      currentCurrency = button.dataset.currency;
      for (const candidate of elements.currencyButtons) {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-pressed', String(active));
      }
      elements.factoryPriceLabel.textContent = `出厂价（${currentCurrency}）`;
      render();
    });
  }

  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Service Worker registration failed', error);
    });
  }
}

if (typeof document !== 'undefined') {
  initializeApp();
}
