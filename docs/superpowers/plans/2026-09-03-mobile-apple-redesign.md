# Mobile Apple-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the calculator as a polished, mobile-first Apple-style grouped interface with a complete 10%–90% margin ladder, whole-row copying, a sticky cost summary, and a secondary collapsible reverse-margin tool.

**Architecture:** Keep all pricing math isolated in `calculator.js` and reshape only the presentation layer around it. `index.html` provides semantic mounting points, `script.js` renders cost and price-list components from calculator outputs, and `style.css` supplies a dependency-free mobile design system; real-browser tests protect behavior, responsive layout, PWA caching, and accessibility.

**Tech Stack:** Semantic HTML5, CSS custom properties and media queries, vanilla ES modules, Node.js `node:test`, Playwright Core with the installed Chromium browser, axe-core, Service Worker/PWA APIs.

**Spec:** `docs/superpowers/specs/2026-09-03-mobile-apple-redesign-design.md`

## Global Constraints

- Preserve the existing gross-margin, reverse-margin, exchange-rate, and CLP rounding formulas.
- The default margin ladder is exactly `10%, 20%, 30%, 40%, 45%, 50%, 55%, 60%, 70%, 80%, 90%`; do not add a 100% gross-margin row.
- Preserve manual rate entry, valid-rate local persistence, RMB/CLP factory-price choice, and real-time calculation.
- Use no UI framework, external font, CDN, icon library, or production dependency.
- Use semantic system colors: blue for interaction, green for success, red for errors, and neutral styling for landed cost.
- Retain every CLP and RMB value; CLP is primary and RMB is secondary.
- Keep IVA, marketplace fees, freight, duties, history, custom margins, cloud sync, and dark mode outside this implementation.
- Support 320–440 px mobile widths, browser zoom, safe areas, visible focus, reduced motion, and minimum 44 px primary touch targets.
- Preserve installability and offline operation.

---

### Task 1: Add the 10% Margin to the Calculation Contract

**Files:**
- Modify: `calculator.js`
- Test: `tests/calculator.test.js`

**Interfaces:**
- Consumes: `calculatePriceRows({ factoryPrice, currency, rate, margins? })`.
- Produces: `MARGINS === [0.1, 0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9]` and an 11-row default result.

- [ ] **Step 1: Write the failing calculation tests**

Update the default-ladder assertion and independently assert the hand-calculated 10% result:

```js
test('the default calculation returns the complete 10 to 90 percent margin ladder', () => {
  const rows = calculatePriceRows({ factoryPrice: 100, currency: 'RMB', rate: 135 });
  assert.deepEqual(
    rows.map((row) => row.margin),
    [0.1, 0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9],
  );
  assert.deepEqual(rows[0], { margin: 0.1, clp: 15000, rmb: 111.11111111111111 });
});
```

- [ ] **Step 2: Run the test and verify the expected RED state**

Run:

```powershell
node --test --test-name-pattern "complete 10 to 90" tests/calculator.test.js
```

Expected: FAIL because the current first margin is `0.2` and the array has only ten entries.

- [ ] **Step 3: Add the minimal production value**

Change the exported constant in `calculator.js` to:

```js
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
```

- [ ] **Step 4: Run the calculation suite and verify GREEN**

Run:

```powershell
node --test tests/calculator.test.js
```

Expected: every calculation test passes, including rejection of margin `1`.

- [ ] **Step 5: Commit the calculation contract**

```powershell
git add calculator.js tests/calculator.test.js
git commit -m "feat: add 10 percent margin tier"
```

---

### Task 2: Replace the Table with a Semantic Mobile Price List

**Files:**
- Modify: `index.html`
- Modify: `script.js`
- Test: `tests/browser.test.js`

**Interfaces:**
- Consumes: `MARGINS`, `convertFactoryPrice()`, `calculatePriceRows()`, `fmtClp`, and `fmtRmb`.
- Produces: DOM mounts `#costSummary`, `#costContext`, `#landedPriceSummary`, `#priceList`, and semantic `.price-row` elements.

- [ ] **Step 1: Rewrite the browser expectations before production markup**

Replace table-specific assertions with the intended list contract:

