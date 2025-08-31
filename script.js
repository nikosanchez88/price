let currentCurrency = 'RMB';
const MARGINS = [0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0];

const costInput = document.getElementById('costInput');
const rateInput = document.getElementById('rateInput');
const currencyButtons = document.querySelectorAll('.currency-toggle button');
const priceRows = document.getElementById('priceRows');
const exchangeHint = document.querySelector('.exchange-hint');

const fmtCLP = new Intl.NumberFormat('zh-CN',{ maximumFractionDigits:0 });
const fmtCNY = new Intl.NumberFormat('zh-CN',{ minimumFractionDigits:2, maximumFractionDigits:2 });
const fmt = (n,c)=>isFinite(n)?(c==='CLP'?fmtCLP:fmtCNY).format(n):'——';

// 初始渲染
window.addEventListener('DOMContentLoaded', clearTable);

// 币种切换
currencyButtons.forEach(btn=>{
  btn.addEventListener('click',()=>{
    currencyButtons.forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
    btn.classList.add('active');btn.setAttribute('aria-pressed','true');
    currentCurrency=btn.dataset.currency;
    costInput.value='';
    clearTable();
  });
});

// 输入监听
[costInput, rateInput].forEach(inp=>{
  inp.addEventListener('input',()=>{
    const cost=parseFloat(costInput.value);
    const rate=parseFloat(rateInput.value);
    if(!isNaN(cost) && !isNaN(rate) && rate>0){
      updateTable(cost,rate);
      exchangeHint.textContent=`当前汇率：1 RMB = ${rate} CLP`;
    }else{
      clearTable();
      exchangeHint.textContent=`当前汇率：未设置`;
    }
  });
});

function updateTable(cost,rate){
  priceRows.innerHTML='';
  createRow('成本（输入值）',cost,rate,true,false);
  createRow('成本 × 2',cost*2,rate,false,false);
  MARGINS.forEach(m=>createRow(`+${Math.round(m*100)}% 毛利`,cost*(1+m),rate,false,true));
}

function createRow(label,price,rate,isCost=false,isProfit=false){
  let clp,rmb;
  if(currentCurrency==='RMB'){ rmb=price; clp=rmb*rate; }
  else { clp=price; rmb=clp/rate; }

  const tr=document.createElement('tr');
  if(isCost) tr.classList.add('cost-row');
  if(isProfit) tr.classList.add('profit-row');

  const td1=document.createElement('td'); td1.textContent=label;
  const td2=document.createElement('td'); td2.textContent=fmt(clp,'CLP');
  const td3=document.createElement('td'); td3.textContent=fmt(rmb,'RMB');
  const td4=document.createElement('td');
  const copyBtn=document.createElement('span');
  copyBtn.textContent='复制';
  copyBtn.className='copy-btn';
  copyBtn.addEventListener('click',()=>navigator.clipboard.writeText(`${clp} CLP / ${rmb} RMB`));
  td4.appendChild(copyBtn);

  tr.append(td1,td2,td3,td4);
  priceRows.appendChild(tr);
}

function clearTable(){
  priceRows.innerHTML='';
  createRow('成本（输入值）',0,1,true,false);
  createRow('成本 × 2',0,1,false,false);
  MARGINS.forEach(m=>createRow(`+${Math.round(m*100)}% 毛利`,0,1,false,true));
}
