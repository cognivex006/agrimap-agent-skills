import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderEnvelope, validateEnvelope, SECTIONS } from '../../skills/agrimap-agent-skills/scripts/release-summary.mjs';
import { transition } from '../../skills/agrimap-agent-skills/scripts/release-timing.mjs';

const TIMING = 'Release timing: MEASURED\nElapsed: 2m 0.000s\nActive: 1m 30.000s\nWaiting: 0m 30.000s\nUnmeasured: 0m 0.000s\n\n| Step | Active time |\n| --- | --- |\n| preflight | 1m 30.000s |';

const success = {
  schemaVersion: 1, operation: 'agm-release pipeline inhouse', mode: 'standard', outcome: 'success',
  target: { project: 'agmws-plus', branch: 'develop', environment: 'inhouse' },
  versions: { before: '1.4.2', after: '1.4.3', candidateSha: 'abc1234' },
  steps: [{ name: 'preflight', status: 'done' }, { name: 'commit-push-inhouse', status: 'done', detail: 'develop → jenkins' }],
  evidence: [{ command: 'git push origin develop', exitCode: 0 }],
  publication: { pushed: true, refs: ['origin/develop'], tag: null },
  pending: [], blocked: [], nextAction: null,
};

const GOLDEN = `## Operation

- Command: agm-release pipeline inhouse (standard)

## Target

- Project: agmws-plus
- Branch: develop
- Environment: inhouse

## Versions

- Before: 1.4.2
- After: 1.4.3
- Candidate SHA: abc1234

## Execution steps

| # | Step | Status | Detail |
| --- | --- | --- | --- |
| 1 | preflight | done | - |
| 2 | commit-push-inhouse | done | develop → jenkins |

## Evidence

- git push origin develop → exit 0

## Publication

- Pushed: yes
- Refs: origin/develop
- Tag: none

## Timing

${TIMING}

## Remaining

- None

## Outcome

- SUCCESS
- Next action: none
`;

test('success envelope renders the golden snapshot byte-for-byte, every time', () => {
  assert.equal(renderEnvelope(success, TIMING), GOLDEN);
  assert.equal(renderEnvelope(structuredClone(success), TIMING), renderEnvelope(success, TIMING));
  const headings = [...GOLDEN.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  assert.deepEqual(headings, SECTIONS);
});

test('partial and blocked runs show real statuses, UNKNOWN fields and remaining work', () => {
  const blocked = { ...success, outcome: 'blocked', versions: { before: '1.4.2' },
    steps: [{ name: 'preflight', status: 'done' }, { name: 'verification', status: 'blocked', detail: 'dotnet SDK missing' }, { name: 'commit-push-inhouse', status: 'not-run' }],
    publication: { pushed: false }, blocked: ['verification: dotnet SDK 8 not installed'], pending: ['commit-push-inhouse'], nextAction: 'Install the SDK, then resume' };
  const out = renderEnvelope(blocked, 'Release timing: UNAVAILABLE\nElapsed: UNKNOWN');
  assert.match(out, /- After: UNKNOWN/);
  assert.match(out, /\| 2 \| verification \| blocked \| dotnet SDK missing \|/);
  assert.match(out, /- Pushed: no/);
  assert.match(out, /Blocked:\n- verification: dotnet SDK 8 not installed/);
  assert.match(out, /- BLOCKED\n- Next action: Install the SDK, then resume/);
  assert.match(out, /Elapsed: UNKNOWN/);
});

test('success cannot hide failed steps or blocked items; bad enums are rejected', () => {
  assert.ok(validateEnvelope({ ...success, steps: [{ name: 'tag', status: 'failed' }] }).some(e => /success cannot/.test(e)));
  assert.ok(validateEnvelope({ ...success, blocked: ['x'] }).some(e => /success cannot/.test(e)));
  assert.ok(validateEnvelope({ ...success, outcome: 'great' }).length);
  assert.ok(validateEnvelope({ ...success, steps: [{ name: 'x', status: 'ok' }] }).length);
  assert.throws(() => renderEnvelope({ ...success, schemaVersion: 2 }, TIMING), /schemaVersion/);
});

test('credentials in refs, details and evidence are masked', () => {
  const out = renderEnvelope({ ...success,
    evidence: [{ command: 'git push https://bot:ghp_abcdefghijklmnopqrstuvwxyz123456@github.com/x/y.git', exitCode: 0 }],
    steps: [{ name: 'auth', status: 'done', detail: 'Bearer eyJabc.def.ghi' }] }, TIMING);
  assert.doesNotMatch(out, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(out, /bot:/);
  assert.doesNotMatch(out, /eyJabc\.def\.ghi/);
});

test('CLI renders with the real timing block, or an UNAVAILABLE block without one', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agm-summary-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = path.join(dir, 'env.json');
  await writeFile(env, JSON.stringify(success));
  let state = transition(null, 'start', 'readiness', 0);
  state = transition(state, 'step', 'preflight', 1000);
  state = transition(state, 'finish', '', 61000);
  const timing = path.join(dir, 'timing.json');
  await writeFile(timing, JSON.stringify(state));
  const cli = (...args) => spawnSync(process.execPath, ['skills/agrimap-agent-skills/scripts/release-summary.mjs', ...args], { encoding: 'utf8' });
  const measured = cli('render', env, '--timing', timing);
  assert.equal(measured.status, 0);
  assert.match(measured.stdout, /Release timing: MEASURED\nElapsed: 1m 1.000s/);
  assert.equal(cli('render', env, '--timing', timing).stdout, measured.stdout);
  const none = cli('render', env);
  assert.equal(none.status, 0);
  assert.match(none.stdout, /Release timing: UNAVAILABLE[\s\S]*Reason: No timing state was passed/);
  assert.equal(cli('bogus').status, 1);
});