```js
test('the mobile price list keeps factory input and shows the complete landed-cost ladder', async () => {
  const { context, page } = await openPage();
  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');

  assert.equal(await page.locator('#factoryPriceLabel').textContent(), '出厂价（RMB）');
  assert.equal(await page.locator('table').count(), 0);
  assert.equal(await page.locator('#costSummary').isHidden(), false);
  assert.match(await page.locator('#costContext').textContent(), /100.*135/);
  assert.equal(await page.locator('#landedPriceSummary').textContent(), '13.500 CLP');

  const rows = page.locator('#priceList .price-row');
  assert.equal(await rows.count(), 12);
  assert.match(await rows.first().innerText(), /入库价.*13\.500.*100\.00 RMB/s);
  assert.match(await rows.nth(1).innerText(), /毛利 10%.*15\.000.*111\.11 RMB/s);
  assert.match(await rows.last().innerText(), /毛利 90%.*135\.000.*1,000\.00 RMB/s);
  await context.close();
});
```

Update existing CLP, invalid-input, formula, accessibility, and offline tests to query `#priceList .price-row` instead of `#priceRows tr`. Expected result counts become 12: one landed-cost row plus eleven margin rows.

- [ ] **Step 2: Run the mobile-list test and verify RED**

Run:

```powershell
node --test --test-name-pattern "mobile price list" tests/browser.test.js
```

Expected: FAIL because `#costSummary` and `#priceList` do not exist and a `<table>` is still rendered.

- [ ] **Step 3: Replace the header, input, summary, list, and reverse mounts**

Restructure `index.html` around this semantic skeleton while retaining the existing input IDs and error associations:

```html
<main class="app-shell">
  <header class="app-header">
    <h1>定价</h1>
  </header>

  <section class="input-card" aria-labelledby="pricingInputsTitle">
    <h2 id="pricingInputsTitle" class="sr-only">定价输入</h2>
    <fieldset class="currency-field">
      <legend>出厂价币种</legend>
      <div class="currency-toggle">
        <button type="button" class="active" data-currency="RMB" aria-pressed="true">RMB</button>
        <button type="button" data-currency="CLP" aria-pressed="false">CLP</button>
      </div>
    </fieldset>
    <div class="input-grid">
      <div class="field">
        <label for="rateInput">综合汇率</label>
        <input id="rateInput" type="number" inputmode="decimal" min="0" step="0.01" placeholder="195" aria-describedby="rateHelp rateError">
        <p id="rateHelp" class="field-help">1 RMB 对应的综合 CLP 成本</p>
        <p id="rateError" class="field-error" aria-live="polite"></p>
      </div>
      <div class="field">
        <label id="factoryPriceLabel" for="factoryPriceInput">出厂价（RMB）</label>
        <input id="factoryPriceInput" type="number" inputmode="decimal" min="0" step="0.01" placeholder="100" aria-describedby="factoryPriceError">
        <p id="factoryPriceError" class="field-error" aria-live="polite"></p>
      </div>
    </div>
  </section>

  <section class="pricing-section" aria-labelledby="priceListTitle">
    <div id="costSummary" class="cost-summary" hidden>
      <span id="costContext"></span>
      <strong id="landedPriceSummary"></strong>
    </div>
    <div class="section-heading">
      <h2 id="priceListTitle">毛利阶梯</h2>
      <p>点击售价即可复制</p>
    </div>
    <div id="priceList" class="price-list"></div>
  </section>

  <details id="reverseDisclosure" class="reverse-card">
    <summary>
      <span><small>店铺售价 / 网点实收价</small>反推毛利</span>
      <span class="disclosure-chevron" aria-hidden="true">›</span>
    </summary>
    <div class="reverse-content">
      <div class="field">
        <label for="targetPriceInput">店铺售价 / 网点实收价（CLP）</label>
        <input id="targetPriceInput" type="number" inputmode="decimal" min="0" step="10" placeholder="输入价格" aria-describedby="targetPriceError">
        <p id="targetPriceError" class="field-error" aria-live="polite"></p>
      </div>
      <div id="reverseResult" class="reverse-result" hidden>
        <div class="reverse-metric">
          <span>预估毛利率</span>
          <strong id="reverseMargin">--%</strong>
        </div>
        <div class="reverse-metric">
          <span>预估毛利（RMB）</span>
          <strong id="reverseProfitRmb">--</strong>
        </div>
        <p class="result-note">按当前入库价估算，不代表扣除全部经营费用后的净利润。</p>
      </div>
    </div>
  </details>

  <footer class="app-footer">本地计算 · 数据仅保存在此设备</footer>
</main>
```

Remove `#exchangeHint`, the table, table headings, `.table-scroll`, and the dark-card heading.

- [ ] **Step 4: Render the new list and summary in `script.js`**

Change the element map to use the new mounts:

```js
priceList: document.querySelector('#priceList'),
costSummary: document.querySelector('#costSummary'),
costContext: document.querySelector('#costContext'),
landedPriceSummary: document.querySelector('#landedPriceSummary'),
```

