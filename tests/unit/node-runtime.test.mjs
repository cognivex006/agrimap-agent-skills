// 7.0 Node runtime policy: fixture release data only, no network.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {checkRuntime, compareVersions, evaluateVersion, listNvmVersions, loadPolicy} from '../../skills/agrimap-agent-skills/scripts/node-runtime.mjs';

const policy = loadPolicy();
const now = new Date('2026-11-16T00:00:00Z');
const releases = [
  {version: 'v26.13.1', security: true}, {version: 'v26.13.0', security: false}, {version: 'v26.12.0', security: true},
  {version: 'v24.11.0', security: false}, {version: 'v24.10.2', security: true},
  {version: 'v22.23.0', security: false}, {version: 'v22.22.0', security: true}, {version: 'v22.18.0', security: false},
  {version: 'v20.19.0', security: true},
];
const schedule = {v20: {end: '2026-04-30'}, v22: {end: '2027-04-30'}, v24: {end: '2028-04-30'}, v26: {end: '2029-04-30'}};
const data = {policy, releases, schedule, now};

test('policy has a minimum and no exact pin; engines and .nvmrc follow it', () => {
  assert.equal(policy.minimum, '22.18.0');
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).engines.node, `>=${policy.minimum}`);
  assert.equal(readFileSync('.nvmrc', 'utf8').trim(), 'lts/*');
});

test('versions compare numerically', () => {
  assert.equal(compareVersions('v22.9.0', '22.18.0'), -1);
  assert.equal(compareVersions('26.13.1', 'v26.13.0'), 1);
  assert.equal(compareVersions('v24.0.0', '24.0.0'), 0);
});

test('ok: latest security release of a supported line, newer majors allowed', () => {
  assert.equal(evaluateVersion('v22.23.0', data).status, 'ok');
  assert.equal(evaluateVersion('v24.11.0', data).status, 'ok');
  assert.equal(evaluateVersion('v26.13.1', data).status, 'ok');
});

test('vulnerable: a newer security release exists in the same line', () => {
  const r = evaluateVersion('v26.13.0', data);
  assert.equal(r.status, 'vulnerable');
  assert.equal(r.fixedIn, 'v26.13.1');
  assert.equal(evaluateVersion('v22.18.0', data).fixedIn, 'v22.22.0');
});

test('below-minimum and end-of-life fail', () => {
  assert.equal(evaluateVersion('v22.17.1', data).status, 'below-minimum');
  assert.equal(evaluateVersion('v20.19.0', data).status, 'below-minimum');
  const eol = evaluateVersion('v22.23.0', {...data, now: new Date('2027-05-01T00:00:00Z')});
  assert.equal(eol.status, 'end-of-life');
});

test('unknown when release data is unavailable: warns, minimum still enforced', () => {
  const offline = {policy, releases: null, schedule: null, now};
  assert.equal(evaluateVersion('v26.13.0', offline).status, 'unknown');
  assert.equal(checkRuntime({version: 'v26.13.0', ...offline}).failing, false);
  assert.equal(checkRuntime({version: 'v20.0.0', ...offline}).failing, true);
});

test('nvm discovery is read-only and covers nvm and nvm-windows layouts', () => {
  const dirs = {
    [path.join('/home/u/.nvm', 'versions', 'node')]: ['v22.23.0', 'v26.13.1', 'not-a-version'],
    'C:\\nvm': ['v24.11.0', 'v20.19.0', 'settings.txt'],
  };
  const read = (dir) => { if (!dirs[dir]) throw new Error('ENOENT'); return dirs[dir]; };
  assert.deepEqual(listNvmVersions({NVM_DIR: '/home/u/.nvm'}, read).map((v) => v.version), ['v22.23.0', 'v26.13.1']);
  assert.deepEqual(listNvmVersions({NVM_HOME: 'C:\\nvm'}, read).map((v) => [v.version, v.manager]), [['v24.11.0', 'nvm-windows'], ['v20.19.0', 'nvm-windows']]);
  assert.deepEqual(listNvmVersions({}, read), []);
});

test('prefers the newest acceptable installed version and suggests nvm use', () => {
  const installed = [{version: 'v22.23.0', manager: 'nvm'}, {version: 'v26.13.1', manager: 'nvm'}, {version: 'v26.12.0', manager: 'nvm'}];
  const vulnerable = checkRuntime({version: 'v26.13.0', installed, ...data});
  assert.equal(vulnerable.failing, true);
  assert.equal(vulnerable.newerInstalled, 'v26.13.1');
  assert.equal(vulnerable.repair, 'nvm use 26.13.1');
  const okButOlder = checkRuntime({version: 'v22.23.0', installed, ...data});
  assert.equal(okButOlder.failing, false);
  assert.equal(okButOlder.repair, 'nvm use 26.13.1', 'newer acceptable installed version is suggested, not required');
  const none = checkRuntime({version: 'v20.0.0', installed: [], ...data});
  assert.match(none.repair, /nvm install --lts/);
});
