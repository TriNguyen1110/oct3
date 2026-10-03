import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { validateVoiceAudio } from '../src/server/voice';
const base = process.env.OCT3_VOICE_UI_URL;
test('voice UI synthetic microphone: real conversion, explicit apply, lifecycle cancellation and caps', { skip: !base }, async t => {
  assert.equal(new URL(base!).origin, 'http://localhost:3003');
  const audio = await readFile(new URL('./fixtures/voice-brief.wav', import.meta.url));
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext(); t.after(() => context.close());
  let mode = 'ok', voiceCalls = 0; const unexpected: string[] = [], errors: string[] = [], converted: number[] = [];
  const draft = { transcript: 'Synthetic boba request.', objective: 'Find a synthetic boba pickup option.', purchase_budget_minor: null, food: null, notes: [], model: 'gemini-3.8-flash', draft_only: true };
  await context.route('**/*', async route => {
    const r = route.request(), url = new URL(r.url()); if (url.origin !== new URL(base!).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/voice/draft') {
      voiceCalls++; const body = new Response(new Uint8Array(r.postDataBuffer()!), { headers: { 'content-type': r.headers()['content-type'] } });
      const form = await body.formData(); converted.push(validateVoiceAudio(new Uint8Array(await (form.get('audio') as File).arrayBuffer())));
      if (mode === 'wait') return;
      return route.fulfill({ status: mode === 'failure' ? 502 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'failure' ? { error: { message: 'Synthetic provider unavailable. No mission was sent.' } } : draft) });
    }
    if (r.method() !== 'GET') unexpected.push(`${r.method()} ${url.pathname}`);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname === '/api/auth' ? { authenticated: true } : url.pathname === '/api/readiness' ? { services: [] } : { mission: null, missions: [] }) });
  });
  await context.addInitScript('window.__name = (target) => target;');
  await context.addInitScript(({ encoded }) => {
    const s = window as any; s.voiceTest = { mode: 'normal', prompts: 0, tracksStopped: 0, recorderStops: 0 };
    const state = s.voiceTest;
    const stream = () => ({ getTracks: () => [{ stop: () => state.tracksStopped++ }] });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { state.prompts++; if (state.mode === 'late') return await new Promise(resolve => { state.resolve = () => resolve(stream()); }); return stream(); } });
    class SyntheticRecorder {
      static isTypeSupported() { return true; }
      state = 'inactive'; mimeType = 'audio/wav'; ondataavailable: any; onstop: any; onerror: any;
      start() { this.state = 'recording'; }
      stop() { if (this.state === 'inactive') return; this.state = 'inactive'; state.recorderStops++; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: 'audio/wav' }) }); this.onstop?.(); }); }
    }
    s.MediaRecorder = SyntheticRecorder;
  }, { encoded: audio.toString('base64') });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base!); await page.getByText('Workspace access', { exact: true }).waitFor(); await page.getByRole('button', { name: 'New mission', exact: true }).first().click();
  let dialog = page.getByRole('dialog', { name: 'What needs doing?' });
  const stats = () => page.evaluate(() => { const s = (window as any).voiceTest; return { prompts: s.prompts, tracksStopped: s.tracksStopped, recorderStops: s.recorderStops }; });
  await t.test('no automatic microphone; synthetic PCM passes actual browser conversion; explicit Use changes only intended fields', async () => {
    assert.equal((await stats()).prompts, 0);
    const before = await dialog.locator('input').evaluateAll(elements => elements.map(e => ({ type: (e as HTMLInputElement).type, value: (e as HTMLInputElement).value, checked: (e as HTMLInputElement).checked })));
    const objective = await dialog.locator('textarea').first().inputValue();
    await dialog.getByRole('button', { name: 'Record a brief', exact: true }).click(); await dialog.getByRole('button', { name: 'Stop & draft' }).click();
    await dialog.getByRole('button', { name: 'Use this draft' }).waitFor(); assert.equal(await dialog.locator('textarea').first().inputValue(), objective);
    await dialog.getByRole('button', { name: 'Use this draft' }).click(); assert.equal(await dialog.locator('textarea').first().inputValue(), draft.objective);
    assert.deepEqual(await dialog.locator('input').evaluateAll(elements => elements.map(e => ({ type: (e as HTMLInputElement).type, value: (e as HTMLInputElement).value, checked: (e as HTMLInputElement).checked }))), before);
    assert.equal(voiceCalls, 1); assert.ok(converted[0] > 4.8 && converted[0] < 4.9); assert.ok((await stats()).tracksStopped > 0); assert.deepEqual(unexpected, []);
    await dialog.getByRole('button', { name: 'Discard voice draft' }).click();
  });
  await t.test('late permission after cancellation immediately stops tracks and sends no audio', async () => {
    await page.evaluate(() => { (window as any).voiceTest.mode = 'late'; }); const before = await stats();
    await dialog.getByRole('button', { name: 'Record a brief', exact: true }).click(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.evaluate(() => (window as any).voiceTest.resolve());
    assert.equal((await stats()).tracksStopped, before.tracksStopped + 1); assert.equal(voiceCalls, 1);
    await page.evaluate(() => { (window as any).voiceTest.mode = 'normal'; });
  });
  await t.test('20 second cap stops recording; provider failure restores editable form', async () => {
    mode = 'failure'; await page.clock.install(); await dialog.getByRole('button', { name: 'Record a brief', exact: true }).click(); await page.clock.fastForward(20001);
    await dialog.getByRole('alert').filter({ hasText: 'Synthetic provider unavailable' }).waitFor(); assert.equal(voiceCalls, 2); assert.equal(await dialog.getByRole('button', { name: 'Start example mission' }).isEnabled(), true);
  });
  await t.test('35 second timeout recovers form; unmount stops microphone without uploading', async () => {
    mode = 'wait'; await dialog.getByRole('button', { name: 'Record again', exact: true }).click(); await dialog.getByRole('button', { name: 'Stop & draft' }).click();
    await page.waitForFunction(() => document.querySelector('.voice-status')?.textContent?.includes('Microphone is off'));
    await page.waitForTimeout(100); await page.clock.fastForward(35001); await dialog.getByRole('alert').filter({ hasText: 'timed out' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Start example mission' }).isEnabled(), true);
    await dialog.getByRole('button', { name: 'Record again', exact: true }).click(); const before = await stats(), callsBefore = voiceCalls;
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click(); assert.ok((await stats()).tracksStopped > before.tracksStopped); assert.equal(voiceCalls, callsBefore);
  });
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
});
