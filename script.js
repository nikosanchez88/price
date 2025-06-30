const rateInfo = {
  clp: 0,
  usd: 0,
  cny: 0,
  clpToCny: 0,
  cnyToClp: 0
};

let currentCurrency = 'RMB';
const MARGINS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

const costInput = document.getElementById('costInput');
const currencyButtons = document.querySelectorAll('.currency-toggle button');
const exchangeText = document.querySelector('.exchange-text');
const refreshBtn = document.getElementById('refreshBtn');
const priceRows = document.getElementById('priceRows');

// 初始化逻辑（Dark Mode 读取、汇率加载）
window.addEventListener('DOMContentLoaded', () => {
  // 初始化主题（Dark Mode）
  const darkPref = localStorage.getItem('darkMode');
  const checkbox = document.querySelector('#themeToggle .input');
  if (darkPref === 'on') {
    document.documentElement.classList.add('dark');
    if (checkbox) checkbox.checked = true;
  }
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      document.documentElement.classList.toggle('dark');
      const isDark = document.documentElement.classList.contains('dark');
      localStorage.setItem('darkMode', isDark ? 'on' : 'off');
    });
  }

  fetchRates();
});

// 刷新按钮逻辑
refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true;
  fetchRates();
});

async function fetchRates() {
  if (!navigator.onLine) {
    showError('当前无网络连接，请检查网络');
    resetRefreshBtn();
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
  } catch (e) {
    console.error('获取汇率失败', e);
    showError('获取汇率失败，请检查网络或刷新页面');
  } finally {
    resetRefreshBtn();
  }
}

function resetRefreshBtn() {
  refreshBtn.classList.remove('loading');
  setTimeout(() => {
    refreshBtn.disabled = false;
  }, 2000);
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  document.querySelector('.updated-time')?.insertAdjacentElement('beforebegin', errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

function updateRateDisplay() {
  document.getElementById('usd-clp').textContent = formatNumber(rateInfo.clp);
  document.getElementById('usd-rmb').textContent = formatNumber(rateInfo.cny);
  document.getElementById('cny-clp').textContent = formatNumber(rateInfo.cnyToClp);
  updateConversionText();
}

function formatNumber(num) {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateConversionText() {
  exchangeText.textContent =
    currentCurrency === 'RMB'
      ? `当前换算：1 RMB ≈ ${formatNumber(rateInfo.cnyToClp)} CLP`
      : `当前换算：1 CLP ≈ ${formatNumber(rateInfo.clpToCny)} RMB`;
}

// 币种切换逻辑
currencyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currencyButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCurrency = btn.dataset.currency;
    costInput.value = '';
    clearTable();
    updateConversionText();
  });
});

// 输入监听逻辑（带防抖）
let debounceTimer;
costInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const cost = parseFloat(costInput.value);
    if (!isNaN(cost)) {
      updateTable(cost);
    } else {
      clearTable();
    }
  }, 300);
});

function updateTable(cost) {
  priceRows.innerHTML = '';
  createTableRow('成本（输入值）', cost, true);
  createTableRow('成本 × 2', cost * 2);

  MARGINS.forEach(margin => {
    createTableRow(`+${Math.round(margin * 100)}% 毛利`, cost * (1 + margin));
  });
}

function createTableRow(label, price, isCost = false) {
  let clpPrice, rmbPrice;
  if (currentCurrency === 'RMB') {
    rmbPrice = price;
    clpPrice = rmbPrice * rateInfo.cnyToClp;
  } else {
    clpPrice = price;
    rmbPrice = clpPrice * rateInfo.clpToCny;
  }

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="py-4 px-3 font-semibold ${isCost ? 'text-red-600' : ''}">${label}</td>
    <td class="py-4 px-3">${formatNumber(clpPrice)}</td>
    <td class="py-4 px-3">${formatNumber(rmbPrice)}</td>
  `;
  priceRows.appendChild(tr);
}

function clearTable() {
  priceRows.innerHTML = '';
  createTableRow('成本（输入值）', 0, true);
  createTableRow('成本 × 2', 0);
  MARGINS.forEach(margin => {
    createTableRow(`+${Math.round(margin * 100)}% 毛利`, 0);
  });
}
