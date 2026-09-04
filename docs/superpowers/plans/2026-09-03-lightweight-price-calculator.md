# Lightweight Price Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有页面改造成只包含手动汇率、出厂价、毛利阶梯和反推毛利的可靠离线定价工具。

**Architecture:** 把全部数学逻辑移入无 DOM 依赖的 `calculator.js` ES 模块，`script.js` 仅负责状态、DOM、持久化和复制反馈。页面不再依赖 Tailwind CDN，Service Worker 只缓存同源应用外壳并使用网络优先、缓存回退策略。

**Tech Stack:** 静态 HTML、原生 CSS、浏览器 ES modules、Service Worker、Node.js 内置 `node:test`。

**Spec:** `docs/superpowers/specs/2026-09-03-price-calculator-optimization-design.md`

## Global Constraints

- 本轮只保留出厂价、RMB/CLP 成本币种、手动 RMB→CLP 汇率、现有毛利阶梯、反推毛利和复制售价。
- 删除杂费、IVA、19% 税率和“净利润”措辞，不新增佣金或其他费用模型。
- 汇率没有固定默认值；只记住最后一个有效值，清空输入时同时清除存储。
- 汇率、出厂价和市场预期售价只接受有限正数。
- CLP 售价向上取整到 10 CLP，RMB 等值从最终 CLP 售价反算。
- 页面不得加载第三方运行时资源，不增加生产依赖。
- 保留现有 iOS 风格方向，修复焦点、标签、对比度和键盘操作问题。
- 使用 Node 内置测试运行器，实施过程遵循先失败、后实现、再通过的顺序。

## Execution Correction: Behavior-First Browser Tests

Critical plan review found that the originally listed `tests/markup.test.js` and `tests/pwa-contract.test.js` would only inspect source strings. Those source-contract tests are superseded by `tests/browser.test.js`, which serves the real application, launches installed Microsoft Edge through `playwright-core`, and asserts rendered behavior, network traffic, Service Worker state, offline reload, keyboard focus, and axe accessibility results. `playwright-core` and `axe-core` are development-only dependencies; `node:test` remains the only test runner and the application still has no production dependencies.

The replacement browser tests must fail before their corresponding production change and cover these observable outcomes:

- Task 2: no cross-origin runtime request; no rendered IVA or extra-fee control; labeled rate, factory-price, and target-price inputs; mobile viewport permits zoom; Tab produces a visible focus indicator.
- Task 3: RMB/CLP calculations, reverse margin, invalid-input clearing, currency `aria-pressed` state, rate persistence/clearing, and clipboard success/failure feedback.
- Task 4: `navigator.serviceWorker.ready` resolves; only the current `price-tool-*` cache remains; the manifest reports the real icon dimensions/theme; the complete calculator reloads while the browser context is offline.
- Task 5: an injected `axe-core` WCAG 2.1 A/AA scan has no label, disabled-zoom, keyboard-control, or serious color-contrast violation.

Before Task 2's first RED run, add the development dependencies with `npm install --save-dev playwright-core@1.62.1 axe-core@4.13.0`. Create `tests/browser-helpers.js` with a Node HTTP static server, explicit MIME types, installed Edge discovery, and cleanup registered through `test.after()`. Each browser test uses a fresh context; Service Worker tests use a fresh browser process so earlier cache state cannot satisfy the assertion.

---

## File Map

- Create `calculator.js`: 数值验证、换算、价格阶梯和反推毛利的纯函数。
- Create `package.json`: ES module 声明和 `npm test` 命令，无生产依赖。
- Create `tests/calculator.test.js`: 计算核心单元测试。
- Create `tests/browser-helpers.js`: 本地静态服务器、Edge 启动和测试清理。
- Create `tests/browser.test.js`: 页面、交互、PWA 和无障碍的真实浏览器测试。
- Create `tests/app-state.test.js`: 输入解析和汇率存储行为测试。
- Modify `index.html`: 删除杂费、IVA、Tailwind CDN和禁止缩放配置，换成语义化结构。
- Modify `style.css`: 完整本地布局、视觉样式、错误状态和无障碍状态。
- Rewrite `script.js`: DOM 控制器、输入状态、汇率持久化、渲染和复制反馈。
- Rewrite `sw.js`: 本地预缓存、旧缓存清理、网络优先和离线回退。
- Modify `manifest.json`: 主题色和真实图标尺寸。
- Modify `README.md`: 使用方法、公式、限制、开发和测试说明。

