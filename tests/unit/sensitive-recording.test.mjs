import { initRepo } from '../helpers/git-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHarness } from '../helpers/harness.mjs';
import { redactText, redactValue, writeRecord } from '../../skills/agrimap-agent-skills/scripts/sensitive-recording.mjs';
import { createPromptVersion } from '../../skills/agrimap-agent-skills/scripts/agm-prompt-version.mjs';
import { createHash } from 'node:crypto';

test('redaction covers credentials, contact labels and structured values without masking normal facts', () => {
  const cases = [
    ['Password="synthetic value with spaces";Server=db', 'synthetic value with spaces'],
    ['รหัสผ่าน: synthetic thai secret\nnext line', 'synthetic thai secret'],
    ['https://user:synthetic-pass@host/path?token=synthetic-query&x=1', 'synthetic-query'],
    ['Authorization: Bearer synthetic-bearer\nCookie: session=synthetic-cookie', 'synthetic-cookie'],
    ['-----BEGIN PRIVATE KEY-----\nsynthetic-key\n-----END PRIVATE KEY-----', 'synthetic-key'],
    ['-----BEGIN OPENSSH PRIVATE KEY-----\nsynthetic-incomplete', 'synthetic-incomplete'],
    ['email: person@example.invalid\nphone: +66 81 234 5678\nเลขบัตรประชาชน=1234567890123', '1234567890123'],
    ['{"api_key":"synthetic\\\"quoted-value"}', 'quoted-value'],
    ['password=synthetic spaced password\nnext line', 'spaced password'],
    ['DB_PASSWORD="synthetic-db-secret"\nGITHUB_TOKEN=synthetic-env-token', 'synthetic-db-secret'],
    ['GITHUB_TOKEN=synthetic-env-token', 'synthetic-env-token'],
  ];
  for (const [input, secret] of cases) {
    const result = redactText(input);
    assert.ok(!result.includes(secret));
    assert.ok(result.includes('[REDACTED:'));
    assert.equal(redactText(result), result, 'markers must be stable across recording layers');
  }
  const normal = 'แก้ปัญหา indexing 3 min; version 4.5.3; token count: 42; commit abc123; requester orchex006';
  assert.equal(redactText(normal), normal);
  assert.deepEqual(redactValue({ request: { Password: 'synthetic', api_key: { nested: 'synthetic' } }, count: 3 }),
    { request: { Password: '[REDACTED:CREDENTIAL]', api_key: '[REDACTED:CREDENTIAL]' }, count: 3 });
});

test('Prompt Result hash matches redacted bytes and identical retry creates no extra version', async t => {
  const h = await createHarness('agm-private-prompt-'); t.after(() => h.cleanup());
  const body = ['## Main Assignment', '## Subagent Assignments', '## Acceptance Criteria', '## Deviation and Handoff Contract'].map(section => section + '\nKeep useful context.').join('\n\n') + '\npassword="synthetic-prompt-secret"\n';
  const options = { cwd: h.temp, conversationId: 'one', context: 'privacy', requester: 'Tester', provider: 'codex', model: 'test', body, sourceEvidence: 'password="synthetic-metadata-secret"' };
  const result = await createPromptVersion(options);
  const bytes = await readFile(path.join(h.temp, result.path));
  assert.ok(!bytes.toString().includes('synthetic-prompt-secret'));
  assert.ok(!bytes.toString().includes('synthetic-metadata-secret'));
  assert.ok(!JSON.stringify(result).includes('synthetic-metadata-secret'));
  const evidence = bytes.toString().split('\n').find(line => line.startsWith('source_evidence: '));
  assert.equal(JSON.parse(evidence.slice('source_evidence: '.length)), 'password="[REDACTED:CREDENTIAL]"');
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal((await createPromptVersion(options)).created, false);
  // Product files outside the recording directory are not silently transformed.
  const source = path.join(h.temp, 'example.txt');
  await writeRecord(source, 'password=synthetic-source-fixture', 'utf8');
  assert.equal(await readFile(source, 'utf8'), 'password=synthetic-source-fixture');
});

async function recordedFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await recordedFiles(file));
    else files.push(file);
  }
  return files;
}

test('hook and workspace never persist synthetic credentials, including before summary truncation', async t => {
  const h = await createHarness('agm-sensitive-'); t.after(() => h.cleanup());
  await initRepo(h.temp); // raw prompts are archived only inside a Git root
  const secret = 'ghp_' + 'A'.repeat(36);
  const password = 'SyntheticOnlyPassword987';
  const prompt = '$agm-exec fix logging password="' + password + '" token=' + secret;
  h.run(h.scripts.hook, ['--provider', 'codex'], { cwd: h.temp, session_id: 'safe', hook_event_name: 'UserPromptSubmit', prompt, prompt_id: '1' });
  h.run(h.scripts.hook, ['--provider', 'codex'], { cwd: h.temp, session_id: 'safe', hook_event_name: 'UserPromptSubmit', prompt, prompt_id: '1' });
  const started = h.run(h.scripts.workspace, ['start', '--operation', 'execute', '--session', 'safe', '--requested-by', 'Tester', '--persist', '--title', 'Repair password="' + password + '"']);
  assert.equal(started.ok, true);
  const checked = h.run(h.scripts.workspace, ['checkpoint', '--session', 'safe', '--execution', started.activeTask.executionId, '--event', 'changed', '--files', 'example.txt', '--summary', 'x'.repeat(220) + ' token=' + secret, '--reason', 'password="' + password + '"', '--verification', 'Authorization: Bearer ' + secret]);
  assert.equal(checked.ok, true);
  const files = await recordedFiles(path.join(h.temp, '.agrimap-agent'));
  // 5.0.10: raw prompt history is no longer recorded.
  assert.ok(!files.some(file => file.endsWith('history.md')));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.ok(!text.includes(password) && !text.includes(secret) && !text.includes('ghp_AAAAA'), 'private content leaked in ' + path.relative(h.temp, file));
    if (file.endsWith('.json')) JSON.parse(text);
    if (file.endsWith('.jsonl')) for (const line of text.trim().split('\n').filter(Boolean)) JSON.parse(line);
    if (file.endsWith('history.md')) {
      assert.ok(text.includes('[REDACTED:'));
      assert.equal(text.split('### [').length - 1, 1);
    }
  }
});
