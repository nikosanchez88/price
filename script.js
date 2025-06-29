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
const rateDisplay = document.querySelector('.rates-content');
const refreshBtn = document.getElementById('refreshBtn');

// 添加刷新按钮事件监听
refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true; // 禁用按钮防止连点
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

    console.log('API 返回数据：', data);

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
  rateDisplay.parentElement.insertBefore(errorDiv, rateDisplay);
  setTimeout(() => errorDiv.remove(), 5000);
}

function updateRateDisplay() {
  rateDisplay.innerHTML = `
    <div>💵 USD → CLP: <strong>${formatNumber(rateInfo.clp)}</strong></div>
    <div>💵 USD → RMB: <strong>${formatNumber(rateInfo.cny)}</strong></div>
    <div>💵 CNY → CLP: <strong>${formatNumber(rateInfo.cnyToClp)}</strong></div>
  `;
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
  addTableRow('成本 × 2', cost * 2);

  margins.forEach(margin => {
    const label = `+${Math.round(margin * 100)}% 毛利`;
    const price = cost * (1 + margin);
    addTableRow(label, price);
  });
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
    <td>${label}</td>
    <td>${formatNumber(clpPrice)}</td>
    <td>${formatNumber(rmbPrice)}</td>
  `;
  priceRows.appendChild(tr);
}

function clearTable() {
  priceRows.innerHTML = '';
  const emptyMargins = [
    '<tr><td>成本 × 2</td><td>——</td><td>——</td></tr>'
  ];
  for (let i = 20; i <= 100; i += 10) {
    emptyMargins.push(`<tr><td>+${i}% 毛利</td><td>——</td><td>——</td></tr>`);
  }
  priceRows.innerHTML = emptyMargins.join('');
}

const priceRows = document.querySelector('tbody');
fetchRates();