---

### Task 1: Extract and Test the Calculation Core

**Files:**
- Create: `package.json`
- Create: `calculator.js`
- Create: `tests/calculator.test.js`

**Interfaces:**
- Consumes: 无。
- Produces: `MARGINS`, `isPositiveFinite(value)`, `roundUpClp(value)`, `convertFactoryPrice(input)`, `calculatePriceRows(input)`, `calculateReverseMargin(input)`。
- `convertFactoryPrice({ factoryPrice, currency, rate })` returns `{ clp: number, rmb: number }`。
- `calculatePriceRows({ factoryPrice, currency, rate, margins })` returns `Array<{ margin: number, clp: number, rmb: number }>`。
- `calculateReverseMargin({ targetPriceClp, factoryPrice, currency, rate })` returns `{ factoryPriceClp: number, profitClp: number, profitRmb: number, marginPercent: number }`。

- [ ] **Step 1: Add the Node test command and failing calculation tests**

Create `package.json`:

```json
{
  "name": "price-calculator",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

Create `tests/calculator.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARGINS,
  isPositiveFinite,
  roundUpClp,
  convertFactoryPrice,
  calculatePriceRows,
  calculateReverseMargin,
} from '../calculator.js';

test('uses the retained margin ladder', () => {
  assert.deepEqual(MARGINS, [0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9]);
});

test('accepts only finite positive values', () => {
  assert.equal(isPositiveFinite(1), true);
  for (const value of [0, -1, NaN, Infinity, -Infinity, '135', null]) {
    assert.equal(isPositiveFinite(value), false);
  }
});

test('rounds CLP upward to the next 10', () => {
  assert.equal(roundUpClp(1204.875), 1210);
  assert.equal(roundUpClp(18750), 18750);
});

test('converts the factory price without applying sale-price rounding', () => {
  assert.deepEqual(convertFactoryPrice({ factoryPrice: 100, currency: 'RMB', rate: 135 }), {
    clp: 13500,
    rmb: 100,
  });
  assert.deepEqual(convertFactoryPrice({ factoryPrice: 15000, currency: 'CLP', rate: 135 }), {
    clp: 15000,
    rmb: 15000 / 135,
  });
});

test('calculates RMB factory-price rows without IVA', () => {
  const [row] = calculatePriceRows({
    factoryPrice: 100,
    currency: 'RMB',
    rate: 135,
    margins: [0.2],
  });
  assert.equal(row.margin, 0.2);
  assert.equal(row.clp, 16880);
  assert.equal(row.rmb, 16880 / 135);
});

test('calculates CLP factory-price rows without IVA', () => {
  const [row] = calculatePriceRows({
    factoryPrice: 15000,
    currency: 'CLP',
    rate: 135,
    margins: [0.2],
  });
  assert.deepEqual(row, { margin: 0.2, clp: 18750, rmb: 18750 / 135 });
});

