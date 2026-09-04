import test from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, startStaticServer } from './browser-helpers.js';

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

test('keyboard focus is visibly indicated on inputs', async () => {
  const { context, page } = await openPage();
  await page.keyboard.press('Tab');

  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return {
      id: element.id,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });

  assert.equal(focus.id, 'rateInput');
  assert.notEqual(focus.outlineStyle, 'none');
  assert.notEqual(focus.outlineWidth, '0px');
  await context.close();
});

test('RMB pricing and reverse margin use the simplified no-IVA formula', async () => {
  const { context, page } = await openPage();
  assert.equal(await page.locator('#factoryPriceInput').count(), 1);

  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');
  const rows = await page.locator('#priceRows tr').allTextContents();
  assert.equal(rows.length, 11);
  assert.match(rows[1], /毛利 20%/);
  assert.match(rows[1], /16\.880/);
  assert.match(rows[1], /125\.04/);

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
  assert.match((await page.locator('#priceRows tr').nth(1).innerText()), /18\.750/);
  await context.close();
});

test('invalid values clear stale results and show field errors', async () => {
  const { context, page } = await openPage();
  assert.equal(await page.locator('#factoryPriceInput').count(), 1);

  await page.locator('#rateInput').fill('135');
  await page.locator('#factoryPriceInput').fill('100');
  assert.equal(await page.locator('#priceRows tr').count(), 11);
  await page.locator('#rateInput').fill('-135');
  assert.equal(await page.locator('#priceRows tr').count(), 0);
  assert.equal(await page.locator('#rateError').textContent(), '请输入大于 0 的有效数字');
  assert.equal(await page.locator('#rateInput').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#exchangeHint').textContent(), '当前汇率：未设置');
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
  assert.equal(await page.locator('#exchangeHint').textContent(), '当前汇率：未设置');
  await context.close();
});

test('copy buttons report clipboard success and failure honestly', async () => {
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
  await page.locator('.copy-button').first().click();
  await page.waitForFunction(() => document.querySelector('#copyStatus')?.textContent === '已复制 16.880 CLP');
  assert.equal(await page.locator('#copyStatus').textContent(), '已复制 16.880 CLP');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.locator('.copy-button').nth(1).click();
  await page.waitForFunction(() => document.querySelector('#copyStatus')?.textContent === '复制失败，请手动复制');
  assert.equal(await page.locator('#copyStatus').textContent(), '复制失败，请手动复制');
  await context.close();
});