Replace table-cell rendering with structured row content:

```js
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
```

In `render()`, clear `elements.priceList`, hide the summary before validation, then populate valid state:

```js
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
```

Keep calculations delegated to `calculator.js`; do not duplicate formulas in UI code.

- [ ] **Step 5: Run list and existing formula tests**

Run:

```powershell
node --test --test-name-pattern "mobile price list|RMB pricing|CLP currency|invalid values" tests/browser.test.js
```

Expected: PASS with 12 rendered rows, full 10%–90% coverage, unchanged formula values, and no table.

- [ ] **Step 6: Commit the semantic mobile structure**

```powershell
git add index.html script.js tests/browser.test.js
git commit -m "refactor: build semantic mobile price list"
```

---

### Task 3: Make Entire Margin Rows Copyable and Keep Reverse Margin Secondary

**Files:**
- Modify: `script.js`
- Modify: `index.html`
- Test: `tests/browser.test.js`

**Interfaces:**
- Consumes: `copyPrice(button, text, statusElement)` and `calculateReverseMargin()`.
- Produces: `.price-action` buttons with `data-copied`, bottom `#copyStatus`, and collapsed native `#reverseDisclosure`.

- [ ] **Step 1: Write failing interaction tests**

Replace the old small-button copy test and add disclosure behavior:

```js
test('the entire margin row copies its CLP price with honest feedback', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');

  const firstAction = page.locator('.price-action').first();
  await firstAction.click();
  await page.waitForFunction(() => document.querySelector('#copyStatus')?.textContent === '已复制 15.000 CLP');
  assert.equal(await firstAction.getAttribute('data-copied'), 'true');
  assert.equal(await page.locator('#copyStatus').textContent(), '已复制 15.000 CLP');

  await firstAction.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#copyStatus').textContent(), '已复制 15.000 CLP');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.locator('.price-action').nth(1).click();
  await page.waitForFunction(() => document.querySelector('#copyStatus')?.textContent === '复制失败，请长按价格手动复制');
  assert.equal(await page.locator('.price-action').nth(1).getAttribute('data-copied'), 'false');
  await context.close();
});

test('reverse margin is collapsed by default and calculates after expansion', async () => {
  const { context, page } = await openPage();
  const disclosure = page.locator('#reverseDisclosure');
  assert.equal(await disclosure.getAttribute('open'), null);
  await disclosure.locator('summary').click();
  assert.notEqual(await disclosure.getAttribute('open'), null);
  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');
  await page.locator('#targetPriceInput').fill('16875');
  assert.equal(await page.locator('#reverseMargin').textContent(), '20.0%');
  assert.equal(await page.locator('#reverseProfitRmb').textContent(), '25.00');
  assert.equal(await page.locator('#reverseAssessment').textContent(), '常规');
  await context.close();
});
```

- [ ] **Step 2: Run interaction tests and verify RED**

Run:

```powershell
node --test --test-name-pattern "entire margin row|collapsed by default" tests/browser.test.js
```

Expected: FAIL because `.price-action`, the revised failure text, and `#reverseAssessment` are absent.

- [ ] **Step 3: Render each margin row as one button**

Implement a static inline-SVG copy icon helper and a copyable row:

```js
function createCopyIcon() {
  const icon = document.createElement('span');
  icon.className = 'copy-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><rect x="8" y="8" width="10" height="10" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg><span class="copy-check">✓</span>';
  return icon;
}

function appendMarginRow(label, values) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'price-row price-action';
  button.dataset.copied = 'false';
  const copyText = `${fmtClp.format(values.clp)} CLP`;
  button.setAttribute(
    'aria-label',
    `${label}，${copyText}，${fmtRmb.format(values.rmb)} RMB，点击复制`,
  );
  appendPriceText(button, label, values);
  button.append(createCopyIcon());
  button.addEventListener('click', () => copyPrice(button, copyText, elements.copyStatus));
  elements.priceList.append(button);
}
```

Update the failure message in `copyPrice()` to `复制失败，请长按价格手动复制`. The existing success timer continues to clear row and toast state after 1500 ms.

- [ ] **Step 4: Add non-color reverse assessment text**

Add this output next to the reverse percentage in `index.html`:

```html
<span id="reverseAssessment" class="margin-assessment"></span>
```

Set both semantic class and text in `render()`:

```js
const marginBand = reverse.marginPercent < 20
  ? { className: 'margin-low', label: '偏低' }
  : reverse.marginPercent > 40
    ? { className: 'margin-high', label: '较高' }
    : { className: 'margin-medium', label: '常规' };
elements.reverseMargin.className = marginBand.className;
elements.reverseAssessment.textContent = marginBand.label;
```

