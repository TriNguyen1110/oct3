import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { restrictFoodToReadOnly } from '../src/browser/doordash';

test('food network guard allows reads but blocks browser writes, WebSockets and service-worker interception', async t => {
  const received: Array<{ method: string; path: string }> = []; let upgrades = 0;
  const server = createServer((request, response) => {
    received.push({ method: request.method!, path: request.url! });
    if (request.url === '/sw.js') {
      response.writeHead(200, { 'content-type': 'application/javascript', 'service-worker-allowed': '/' });
      return response.end(`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/sw-check')e.respondWith(new Response('intercepted-by-worker'));});`);
    }
    response.writeHead(200, { 'content-type': request.url === '/' ? 'text/html' : 'text/plain' }); response.end(request.url === '/' ? '<!doctype html><title>Local food guard canary</title>' : 'server-read');
  });
  server.on('upgrade', (_request, socket) => { upgrades++; socket.destroy(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext(); const page = await context.newPage(); await page.goto(origin);
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  assert.equal(await page.evaluate(() => fetch('/sw-check').then(r => r.text())), 'intercepted-by-worker');
  await restrictFoodToReadOnly(page); await page.goto(origin); received.length = 0;
  await t.test('GET HEAD OPTIONS reach server and installed service worker is bypassed after guarded navigation', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(await page.evaluate(method => fetch('/read', { method }).then(r => r.status), method), 200);
    assert.equal(await page.evaluate(() => fetch('/sw-check').then(r => r.text())), 'server-read');
    for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.ok(received.some(r => r.method === method && r.path === '/read'));
    assert.ok(received.some(r => r.path === '/sw-check'));
  });
  await t.test('POST PATCH DELETE PUT and sendBeacon never reach the local server', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      assert.equal(await page.evaluate(method => fetch('/write', { method, body: 'synthetic' }).then(() => 'unexpected-success', () => 'blocked'), method), 'blocked');
    }
    await page.evaluate(() => navigator.sendBeacon('/beacon', 'synthetic'));
    // A completed allowed request provides a round-trip after queued beacon dispatch.
    await page.evaluate(() => fetch('/after-beacon'));
    assert.equal(received.some(r => !['GET', 'HEAD', 'OPTIONS'].includes(r.method)), false);
    assert.equal(received.some(r => r.path === '/write' || r.path === '/beacon'), false);
  });
  await t.test('WebSocket is closed without a server upgrade', async () => {
    const state = await page.evaluate(url => new Promise<string>(resolve => {
      const socket = new WebSocket(url); const timer = setTimeout(() => { socket.close(); resolve('timed-out'); }, 3000);
      socket.onclose = () => { clearTimeout(timer); resolve('closed'); }; socket.onerror = () => { clearTimeout(timer); resolve('blocked'); }; socket.onopen = () => { clearTimeout(timer); resolve('opened'); socket.close(); };
    }), origin.replace('http:', 'ws:') + '/socket');
    assert.ok(['closed', 'blocked'].includes(state), state); assert.equal(upgrades, 0);
  });
  await context.close(); assert.equal(received.some(r => !['GET', 'HEAD', 'OPTIONS'].includes(r.method)), false);
});
