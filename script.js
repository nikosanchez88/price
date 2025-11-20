// 配置常量
let currentCurrency = 'RMB';
// 1. 恢复了完整的毛利阶梯
const MARGINS = [
  0.20,
  0.30,
  0.40,
  0.45, // 新增
  0.50,
  0.55, // 新增
  0.60,
  0.70,
  0.80,
  0.90
];

// DOM 元素
const els = {
  cost: document.getElementById('costInput'),
  extra: document.getElementById('extraInput'),
  rate: document.getElementById('rateInput'),
  tax: document.getElementById('taxToggle'),
  targetPrice: document.getElementById('targetPriceInput'),
  currencyBtns: document.querySelectorAll('.currency-toggle button'),
  rows: document.getElementById('priceRows'),
  hint: document.querySelector('.exchange-hint'),
  revResult: document.getElementById('reverseResult'),
  revMargin: document.getElementById('revMargin'),
  revProfit: document.getElementById('revProfitRMB'),
  revTaxHint: document.getElementById('revTaxHint')
};

// 格式化工具
const fmtCLP = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const fmtCNY = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const roundCLP = (n) => Math.ceil(n / 10) * 10; // 向上取整到10

// --- 初始化 ---
window.addEventListener('DOMContentLoaded', () => {
  const savedRate = localStorage.getItem('exchangeRate');
  if (savedRate) els.rate.value = savedRate;
  triggerUpdate();
});

// --- 事件监听 ---
// 1. 所有输入框变动 -> 触发计算
[els.cost, els.extra, els.rate, els.tax].forEach(el => {
  el.addEventListener('input', () => {
    if (el === els.rate) localStorage.setItem('exchangeRate', els.rate.value);
    triggerUpdate();
  });
});

// 2. 币种切换
els.currencyBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    els.currencyBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCurrency = btn.dataset.currency;
    triggerUpdate();
  });
});

// 3. 反推利润计算
els.targetPrice.addEventListener('input', calcReverseProfit);

// --- 核心逻辑 ---

function triggerUpdate() {
  const cost = parseFloat(els.cost.value) || 0;
  const extra = parseFloat(els.extra.value) || 0;
  const rate = parseFloat(els.rate.value);
  const hasTax = els.tax.checked;

  // 更新提示
  if (rate) els.hint.textContent = `当前汇率: 1 RMB = ${rate} CLP`;
  
  // 清空或更新表格
  els.rows.innerHTML = '';
  if (!rate || cost <= 0) {
    // 这里可以放空状态，或者什么都不做
    calcReverseProfit(); // 即使没成本，也要尝试更新反推模块的状态
    return;
  }

  // 基础成本显示 (Total Cost)
  const totalCost = cost + extra;
  createRow('总成本 (含杂费)', totalCost, rate, false, true, false);

  // 循环生成价格策略
  MARGINS.forEach(margin => {
    // 1. 先算未税售价： 成本 / (1 - 毛利率)
    let rawPrice = totalCost / (1 - margin);
    
    // 2. 如果需要含税，则 x 1.19
    if (hasTax) rawPrice = rawPrice * 1.19;

    const label = `毛利 ${Math.round(margin * 100)}%`;
    createRow(label, rawPrice, rate, hasTax, false, true);
  });

  // 联动更新反推模块（如果用户已经输入了目标价，成本变动时也实时更新反推结果）
  calcReverseProfit();
}

// ... 前面的代码保持不变 ...

function createRow(label, priceBase, rate, isTaxed, isCostRow, isProfitRow) {
  let clp, rmb;

  // 货币换算逻辑
  if (currentCurrency === 'RMB') {
    rmb = priceBase;
    clp = rmb * rate;
  } else {
    clp = priceBase;
    rmb = clp / rate;
  }

  clp = roundCLP(clp); 

  const tr = document.createElement('tr');
  if (isCostRow) tr.className = 'bg-red-50 text-red-600 font-medium';
  
  const tdLabel = document.createElement('td');
  tdLabel.className = "pl-6"; // 增加左侧缩进，对齐表头
  tdLabel.innerHTML = `${label} ${isTaxed ? '<span class="text-xs text-green-600 ml-1 font-normal">IVA</span>' : ''}`;
  
  const tdCLP = document.createElement('td'); 
  tdCLP.className = "font-bold";
  tdCLP.textContent = fmtCLP.format(clp);
  
  const tdRMB = document.createElement('td'); 
  tdRMB.className = "text-gray-500 text-sm";
  tdRMB.textContent = fmtCNY.format(rmb);

  const tdAction = document.createElement('td');
  
  // --- ✨ 图标核心修改开始 ---
  const btn = document.createElement('div'); // 改用 div 方便布局
  btn.className = 'copy-btn text-gray-400 hover:text-blue-500 transition-colors duration-200';
  
  // 定义 SVG 图标 (极简线条风格)
  const iconCopy = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  const iconCheck = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  btn.innerHTML = iconCopy; // 默认显示复制图标

  btn.onclick = () => {
    navigator.clipboard.writeText(`${fmtCLP.format(clp)} CLP`);
    
    // 切换成对勾图标
    btn.innerHTML = iconCheck;
    
    // 1.5秒后变回来
    setTimeout(() => {
      btn.innerHTML = iconCopy;
    }, 1500);
  };
  // --- ✨ 图标核心修改结束 ---

  tdAction.appendChild(btn);
  tr.append(tdLabel, tdCLP, tdRMB, tdAction);
  els.rows.appendChild(tr);
}

// --- 反推利润逻辑 ---
function calcReverseProfit() {
  const targetPrice = parseFloat(els.targetPrice.value);
  const cost = parseFloat(els.cost.value) || 0;
  const extra = parseFloat(els.extra.value) || 0;
  const rate = parseFloat(els.rate.value);
  
  if (!targetPrice || !rate || cost <= 0) {
    els.revResult.classList.add('hidden');
    return;
  }

  els.revResult.classList.remove('hidden');
  const hasTax = els.tax.checked;

  // 1. 计算净收入 (Net Revenue)
  // 如果输入的价格是含税的，我们需要先剔除税，才能算毛利
  // 假设用户输入的"市场价"通常是含税价 (货架价)
  // 如果上面的开关开了，说明我们全套逻辑都是含税的
  
  let netRevenueCLP = targetPrice;
  if (hasTax) {
    netRevenueCLP = targetPrice / 1.19; // 剔除增值税
    els.revTaxHint.textContent = "* 已从售价中扣除 19% IVA 计算净利";
  } else {
    els.revTaxHint.textContent = "* 未扣除税费 (假设出口免税或未税交易)";
  }

  // 2. 计算总成本 (转为 CLP)
  let totalCostCLP = (cost + extra);
  if (currentCurrency === 'RMB') totalCostCLP = totalCostCLP * rate;

  // 3. 计算利润
  const profitCLP = netRevenueCLP - totalCostCLP;
  const profitRMB = profitCLP / rate;
  
  // 4. 计算毛利率 (Profit / Net Revenue)
  // 注意：毛利率通常是 (销售收入-成本)/销售收入
  const margin = (profitCLP / netRevenueCLP) * 100;

  // 渲染
  els.revMargin.textContent = margin.toFixed(1) + '%';
  els.revProfit.textContent = fmtCNY.format(profitRMB);

  // 颜色反馈
  if (margin < 20) {
    els.revMargin.className = "text-2xl font-bold text-red-400"; // 亏本或低利
  } else if (margin > 40) {
    els.revMargin.className = "text-2xl font-bold text-green-400"; // 暴利
  } else {
    els.revMargin.className = "text-2xl font-bold text-yellow-400"; // 正常
  }
}