- [ ] **Step 5: Run interaction and accessibility tests**

Run:

```powershell
node --test --test-name-pattern "entire margin row|collapsed by default|WCAG" tests/browser.test.js
```

Expected: PASS; copy success, copy failure, keyboard activation, disclosure, result values, and accessible state remain correct.

- [ ] **Step 6: Commit the mobile interactions**

```powershell
git add index.html script.js tests/browser.test.js
git commit -m "feat: optimize mobile pricing interactions"
```

---

### Task 4: Apply the Apple System Visual Language and Responsive Rules

**Files:**
- Modify: `style.css`
- Test: `tests/browser.test.js`

**Interfaces:**
- Consumes: semantic classes from Tasks 2–3.
- Produces: CSS tokens and mobile layout for `.input-card`, `.cost-summary`, `.price-list`, `.price-row`, `.reverse-card`, and `#copyStatus`.

- [ ] **Step 1: Write responsive and semantic-color tests**

Add a helper and a viewport matrix:

```js
async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.document, dimensions.viewport);
}

test('the Apple-style layout remains touchable without horizontal overflow', async () => {
  for (const width of [320, 390, 430]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#rateInput').fill('195');
    await page.locator('#factoryPriceInput').fill('100');
    await assertNoHorizontalOverflow(page);

    const metrics = await page.locator('.price-action').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        background: style.backgroundColor,
      };
    });
    assert.ok(metrics.height >= 44);
    assert.equal(metrics.background, 'rgb(255, 255, 255)');
    await context.close();
  }
});
```

Add a color-semantics check that the landed row is not system red and that the action icon resolves to the system-blue token.

- [ ] **Step 2: Run the responsive test and verify RED**

Run:

```powershell
node --test --test-name-pattern "Apple-style layout" tests/browser.test.js
```

Expected: FAIL against the old table/card CSS or because the new list classes do not yet meet the asserted geometry and colors.

- [ ] **Step 3: Replace CSS tokens and foundational layout**

Define semantic tokens and mobile foundations at the top of `style.css`:

```css
:root {
  --bg-grouped: #f2f2f7;
  --surface: #ffffff;
  --surface-secondary: #f2f2f7;
  --label: #1c1c1e;
  --label-secondary: #6e6e73;
  --separator: rgba(60, 60, 67, 0.18);
  --interactive: #007aff;
  --interactive-pressed: #0062cc;
  --interactive-soft: #e9f3ff;
  --success: #248a3d;
  --danger: #d70015;
  --focus: rgba(0, 122, 255, 0.38);
  color-scheme: light;
}

body {
  min-height: 100vh;
  margin: 0;
  background: var(--bg-grouped);
  color: var(--label);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

.app-shell {
  display: grid;
  width: min(100% - 24px, 440px);
  margin: 0 auto;
  padding: max(20px, env(safe-area-inset-top)) 0 max(32px, env(safe-area-inset-bottom));
  gap: 16px;
}

.app-header h1 {
  margin: 0;
  font-size: clamp(30px, 9vw, 36px);
  line-height: 1;
  letter-spacing: -0.055em;
}
```

- [ ] **Step 4: Style inputs, sticky summary, list actions, toast, and disclosure**

Implement these required behavior-bearing rules, then complete spacing and typography around them:

```css
.input-card,
.price-list,
.reverse-card {
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.045);
}

.input-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.field input {
  width: 100%;
  min-width: 0;
  min-height: 50px;
  border: 2px solid transparent;
  border-radius: 13px;
  background: var(--surface-secondary);
  color: var(--label);
  font-size: 17px;
}

.cost-summary {
  position: sticky;
  top: max(8px, env(safe-area-inset-top));
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.price-row {
  display: grid;
  grid-template-columns: minmax(64px, auto) minmax(0, 1fr) 28px;
  align-items: center;
  width: 100%;
  min-height: 60px;
  padding: 9px 14px;
  border: 0;
  border-bottom: 1px solid var(--separator);
  background: var(--surface);
  color: var(--label);
  text-align: left;
}

.price-action:active,
.price-action[data-copied="true"] {
  background: var(--interactive-soft);
}

.row-amounts {
  display: grid;
  justify-items: end;
}

.row-amounts strong {
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

.row-amounts small {
  color: var(--label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

#copyStatus:not(:empty) {
  position: fixed;
  left: 50%;
  bottom: max(22px, env(safe-area-inset-bottom));
  z-index: 20;
  width: max-content;
  max-width: calc(100% - 32px);
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(28, 28, 30, 0.92);
  color: #fff;
  transform: translateX(-50%);
  backdrop-filter: blur(18px);
}

.reverse-card summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 12px 14px;
  cursor: pointer;
  list-style: none;
}
```

