import { mock } from 'node:test';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const root = process.env.CUE_LOCAL_TEST_ROOT;
if (!root || !root.startsWith(os.tmpdir())) throw new Error('Synthetic root required');
mock.method(os, 'homedir', () => root); mock.method(os, 'platform', () => 'darwin'); syncBuiltinESMExports();
const calls = [];
let keepalive;
process.on('exit', () => writeFileSync(join(root, 'calls.json'), JSON.stringify(calls)));
const mode = process.env.CUE_LOCAL_TEST_MODE;
const page = { close: async options => { calls.push(['ownedPage.close', options]); } };
const context = {
  newPage: async () => { calls.push(['newPage']); if (mode === 'hang-new-page') { keepalive = setInterval(() => {}, 1000); process.send?.('new-page-pending'); return new Promise(() => {}); } return page; },
  newCDPSession: async target => { if (target !== page) throw new Error('Unowned page'); calls.push(['newCDPSession']); return { send: async command => { calls.push([command]); return { targetInfo: { targetId: 'synthetic-owned-id', type: 'page', url: mode === 'wrong-target' ? 'https://private.invalid/synthetic' : 'about:blank' } }; }, detach: async () => { calls.push(['detach']); } }; },
};
mock.method(chromium, 'connectOverCDP', async (endpoint, options) => {
  calls.push(['connect', endpoint, options]);
  if (mode === 'denied') throw new Error('synthetic-secret-private-endpoint');
  return { contexts: () => [context], close: async () => { calls.push(['disconnect']); clearInterval(keepalive); } };
});