test('reverse-calculates RMB factory-price margin', () => {
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

test('reverse-calculates CLP factory-price margin', () => {
  const result = calculateReverseMargin({
    targetPriceClp: 18750,
    factoryPrice: 15000,
    currency: 'CLP',
    rate: 135,
  });
  assert.equal(result.factoryPriceClp, 15000);
  assert.equal(result.profitClp, 3750);
  assert.equal(result.profitRmb, 3750 / 135);
  assert.equal(result.marginPercent, 20);
});

test('rejects invalid calculator inputs', () => {
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
    () => calculateReverseMargin({ targetPriceClp: -1, factoryPrice: 100, currency: 'RMB', rate: 135 }),
    RangeError,
  );
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `npm test`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `calculator.js`.

- [ ] **Step 3: Implement the pure calculation module**

Create `calculator.js` with these exact exports and validation rules:

```js
export const MARGINS = Object.freeze([0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9]);

const CURRENCIES = new Set(['RMB', 'CLP']);

export function isPositiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function roundUpClp(value) {
  if (!isPositiveFinite(value)) throw new RangeError('CLP value must be a finite positive number');
  return Math.ceil(value / 10) * 10;
}

function validateCommon({ factoryPrice, currency, rate }) {
  if (!isPositiveFinite(factoryPrice)) throw new RangeError('Factory price must be a finite positive number');
  if (!isPositiveFinite(rate)) throw new RangeError('Exchange rate must be a finite positive number');
  if (!CURRENCIES.has(currency)) throw new RangeError('Currency must be RMB or CLP');
}

function toFactoryPriceClp(factoryPrice, currency, rate) {
  return currency === 'RMB' ? factoryPrice * rate : factoryPrice;
}

export function convertFactoryPrice({ factoryPrice, currency, rate }) {
  validateCommon({ factoryPrice, currency, rate });
  const clp = toFactoryPriceClp(factoryPrice, currency, rate);
  return { clp, rmb: clp / rate };
}

export function calculatePriceRows({ factoryPrice, currency, rate, margins = MARGINS }) {
  validateCommon({ factoryPrice, currency, rate });
  if (!Array.isArray(margins) || margins.some((margin) =>
    typeof margin !== 'number' || !Number.isFinite(margin) || margin <= 0 || margin >= 1
  )) {
    throw new RangeError('Margins must be finite numbers between 0 and 1');
  }

  const factoryPriceClp = toFactoryPriceClp(factoryPrice, currency, rate);
  return margins.map((margin) => {
    const clp = roundUpClp(factoryPriceClp / (1 - margin));
    return { margin, clp, rmb: clp / rate };
  });
}

export function calculateReverseMargin({ targetPriceClp, factoryPrice, currency, rate }) {
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
```

- [ ] **Step 4: Run the core tests**

Run: `npm test`

Expected: 9 tests PASS, 0 FAIL.

- [ ] **Step 5: Commit the calculation core**

```bash
git add package.json calculator.js tests/calculator.test.js
git commit -m "refactor: extract pricing calculation core"
```

---

### Task 2: Simplify and Localize the Page

**Files:**
- Create: `tests/browser-helpers.js`
- Create: `tests/browser.test.js`
- Modify: `index.html`
- Modify: `style.css`

**Interfaces:**
- Consumes: DOM IDs expected by the Task 3 controller.
- Produces: `rateInput`, `factoryPriceInput`, `targetPriceInput`, `priceRows`, `exchangeHint`, `reverseResult`, `reverseMargin`, `reverseProfitRmb`, `copyStatus`, `rateError`, `factoryPriceError`, `targetPriceError`, and buttons with `data-currency`.

- [ ] **Step 1: Install browser-test drivers and write failing browser behavior tests**

This step uses the replacement tests defined in “Execution Correction: Behavior-First Browser Tests”; do not create the source-string `tests/markup.test.js` shown below.

Create `tests/markup.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

test('removes IVA, extra fees, Tailwind CDN, and disabled zoom', () => {
  assert.doesNotMatch(html, /tailwindcss\.com/i);
  assert.doesNotMatch(html, /IVA|19%|extraInput|额外杂费/i);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/i);
});

test('uses the simplified semantic controls', () => {
  assert.match(html, /<label[^>]+for="rateInput"/);
  assert.match(html, /<label[^>]+for="factoryPriceInput"/);
  assert.match(html, /<label[^>]+for="targetPriceInput"/);
  assert.match(html, /id="copyStatus"[^>]+aria-live="polite"/);
  assert.match(html, /<script type="module" src="script\.js"><\/script>/);
});

test('uses local focus and screen-reader styles', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.sr-only/);
  assert.doesNotMatch(css, /outline:\s*none/);
});
```

- [ ] **Step 2: Run the page behavior tests and verify they fail on the current page**

Run: `node --test tests/browser.test.js`

Expected: FAIL because the running page requests Tailwind CDN, renders IVA and `extraInput`, disables zoom, lacks label associations, and removes visible input focus.

- [ ] **Step 3: Rewrite the HTML around the simplified flow**

Update `index.html` to use only local assets and this semantic structure:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="style.css">

<main class="app-shell">
  <h1>定价</h1>
  <section class="card input-card" aria-labelledby="pricingInputsTitle">
    <h2 id="pricingInputsTitle" class="sr-only">定价输入</h2>
    <div class="field">
      <label for="rateInput">汇率（1 RMB = ? CLP）</label>
      <input id="rateInput" type="number" inputmode="decimal" min="0" step="0.01" placeholder="例如 135" aria-describedby="rateError">
      <p id="rateError" class="field-error" aria-live="polite"></p>
    </div>
    <fieldset class="field currency-field">
      <legend>出厂价币种</legend>
      <div class="currency-toggle">
        <button type="button" class="active" data-currency="RMB" aria-pressed="true">RMB</button>
        <button type="button" data-currency="CLP" aria-pressed="false">CLP</button>
      </div>
    </fieldset>
    <div class="field">
      <label id="factoryPriceLabel" for="factoryPriceInput">出厂价（RMB）</label>
      <input id="factoryPriceInput" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" aria-describedby="factoryPriceError">
      <p id="factoryPriceError" class="field-error" aria-live="polite"></p>
    </div>
  </section>

  <p id="exchangeHint" class="exchange-hint">当前汇率：未设置</p>

  <section class="card price-card" aria-labelledby="priceTableTitle">
    <h2 id="priceTableTitle" class="sr-only">售价策略</h2>
    <div class="table-scroll">
      <table>
        <thead><tr><th scope="col">策略</th><th scope="col">CLP</th><th scope="col">RMB</th><th scope="col"><span class="sr-only">复制</span></th></tr></thead>
        <tbody id="priceRows"></tbody>
      </table>
    </div>
    <p id="copyStatus" class="status-message" aria-live="polite"></p>
  </section>

  <section class="reverse-card" aria-labelledby="reverseTitle">
    <h2 id="reverseTitle">反推毛利</h2>
    <div class="field">
      <label for="targetPriceInput">市场预期售价（CLP）</label>
      <input id="targetPriceInput" type="number" inputmode="decimal" min="0" step="10" placeholder="输入价格" aria-describedby="targetPriceError">
      <p id="targetPriceError" class="field-error field-error-dark" aria-live="polite"></p>
    </div>
    <div id="reverseResult" class="reverse-result" hidden>
      <p><span>预估毛利率</span><strong id="reverseMargin">--%</strong></p>
      <p><span>预估毛利（RMB）</span><strong id="reverseProfitRmb">--</strong></p>
    </div>
  </section>
  <footer class="app-footer">Designed by You</footer>
</main>

<script type="module" src="script.js"></script>
```

Keep the existing manifest and Apple PWA meta tags, but remove the inline Service Worker registration because Task 3 will register it from `script.js`.

- [ ] **Step 4: Replace Tailwind utilities with local CSS**

Rewrite `style.css` with local rules for these exact classes and states:

```css
:root {
  --page-bg: #f2f2f7;
  --card-bg: rgba(255, 255, 255, 0.88);
  --text: #111114;
  --muted: #5f636d;
  --border: #c6c6c8;
  --input-bg: #ebebf0;
  --accent: #006ee6;
  --success: #137a39;
  --danger: #c62828;
  color-scheme: light;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--page-bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.app-shell { width: min(100% - 32px, 440px); margin: 0 auto; padding: 28px 0 40px; display: grid; gap: 20px; }
.app-shell > h1 { margin: 0 0 4px; text-align: center; font-size: 24px; }
.card, .reverse-card { border-radius: 22px; padding: 24px; }
.card { background: var(--card-bg); border: 1px solid rgba(255,255,255,.65); box-shadow: 0 8px 28px rgba(0,0,0,.07); }
.input-card { display: grid; gap: 20px; }
.field { display: grid; gap: 8px; }
.field label, .field legend { color: var(--muted); font-size: 14px; font-weight: 650; }
.field input { width: 100%; border: 2px solid transparent; border-radius: 16px; padding: 14px 16px; background: var(--input-bg); color: var(--text); font: inherit; }
button:focus-visible, input:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 2px; }
.currency-field { min-width: 0; margin: 0; padding: 0; border: 0; }
.currency-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 13px; background: var(--input-bg); }
.currency-toggle button { min-height: 40px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); font-weight: 700; }
.currency-toggle button.active { background: #fff; color: var(--text); box-shadow: 0 2px 7px rgba(0,0,0,.12); }
.field-error { min-height: 18px; margin: 0; color: var(--danger); font-size: 13px; }
.exchange-hint, .status-message { min-height: 18px; margin: 0; color: var(--muted); text-align: center; font-size: 13px; }
.price-card { padding: 0; overflow: hidden; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 14px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
th:first-child, td:first-child { padding-left: 20px; }
th { color: var(--muted); font-size: 13px; }
.copy-button { display: inline-grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); }
.copy-button:hover { background: rgba(0,0,0,.06); color: var(--accent); }
.copy-button[data-copied="true"] { color: var(--success); }
.factory-row { background: #fff3f2; color: var(--danger); }
.price-clp { font-weight: 750; font-variant-numeric: tabular-nums; }
.price-rmb { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; }
.reverse-card { display: grid; gap: 18px; background: linear-gradient(145deg, #2c2c2e, #1c1c1e); color: #fff; box-shadow: 0 12px 24px rgba(0,0,0,.2); }
.reverse-card h2 { margin: 0; }
.reverse-card input { background: rgba(255,255,255,.12); color: #fff; }
.reverse-card label { color: #c7c7cc; }
.field-error-dark { color: #ff9f9a; }
.reverse-result p { display: flex; justify-content: space-between; gap: 16px; margin: 10px 0; }
.reverse-result span { color: #c7c7cc; }
.margin-low { color: #ff9f9a; }
.margin-medium { color: #ffd60a; }
.margin-high { color: #63da7b; }
.app-footer { color: var(--muted); text-align: center; font-size: 12px; }
[hidden] { display: none !important; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 380px) { .app-shell { width: min(100% - 20px, 440px); } th, td { padding-inline: 8px; } }
```

- [ ] **Step 5: Run the markup and core tests**

Run: `npm test`

Expected: all calculator and markup tests PASS.

- [ ] **Step 6: Commit the simplified local page**

```bash
git add index.html style.css package.json package-lock.json tests/browser-helpers.js tests/browser.test.js
git commit -m "refactor: simplify pricing interface"
```

---

### Task 3: Implement Validated UI State and Persistence

**Files:**
- Create: `tests/app-state.test.js`
- Rewrite: `script.js`

**Interfaces:**
- Consumes: Task 1 calculator exports and Task 2 DOM IDs.
- Produces: `parsePositiveInput(rawValue)`, `readSavedRate(storage)`, `persistRate(storage, rawValue)`, and browser initialization guarded by `typeof document !== 'undefined'`.
- `parsePositiveInput(rawValue)` returns `{ state: 'empty' }`, `{ state: 'invalid' }`, or `{ state: 'valid', value: number }`.
- `readSavedRate(storage)` returns a numeric string or `''`.
- `persistRate(storage, rawValue)` returns without throwing; it stores valid input, removes the key for empty input, and leaves an existing valid value unchanged for invalid input.

- [ ] **Step 1: Write failing input and persistence tests**

Create `tests/app-state.test.js`:

```js
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

test('classifies empty, invalid, and valid input', () => {
  assert.deepEqual(parsePositiveInput(''), { state: 'empty' });
  assert.deepEqual(parsePositiveInput('   '), { state: 'empty' });
  for (const raw of ['0', '-1', 'Infinity', 'abc']) {
    assert.deepEqual(parsePositiveInput(raw), { state: 'invalid' });
  }
  assert.deepEqual(parsePositiveInput('135.5'), { state: 'valid', value: 135.5 });
});

test('stores valid rate, clears empty rate, and ignores invalid rate', () => {
  const storage = createStorage();
  persistRate(storage, '135.5');
  assert.equal(readSavedRate(storage), '135.5');
  persistRate(storage, '-2');
  assert.equal(readSavedRate(storage), '135.5');
  persistRate(storage, '');
  assert.equal(readSavedRate(storage), '');
});

test('storage failures never escape', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(readSavedRate(storage), '');
  assert.doesNotThrow(() => persistRate(storage, '135'));
});
```

- [ ] **Step 2: Run the state tests and verify the old script cannot be imported**

Run: `node --test tests/app-state.test.js`

Expected: FAIL because the current `script.js` does not export the required functions and reads `document` during Node import.

- [ ] **Step 3: Implement parsing, safe storage, and guarded initialization**

At the top of `script.js`, import Task 1 functions and export these helpers:

```js
import { MARGINS, calculatePriceRows, calculateReverseMargin } from './calculator.js';

const RATE_STORAGE_KEY = 'exchangeRate';

export function parsePositiveInput(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') return { state: 'empty' };
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
    if (parsed.state === 'empty') storage.removeItem(RATE_STORAGE_KEY);
    if (parsed.state === 'valid') storage.setItem(RATE_STORAGE_KEY, rawValue.trim());
  } catch {
    // Storage is optional; calculation remains available.
  }
}
```

End the module with:

```js
if (typeof document !== 'undefined') initializeApp();
```

- [ ] **Step 4: Implement the browser controller**

Implement `initializeApp()` with these behaviors:

Use this clipboard contract and controller structure; keep all formatted user data in `textContent`:

```js
async function copyPrice(button, text, statusElement) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    statusElement.textContent = `已复制 ${text}`;
    button.dataset.copied = 'true';
    window.setTimeout(() => {
      button.dataset.copied = 'false';
      statusElement.textContent = '';
    }, 1500);
  } catch {
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
    exchangeHint: document.querySelector('#exchangeHint'),
    priceRows: document.querySelector('#priceRows'),
    copyStatus: document.querySelector('#copyStatus'),
    reverseResult: document.querySelector('#reverseResult'),
    reverseMargin: document.querySelector('#reverseMargin'),
    reverseProfitRmb: document.querySelector('#reverseProfitRmb'),
  };
  let currentCurrency = 'RMB';

  function showValidation(input, errorElement, parsed) {
    const invalid = parsed.state === 'invalid';
    errorElement.textContent = invalid ? '请输入大于 0 的有效数字' : '';
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function appendCell(row, text, className = '') {
    const cell = document.createElement('td');
    cell.textContent = text;
    if (className) cell.className = className;
    row.append(cell);
    return cell;
  }

  function appendPriceRow(label, { clp, rmb }, className = '', copyable = true) {
    const row = document.createElement('tr');
    if (className) row.className = className;
    appendCell(row, label);
    appendCell(row, fmtClp.format(clp), 'price-clp');
    appendCell(row, fmtRmb.format(rmb), 'price-rmb');
    const actionCell = appendCell(row, '');
    if (!copyable) {
      elements.priceRows.append(row);
      return;
    }
    const copyButton = document.createElement('button');
    const copyText = `${fmtClp.format(clp)} CLP`;
    copyButton.type = 'button';
    copyButton.className = 'copy-button';
    copyButton.dataset.copied = 'false';
    copyButton.setAttribute('aria-label', `复制 ${copyText} 售价`);
    copyButton.textContent = '复制';
    copyButton.addEventListener('click', () => copyPrice(copyButton, copyText, elements.copyStatus));
    actionCell.append(copyButton);
    elements.priceRows.append(row);
  }

  function render() {
    const rate = parsePositiveInput(elements.rate.value);
    const factoryPrice = parsePositiveInput(elements.factoryPrice.value);
    const targetPrice = parsePositiveInput(elements.targetPrice.value);
    showValidation(elements.rate, elements.rateError, rate);
    showValidation(elements.factoryPrice, elements.factoryPriceError, factoryPrice);
    showValidation(elements.targetPrice, elements.targetPriceError, targetPrice);

    elements.exchangeHint.textContent = rate.state === 'valid'
      ? `当前汇率：1 RMB = ${rate.value} CLP`
      : '当前汇率：未设置';
    elements.priceRows.replaceChildren();
    elements.copyStatus.textContent = '';
    elements.reverseResult.hidden = true;

    if (rate.state !== 'valid' || factoryPrice.state !== 'valid') return;

    appendPriceRow(
      '出厂价',
      convertFactoryPrice({
        factoryPrice: factoryPrice.value,
        currency: currentCurrency,
        rate: rate.value,
      }),
      'factory-row',
      false,
    );
    const rows = calculatePriceRows({
      factoryPrice: factoryPrice.value,
      currency: currentCurrency,
      rate: rate.value,
      margins: MARGINS,
    });
    for (const row of rows) appendPriceRow(`毛利 ${Math.round(row.margin * 100)}%`, row);

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
```

Define `fmtClp` as `new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })` and `fmtRmb` as `new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Add `convertFactoryPrice` to the Task 1 import list used by this controller.

- [ ] **Step 5: Run all Node tests**

Run: `npm test`

Expected: calculator, markup, and app-state tests PASS with 0 failures.

- [ ] **Step 6: Run a local browser smoke test**

Run from the repository root:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Verify in a 390×844 browser viewport:

- Rate `135`, RMB factory price `100`: the 20% row is `16.880 CLP`, RMB equivalent is approximately `125.04`.
- Enter target `16875`: reverse margin is `20.0%` and RMB margin amount is `25.00`.
- Switch to CLP and enter factory price `15000`: the 20% row is `18.750 CLP`.
- Clear the rate: hint becomes `当前汇率：未设置`, table and reverse result clear, and refresh does not restore a rate.
- Enter `0` or a negative value: field error appears and no stale result remains.
- Tab reaches every input, currency button, and copy button with a visible focus ring.

- [ ] **Step 7: Commit the UI controller**

```bash
git add script.js tests/app-state.test.js
git commit -m "feat: validate pricing inputs and persist rate"
```

---

### Task 4: Repair the PWA Cache and Manifest

**Files:**
- Modify: `tests/browser.test.js`
- Rewrite: `sw.js`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: local paths `./`, `./index.html`, `./style.css`, `./calculator.js`, `./script.js`, `./manifest.json`, `./icon.png`.
- Produces: cache `price-tool-v4`; successful same-origin offline fallback; manifest icon declaration `1024x1024`.

- [ ] **Step 1: Write failing Service Worker behavior tests**

Append the Task 4 Service Worker, cache, manifest, and offline scenarios from “Execution Correction: Behavior-First Browser Tests” to `tests/browser.test.js`; do not create the source-string `tests/pwa-contract.test.js` shown below.

Create `tests/pwa-contract.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('precache contains only exact local application assets', () => {
  assert.doesNotMatch(sw, /https?:\/\//i);
  for (const asset of ['./index.html', './style.css', './calculator.js', './script.js', './manifest.json', './icon.png']) {
    assert.match(sw, new RegExp(asset.replaceAll('.', '\\.')));
  }
});

test('deletes old price-tool caches and claims clients', () => {
  assert.match(sw, /const CACHE_PREFIX = ['"]price-tool-['"]/);
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /startsWith\(CACHE_PREFIX\)/);
  assert.match(sw, /clients\.claim/);
});

test('implements a navigation fallback to cached index', () => {
  assert.match(sw, /request\.mode\s*===\s*['"]navigate['"]/);
  assert.match(sw, /caches\.match\(['"]\.\/index\.html['"]\)/);
});

test('manifest declares the actual source icon size and matching theme', () => {
  assert.equal(manifest.theme_color.toLowerCase(), '#f2f2f7');
  assert.deepEqual(manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })), [
    { src: 'icon.png', sizes: '1024x1024', type: 'image/png' },
  ]);
});
```

- [ ] **Step 2: Run the PWA browser tests and verify they fail**

Run: `node --test --test-name-pattern="PWA" tests/browser.test.js`

Expected: FAIL because the current worker never becomes ready and the offline application cannot reload.

- [ ] **Step 3: Implement the local network-first Service Worker**

Rewrite `sw.js` around this exact strategy:

```js
const CACHE_NAME = 'price-tool-v4';
const CACHE_PREFIX = 'price-tool-';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './calculator.js',
  './script.js',
  './manifest.json',
  './icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
```

- [ ] **Step 4: Correct the manifest metadata**

Set `background_color` and `theme_color` to `#F2F2F7`. Replace the two inaccurate icon entries with:

```json
"icons": [
  {
    "src": "icon.png",
    "sizes": "1024x1024",
    "type": "image/png"
  }
]
```

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: all calculation, markup, state, and PWA contract tests PASS.

- [ ] **Step 6: Verify activation and offline reload in a fresh browser profile**

Serve the repository over `http://127.0.0.1:4173/`, open a fresh browser context, and verify:

```js
await navigator.serviceWorker.ready;
await caches.keys();
```

Expected: an active worker and only `price-tool-v4` among `price-tool-*` caches. Reload once so the page is controlled, switch the browser context offline, and reload again. Expected: complete local styling, all price calculations, and no request to `cdn.tailwindcss.com`.

- [ ] **Step 7: Commit the PWA repair**

```bash
git add sw.js manifest.json tests/browser.test.js
git commit -m "fix: make pricing app reliably available offline"
```

---

### Task 5: Document and Verify the Complete Application

**Files:**
- Modify: `README.md`
- Modify if verification exposes a defect: `index.html`, `style.css`, `script.js`, `calculator.js`, `sw.js`, and the corresponding test file.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: documented formulas, usage instructions, limitations, and final verification evidence.

- [ ] **Step 1: Replace the placeholder README**

Document these sections in `README.md`:

````markdown
# 跨境定价助手

一个无需后端、可安装和离线使用的 RMB/CLP 出厂价定价工具。

## 使用方法

1. 输入手动汇率（1 RMB 对应多少 CLP）。
2. 选择出厂价币种并输入出厂价。
3. 从毛利阶梯中复制需要的 CLP 售价。
4. 可输入市场预期售价，反推毛利率和 RMB 毛利金额。

## 计算口径

- 售价 = 出厂价 ÷ (1 - 目标毛利率)
- 毛利率 = (售价 - 出厂价) ÷ 售价
- CLP 售价向上取整到 10 CLP。
- 本版本不计算 IVA、平台佣金、运费、关税或其他费用，因此结果是预估毛利而非净利润。

## 本地运行

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

访问 `http://127.0.0.1:4173/`。

## 测试

```powershell
npm test
```
````

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Expected: 0 failed tests.

- [ ] **Step 3: Run syntax and repository checks**

Run:

```powershell
node --check calculator.js
node --check script.js
node --check sw.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest valid')"
git diff --check
git status --short
```

Expected: all syntax commands exit 0, manifest prints `manifest valid`, `git diff --check` prints nothing, and status contains only the intended README change before commit.

- [ ] **Step 4: Run final browser and accessibility acceptance**

With a fresh browser profile and 390×844 viewport, verify all scenarios from Tasks 3 and 4. Run an automated WCAG 2.1 A/AA scan and require zero violations for form labels, disabled zoom, and serious color contrast. Confirm the Network panel contains only same-origin runtime requests after the first HTML response.

- [ ] **Step 5: Review the final diff against the approved scope**

Run:

```powershell
git diff HEAD~4 -- index.html style.css script.js calculator.js sw.js manifest.json README.md package.json tests
```

Confirm that `extraInput`, `额外杂费`, `IVA`, `19%`, and `净利润` do not appear in runtime files, while `出厂价`, `预估毛利`, local Service Worker assets, and validation tests do appear.

- [ ] **Step 6: Commit documentation and any verification-only corrections**

```bash
git add README.md index.html style.css script.js calculator.js sw.js manifest.json package.json tests
git commit -m "docs: explain pricing calculator usage and limits"
```

- [ ] **Step 7: Capture final evidence**

Run:

```powershell
npm test
git status --short --branch
git log --oneline -6
```

Expected: all tests pass, the worktree is clean, and the log shows the calculation, interface, controller, PWA, and documentation commits after the approved design commit.
