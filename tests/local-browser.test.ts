import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));

test('local bridge isolates consent, endpoint validation, lease and owned-tab cleanup', async t => {
  async function run(args: string[], marker = '12345\n/devtools/browser/synthetic-browser-id\n', mode = 'ok', lock?: unknown) {
    const root = await mkdtemp(join(tmpdir(), 'cue-local-bridge-test-')); t.after(() => rm(root, { recursive: true, force: true }));
    const chrome = join(root, 'Library/Application Support/Google/Chrome'); await mkdir(chrome, { recursive: true }); await writeFile(join(chrome, 'DevToolsActivePort'), marker);
    if (lock) { await mkdir(join(root, '.cue')); await writeFile(join(root, '.cue/local-browser.lock'), JSON.stringify(lock)); }
    const child = spawn(process.execPath, ['--import', 'tsx', '--import', './tests/helpers/local-browser-preload.mjs', 'scripts/local-browser.ts', ...args], { cwd, env: { PATH: process.env.PATH, TMPDIR: tmpdir(), NODE_ENV: 'test', CUE_LOCAL_TEST_ROOT: root, CUE_LOCAL_TEST_MODE: mode }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.on('message', message => { if (message === 'new-page-pending') child.kill('SIGINT'); });
    let stdout = '', stderr = ''; child.stdout!.on('data', chunk => stdout += chunk); child.stderr!.on('data', chunk => stderr += chunk);
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
    assert.doesNotMatch(stdout + stderr, /synthetic-secret|private\.invalid|12345|devtools\/browser/);
    const calls = JSON.parse(await readFile(join(root, 'calls.json'), 'utf8')) as unknown[][];
    return { code, calls, stdout, root, result: JSON.parse(stdout) };
  }
  await t.test('missing consent and malformed endpoints never connect or create lease', async () => {
    const denied = await run(['probe']); assert.equal(denied.code, 2); assert.equal(denied.result.state, 'consent_required'); assert.deepEqual(denied.calls, []);
    for (const marker of ['0\n/devtools/browser/synthetic-id', '70000\n/devtools/browser/synthetic-id', '12345\nws://remote.invalid/private', '12345\n/devtools/browser/id?token=secret', '12345\n/devtools/browser/synthetic-id\nextra']) {
      const result = await run(['probe', '--confirm-profile-access'], marker); assert.equal(result.code, 1); assert.deepEqual(result.calls, []); await assert.rejects(access(join(result.root, '.cue/local-browser.lock')));
    }
  });
  await t.test('status only reads marker, active lease rejects before connection', async () => {
    const status = await run(['status']); assert.equal(status.code, 0); assert.equal(status.result.connected, false); assert.deepEqual(status.calls, []);
    const busy = await run(['probe', '--confirm-profile-access'], undefined, 'ok', { owner: 'other-owner', pid: process.pid, created_at: 0 }); assert.equal(busy.result.state, 'runner_busy'); assert.deepEqual(busy.calls, []); assert.match(await readFile(join(busy.root, '.cue/local-browser.lock'), 'utf8'), /other-owner/);
  });
  await t.test('success closes only owned blank page then disconnects and releases lease', async () => {
    const result = await run(['probe', '--confirm-profile-access']); assert.equal(result.code, 0); assert.equal(result.result.state, 'passed');
    assert.deepEqual(result.calls.map(call => call[0]), ['connect', 'newPage', 'newCDPSession', 'Target.getTargetInfo', 'detach', 'ownedPage.close', 'disconnect']);
    assert.equal(result.calls[0][1], 'ws://127.0.0.1:12345/devtools/browser/synthetic-browser-id'); assert.deepEqual(result.calls[0][2], { timeout: 20000, isLocal: true, noDefaults: true }); await assert.rejects(access(join(result.root, '.cue/local-browser.lock')));
  });
  await t.test('SIGINT interrupts stalled tab creation, disconnects and releases the lease', async () => {
    const result = await run(['probe', '--confirm-profile-access'], undefined, 'hang-new-page'); assert.equal(result.code, 1); assert.equal(result.result.state, 'interrupted'); assert.ok(result.calls.some(call => call[0] === 'disconnect')); await assert.rejects(access(join(result.root, '.cue/local-browser.lock')));
  });
  await t.test('failed native connection and wrong owned target are sanitized and release lease', async () => {
    for (const mode of ['denied', 'wrong-target']) {
      const result = await run(['probe', '--confirm-profile-access'], undefined, mode); assert.equal(result.code, 1); assert.equal(result.result.state, 'permission_or_connection_failed'); await assert.rejects(access(join(result.root, '.cue/local-browser.lock')));
      if (mode === 'wrong-target') assert.deepEqual(result.calls.slice(-2).map(call => call[0]), ['ownedPage.close', 'disconnect']);
    }
  });
});
