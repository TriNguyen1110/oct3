import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { researchDoorDash } from '../src/browser/doordash';

test('food preparation requires selected store proof and verified modifier state without adding to cart', async t => {
  for (const [key, value] of Object.entries({ SURFSKY_API_KEY: 'synthetic-provider', SURFSKY_API_BASE_URL: 'https://food.synthetic.surfsky.io' })) {
    const previous = process.env[key]; process.env[key] = value; t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  t.mock.method(globalThis, 'fetch', async (resource: string | URL | Request) => {
    const url = new URL(resource instanceof Request ? resource.url : resource); assert.equal(url.hostname, 'food.synthetic.surfsky.io');
    if (url.pathname === '/profiles') return Response.json([{ uuid: 'synthetic-profile', title: 'oct3-food', status: 'stopped' }]);
    if (url.pathname.endsWith('/start')) return Response.json({ success: true, internal_uuid: 'synthetic-session', ws_url: 'wss://food.synthetic.surfsky.io/cdp' });
    assert.ok(url.pathname.endsWith('/stop')); return Response.json({ success: true });
  });
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }); t.after(() => browser.close());
  for (const variant of ['no-finder', 'wrong-address', 'valid'] as const) await t.test(variant, async () => {
    const context = await browser.newContext(); let cartClicks = 0;
    const html = `<!doctype html><body>${variant === 'no-finder' ? '<div>Boba Guys Potrero</div>' : `<input placeholder="Search by city, state, or ZIP"><label><input type="radio" name="store"><span>Boba Guys Potrero</span><span>${variant === 'wrong-address' ? '999 Other St' : '1002 16th St, San Francisco, CA 94107'}</span></label><button>Confirm location</button>`}<button>Classic Black</button>${['16oz ICED', 'Boba', 'Organic Half + Half (Clover)', '50% (recommended)'].map((label, index) => `<label><input type="checkbox" name="modifier${index}"><span>${label}</span></label>`).join('')}<button onclick="window.canaryAdd()">Add to order $6.60</button></body>`;
    t.mock.method(chromium, 'connectOverCDP', async () => ({ contexts: () => [{ newPage: async () => {
      const page = await context.newPage(); await page.exposeFunction('canaryAdd', () => { cartClicks++; });
      await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
      return page;
    } }], close: async () => {} }));
    const result = await researchDoorDash({ task_id: 'synthetic-food', lane: 'food', requirements: { query: 'boba milk tea', fulfillment: 'pickup', location: '580 20th Street, San Francisco', quantity: 1 }, deadline: '2026-10-04', budget_minor: 1000, attempt_key: `synthetic-${variant}`, timeout_ms: 15000 });
    assert.equal(result.cleanup, 'confirmed'); assert.equal(cartClicks, 0);
    if (variant === 'valid') { assert.equal(result.options.length, 1, result.blocker); assert.equal(result.options[0].amount_minor, 660); assert.equal(result.blocker_code, 'checkout_handoff'); assert.match(result.blocker!, /not implemented/); }
    else { assert.equal(result.options.length, 0, 'Unverified store must not produce a quoted option'); assert.equal(result.blocker_code, 'merchant_changed'); assert.equal(result.evidence.some(e => /exact Boba Guys Potrero address and selected radio state/.test(e.detail)), false); }
    await context.close();
  });
});
