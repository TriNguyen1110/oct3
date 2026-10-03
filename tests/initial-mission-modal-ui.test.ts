import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { createPreview } from '../src/client/preview';

const base = process.env.OCT3_INITIAL_UI_URL;
test('initial mission loading respects user dialogs while preserving deep links and sign-in defaults', { skip: !base }, async t => {
  const origin = new URL(base!); assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname));
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }); t.after(() => browser.close());
  for (const scenario of ['late-latest', 'task-deep-link', 'signed-out-deep-link', 'empty-sign-in'] as const) await t.test(scenario, async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const mission = createPreview(); mission.mission_id = '12345678-1234-4234-8234-123456789abc'; mission.objective = 'Synthetic delayed mission has loaded';
    const task = mission.tasks[0]; task.id = `${mission.mission_id}:amazon`; if (task.proposal) task.proposal.task_id = task.id;
    let signedIn = !['signed-out-deep-link', 'empty-sign-in'].includes(scenario), authPosts = 0, missionReads = 0;
    const writes: string[] = [], errors: string[] = []; let release!: () => void, sawMission!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; }), requested = new Promise<void>(resolve => { sawMission = resolve; });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()); if (url.origin !== origin.origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let body: unknown = {};
      if (url.pathname === '/api/auth') {
        if (request.method() === 'POST') { signedIn = true; authPosts++; }
        body = { authenticated: signedIn, role: signedIn ? 'manager' : undefined };
      } else {
        if (request.method() !== 'GET') writes.push(`${request.method()} ${url.pathname}`);
        if (url.pathname.startsWith('/api/missions')) {
          missionReads++; sawMission(); if (scenario === 'late-latest') await delayed;
          body = url.pathname === '/api/missions' ? { mission: scenario === 'empty-sign-in' ? null : mission, missions: scenario === 'empty-sign-in' ? [] : [mission] } : mission;
        } else if (url.pathname === '/api/readiness') body = { services: [] };
        else if (url.pathname === '/api/preferences') body = { preferences: null };
        else if (url.pathname === '/api/passkeys') body = { enrolled: false, required: true };
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.addInitScript(`window.micCanary={prompts:0,stops:0};Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{window.micCanary.prompts++;return{getTracks:()=>[{stop:()=>window.micCanary.stops++}]}}});window.MediaRecorder=class{static isTypeSupported(){return true}state='inactive';mimeType='audio/wav';start(){this.state='recording'}stop(){this.state='inactive';queueMicrotask(()=>this.onstop?.())}};`);
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    const linked = scenario === 'task-deep-link' || scenario === 'signed-out-deep-link';
    await page.goto(origin.href + (linked ? `?mission=${mission.mission_id}&task=${encodeURIComponent(task.id)}&revision=1` : ''));
    if (scenario === 'late-latest') {
      await requested; await page.getByText('Workspace access', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'New mission', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'What needs doing?' });
      await dialog.getByRole('button', { name: 'Record a brief', exact: true }).click(); await dialog.getByRole('button', { name: 'Stop & draft' }).waitFor();
      release(); await page.getByText(mission.objective, { exact: true }).waitFor({ state: 'attached' });
      assert.equal(await dialog.isVisible(), true); assert.equal(await dialog.getByRole('button', { name: 'Stop & draft' }).isVisible(), true);
      assert.deepEqual(await page.evaluate(() => (window as any).micCanary), { prompts: 1, stops: 0 });
      await dialog.getByRole('button', { name: 'Close dialog' }).click(); assert.equal(await page.evaluate(() => (window as any).micCanary.stops), 1);
    } else if (scenario === 'task-deep-link') {
      const dialog = page.getByRole('dialog'); await dialog.waitFor(); assert.equal(await dialog.count(), 1); await dialog.getByText(task.proposal!.title, { exact: true }).waitFor(); assert.ok(missionReads > 0);
    } else {
      if (scenario === 'empty-sign-in') await page.getByRole('button', { name: 'New mission', exact: true }).click();
      const auth = page.getByRole('dialog', { name: 'Connect your workspace' }); await auth.waitFor(); assert.equal(missionReads, 0);
      if (scenario === 'empty-sign-in') { await auth.getByLabel('Manager access key').fill('synthetic-ui-only'); await auth.getByRole('button', { name: 'Connect workspace', exact: true }).click(); await page.getByRole('dialog', { name: 'What needs doing?' }).waitFor(); assert.equal(authPosts, 1); }
    }
    assert.deepEqual(writes, []); assert.deepEqual(errors, []); release(); await context.close();
  });
});
