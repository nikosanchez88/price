import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchBrowser, startStaticServer } from './browser-helpers.js';

const AXE_PATH = fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url));

let browser;
let server;

test.before(async () => {
  server = await startStaticServer();
  browser = await launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

async function openPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  return { context, page };
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.document, dimensions.viewport);
}

test('the application loads without third-party runtime requests', async () => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const externalRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== server.baseUrl) externalRequests.push(request.url());
  });

  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });

  assert.deepEqual(externalRequests, []);
  await context.close();
});

test('the rendered form contains only labeled controls from the simplified scope', async () => {
  const { context, page } = await openPage();

  assert.equal(await page.locator('#extraInput').count(), 0);
  assert.equal(await page.locator('#taxToggle').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /IVA|额外杂费|净利润/);
  assert.equal(await page.locator('label[for="rateInput"]').count(), 1);
  assert.equal(await page.locator('label[for="factoryPriceInput"]').count(), 1);
  assert.equal(await page.locator('label[for="targetPriceInput"]').count(), 1);
  assert.doesNotMatch(
    await page.locator('meta[name="viewport"]').getAttribute('content'),
    /user-scalable=no|maximum-scale=1/,
  );

  await context.close();
});

test('keyboard focus is visibly indicated on the first control', async () => {
  const { context, page } = await openPage();
  await page.keyboard.press('Tab');

  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return {
      currency: element.dataset.currency,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });

  assert.equal(focus.currency, 'RMB');
  assert.notEqual(focus.outlineStyle, 'none');
  assert.notEqual(focus.outlineWidth, '0px');
  await context.close();
});

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

test('RMB pricing and reverse margin use the simplified no-IVA formula', async () => {
  const { context, page } = await openPage();
  assert.equal(await page.locator('#factoryPriceInput').count(), 1);

  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');
  const rows = await page.locator('#priceList .price-row').allTextContents();
  assert.equal(rows.length, 12);
  assert.match(rows[2], /毛利 20%/);
  assert.match(rows[2], /16\.880/);
  assert.match(rows[2], /125\.04/);

  await page.locator('#reverseDisclosure summary').click();
  await page.locator('#targetPriceInput').fill('16875');
  assert.equal(await page.locator('#reverseMargin').textContent(), '20.0%');
  assert.equal(await page.locator('#reverseProfitRmb').textContent(), '25.00');
  await context.close();
});

test('CLP currency state changes the unit without rewriting the factory price', async () => {
  const { context, page } = await openPage();
  assert.equal(await page.locator('#factoryPriceInput').count(), 1);

  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('15000');
  await page.locator('button[data-currency="CLP"]').click();
  assert.equal(await page.locator('#factoryPriceInput').inputValue(), '15000');
  assert.equal(await page.locator('#factoryPriceLabel').textContent(), '出厂价（CLP）');
  assert.equal(await page.locator('button[data-currency="CLP"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('button[data-currency="RMB"]').getAttribute('aria-pressed'), 'false');
  assert.match((await page.locator('#priceList .price-row').nth(2).innerText()), /18\.750/);
  await context.close();
});

test('invalid values clear stale results and show field errors', async () => {
  const { context, page } = await openPage();
  assert.equal(await page.locator('#factoryPriceInput').count(), 1);

  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');
  assert.equal(await page.locator('#priceList .price-row').count(), 12);
  await page.locator('#rateInput').fill('-135');
  assert.equal(await page.locator('#priceList .price-row').count(), 0);
  assert.equal(await page.locator('#rateError').textContent(), '请输入大于 0 的有效数字');
  assert.equal(await page.locator('#rateInput').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#costSummary').isHidden(), true);
  await context.close();
});

test('a manually entered rate is restored until the user clears it', async () => {
  const { context, page } = await openPage();
  assert.equal(await page.locator('#factoryPriceInput').count(), 1);

  await page.locator('#rateInput').fill('136.25');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#rateInput').inputValue(), '136.25');
  await page.locator('#rateInput').fill('');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#rateInput').inputValue(), '');
  assert.equal(await page.locator('#costSummary').isHidden(), true);
  await context.close();
});

test('the entire margin row copies its CLP price with honest feedback', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#factoryPriceInput').count(), 1);

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
  assert.equal(await page.locator('#copyStatus').textContent(), '复制失败，请长按价格手动复制');
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
    assert.equal(
      await page.locator('.copy-icon').first().evaluate((element) => getComputedStyle(element).color),
      'rgb(0, 122, 255)',
    );
    assert.notEqual(
      await page.locator('.landed-row').evaluate((element) => getComputedStyle(element).color),
      'rgb(215, 0, 21)',
    );
    assert.equal(
      await page.locator('#costSummary').evaluate((element) => getComputedStyle(element).position),
      'sticky',
    );
    await context.close();
  }
});

test('PWA activates a local app-shell cache and reloads offline', async () => {
  const pwaBrowser = await launchBrowser();
  const context = await pwaBrowser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();

  try {
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    const serviceWorkerState = await page.evaluate(async () => {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error('Service Worker ready timeout')), 5000);
        }),
      ]);
      return {
        active: registration.active?.state,
        scriptUrl: registration.active?.scriptURL,
      };
    });
    assert.equal(serviceWorkerState.active, 'activated');
    assert.equal(serviceWorkerState.scriptUrl, `${server.baseUrl}/sw.js`);

    await page.reload({ waitUntil: 'networkidle' });
    const cacheState = await page.evaluate(async () => {
      const cacheNames = (await caches.keys()).filter((name) => name.startsWith('price-tool-'));
      const entries = {};
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        entries[name] = (await cache.keys()).map((request) => request.url).sort();
      }
      return { cacheNames, entries };
    });
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

    const manifest = await page.evaluate(() => fetch('./manifest.json').then((response) => response.json()));
    assert.equal(manifest.theme_color.toLowerCase(), '#f2f2f7');
    assert.deepEqual(manifest.icons, [
      { src: 'icon.png', sizes: '1024x1024', type: 'image/png' },
    ]);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('h1').textContent(), '定价');
    await page.locator('#rateInput').fill('135');
    await page.locator('#factoryPriceInput').fill('100');
    assert.match(await page.locator('#priceList .price-row').nth(2).innerText(), /16\.880/);
  } finally {
    await context.close();
    await pwaBrowser.close();
  }
});

test('the complete mobile view has no serious WCAG A or AA violations', async () => {
  const { context, page } = await openPage();
  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');
  await page.locator('#reverseDisclosure summary').click();
  await page.locator('#targetPriceInput').fill('16875');
  await page.addScriptTag({ path: AXE_PATH });

  const violations = await page.evaluate(async () => {
    const result = await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
    });
    return result.violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact))
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target),
      }));
  });

  assert.deepEqual(violations, []);
  await context.close();
});
