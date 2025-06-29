const rateInfo = {
  clp: 0,
  usd: 0,
  cny: 0,
  clpToCny: 0,
  cnyToClp: 0
};

let currentCurrency = 'RMB';
let retryCount = 0;
const MAX_RETRIES = 3;

const input = document.querySelector('input[type="number"]');
const currencyButtons = document.querySelectorAll('.currency-toggle button');
const exchangeText = document.querySelector('.exchange-text');
const refreshBtn = document.getElementById('refreshBtn');
const priceRows = document.querySelector('tbody');

refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true;
  fetchRates();
});

async function fetchRates() {
  if (!navigator.onLine) {
    showError('当前无网络连接，请检查网络');
    refreshBtn.classList.remove('loading');
    refreshBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch('https://v6.exchangerate-api.com/v6/ababb17c269414725464ed07/latest/USD');
    const data = await res.json();

    if (data.result !== 'success') {
      throw new Error('API 返回错误：' + (data['error-type'] || '未知错误'));
    }

    rateInfo.clp = data.conversion_rates.CLP;
    rateInfo.cny = data.conversion_rates.CNY;
    rateInfo.cnyToClp = rateInfo.clp / rateInfo.cny;
    rateInfo.clpToCny = rateInfo.cny / rateInfo.clp;

    document.querySelector('.updated-time').textContent =
      `🕓 更新时间：${new Date().toLocaleString('zh-CN')}`;

    updateRateDisplay();
    retryCount = 0;
  } catch (e) {
    console.error('获取汇率失败', e);
    showError('获取汇率失败，请检查网络或刷新页面');
  } finally {
    refreshBtn.classList.remove('loading');
    setTimeout(() => {
      refreshBtn.disabled = false;
    }, 2000);
  }
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  document.querySelector('.updated-time')?.insertAdjacentElement('beforebegin', errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

function updateRateDisplay() {
  const usdToClp = document.getElementById('usd-clp');
  const usdToRmb = document.getElementById('usd-rmb');
  const cnyToClp = document.getElementById('cny-clp');

  if (usdToClp) usdToClp.textContent = formatNumber(rateInfo.clp);
  if (usdToRmb) usdToRmb.textContent = formatNumber(rateInfo.cny);
  if (cnyToClp) cnyToClp.textContent = formatNumber(rateInfo.cnyToClp);

  updateConversionText();
}

function formatNumber(num) {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateConversionText() {
  if (currentCurrency === 'RMB') {
    exchangeText.textContent = `当前换算：1 RMB ≈ ${formatNumber(rateInfo.cnyToClp)} CLP`;
  } else {
    exchangeText.textContent = `当前换算：1 CLP ≈ ${formatNumber(rateInfo.clpToCny)} RMB`;
  }
}

currencyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currencyButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCurrency = btn.textContent;
    input.value = '';
    clearTable();
    updateConversionText();
  });
});

let debounceTimer;
input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const cost = parseFloat(input.value);
    if (!isNaN(cost)) {
      updateTable(cost);
    } else {
      clearTable();
    }
  }, 300);
});

function updateTable(cost) {
  const margins = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  priceRows.innerHTML = '';
  addCostRow('成本（输入值）', cost);
  addTableRow('成本 × 2', cost * 2);

  margins.forEach(margin => {
    const label = `+${Math.round(margin * 100)}% 毛利`;
    const price = cost * (1 + margin);
    addTableRow(label, price);
  });
}

function addCostRow(label, cost) {
  let clpPrice, rmbPrice;

  if (currentCurrency === 'RMB') {
    rmbPrice = cost;
    clpPrice = rmbPrice * rateInfo.cnyToClp;
  } else {
    clpPrice = cost;
    rmbPrice = clpPrice * rateInfo.clpToCny;
  }

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="py-4 px-3 font-semibold text-red-600">${label}</td>
    <td class="py-4 px-3">${formatNumber(clpPrice)}</td>
    <td class="py-4 px-3">${formatNumber(rmbPrice)}</td>
  `;
  priceRows.appendChild(tr);
}

function addTableRow(label, basePrice) {
  let clpPrice, rmbPrice;

  if (currentCurrency === 'RMB') {
    rmbPrice = basePrice;
    clpPrice = rmbPrice * rateInfo.cnyToClp;
  } else {
    clpPrice = basePrice;
    rmbPrice = clpPrice * rateInfo.clpToCny;
  }

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="py-4 px-3 font-semibold">${label}</td>
    <td class="py-4 px-3">${formatNumber(clpPrice)}</td>
    <td class="py-4 px-3">${formatNumber(rmbPrice)}</td>
  `;
  priceRows.appendChild(tr);
}

function clearTable() {
  priceRows.innerHTML = '';
  const emptyRows = [
    '<tr><td class="py-4 px-3 font-semibold text-red-600">成本（输入值）</td><td class="py-4 px-3">——</td><td class="py-4 px-3">——</td></tr>',
    '<tr><td class="py-4 px-3 font-semibold">成本 × 2</td><td class="py-4 px-3">——</td><td class="py-4 px-3">——</td></tr>'
  ];
  for (let i = 20; i <= 100; i += 10) {
    emptyRows.push(`<tr><td class="py-4 px-3 font-semibold">+${i}% 毛利</td><td class="py-4 px-3">——</td><td class="py-4 px-3">——</td></tr>`);
  }
  priceRows.innerHTML = emptyRows.join('');
}

fetchRates();