Add visible `:focus-visible`, copied-check, open-chevron, validation, 320 px adjustments, hover rules gated by `@media (hover: hover)`, and the existing reduced-motion override. Do not implement dark mode.

- [ ] **Step 5: Run the responsive, focus, and axe tests**

Run:

```powershell
node --test --test-name-pattern "Apple-style layout|keyboard focus|WCAG" tests/browser.test.js
```

Expected: PASS at 320, 390, and 430 px with no horizontal overflow, touch targets at least 44 px, visible focus, and no serious/critical WCAG A/AA violations.

- [ ] **Step 6: Run the full test suite**

```powershell
npm test
```

Expected: all calculation, state, real-browser, offline, and accessibility tests pass.

- [ ] **Step 7: Commit the visual system**

```powershell
git add style.css tests/browser.test.js
git commit -m "feat: apply mobile Apple-style visual system"
```

---

### Task 5: Refresh Offline Cache, Documentation, and Visual Evidence

**Files:**
- Modify: `sw.js`
- Modify: `README.md`
- Test: `tests/browser.test.js`

**Interfaces:**
- Consumes: the final static app shell.
- Produces: cache `price-tool-v5`, updated usage documentation, and final mobile screenshots.

- [ ] **Step 1: Update the PWA test first**

Change the expected cache name and entry lookup:

```js
assert.deepEqual(cacheState.cacheNames, ['price-tool-v5']);
assert.deepEqual(cacheState.entries['price-tool-v5'], [
  `${server.baseUrl}/`,
  `${server.baseUrl}/calculator.js`,
  `${server.baseUrl}/icon.png`,
  `${server.baseUrl}/index.html`,
  `${server.baseUrl}/manifest.json`,
  `${server.baseUrl}/script.js`,
  `${server.baseUrl}/style.css`,
].sort());
```

- [ ] **Step 2: Run the PWA test and verify RED**

Run:

```powershell
node --test --test-name-pattern "PWA activates" tests/browser.test.js
```

Expected: FAIL because production still creates `price-tool-v4`.

- [ ] **Step 3: Bump the cache version**

In `sw.js` change only:

```js
const CACHE_NAME = 'price-tool-v5';
```

The app-shell URL set remains unchanged unless implementation added a real static file. Preserve old-cache deletion, network-first fetch, and offline navigation fallback.

- [ ] **Step 4: Update usage documentation**

Update `README.md` to describe:

```text
- The ladder now includes 10%, 20%, 30%, 40%, 45%, 50%, 55%, 60%, 70%, 80%, and 90% gross-margin tiers.
- Tap anywhere on a margin row to copy its CLP price; RMB remains visible as reference.
- The landed-cost summary stays available while scrolling.
- Reverse margin is collapsed below the ladder and uses store sale price or marketplace net receipt as its input.
```

Keep the existing warning about consistent tax/revenue bases and simplified profit estimates.

- [ ] **Step 5: Run complete verification**

Run:

```powershell
npm test
node --check calculator.js
node --check script.js
node --check sw.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest.json: valid')"
git diff --check
git status --short --branch
```

Expected: zero test failures, valid syntax and manifest, no whitespace errors, and only intended tracked changes before the final commit.

- [ ] **Step 6: Capture and inspect final mobile states**

Use `tests/browser-helpers.js` to capture full-page PNG screenshots at widths 320, 390, and 430 after filling rate `195` and factory price `100`. Capture an additional 390 px screenshot after copying the 40% row and expanding reverse margin with target price `24380`.

Inspect every image for:

```text
- no horizontal clipping or nested scroll region
- all 10%–90% rows visible through natural page scrolling
- aligned CLP values with smaller RMB references
- sticky summary not obscuring content
- neutral landed-cost row
- copy success and reverse expanded states matching the approved mockups
```

- [ ] **Step 7: Commit PWA and documentation completion**

```powershell
git add sw.js README.md tests/browser.test.js
git commit -m "docs: finish mobile pricing redesign"
```

- [ ] **Step 8: Review the complete branch against the spec**

Run:

```powershell
git diff --check main..HEAD
git diff --stat main..HEAD
git log --oneline main..HEAD
```

Read the full diff and confirm each goal, non-goal, interaction, responsive rule, and test requirement from `docs/superpowers/specs/2026-09-03-mobile-apple-redesign-design.md` has direct implementation or test evidence before merging.
