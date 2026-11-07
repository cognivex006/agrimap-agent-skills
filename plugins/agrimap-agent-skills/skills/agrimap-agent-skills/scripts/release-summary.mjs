#!/usr/bin/env node
// Release result envelope + deterministic renderer (6.2.0). The same envelope
// renders byte-identical text on every host and model, so the final release
// answer is never composed free-form. The Leader prints `render` output verbatim
// and may add a short narrative after it. Timing comes from release-timing.mjs.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { redactText } from './sensitive-recording.mjs';
import { timingOutput } from './release-timing.mjs';

export const SCHEMA_VERSION = 1;
export const OUTCOMES = ['success', 'partial', 'blocked', 'failed', 'paused'];
export const STEP_STATUSES = ['done', 'skipped', 'failed', 'blocked', 'pending', 'not-run'];
export const SECTIONS = ['Operation', 'Target', 'Versions', 'Execution steps', 'Evidence', 'Publication', 'Timing', 'Remaining', 'Outcome'];

const UNKNOWN = 'UNKNOWN';
// Credentials embedded in URLs (https://user:token@host) are always masked.
const clean = value => redactText(String(value)).replace(/:\/\/[^/\s:@]+:[^/\s@]+@/g, '://***@').replace(/[\r\n]+/g, ' ').trim();
const text = value => (value === undefined || value === null || value === '' ? UNKNOWN : clean(value));
const cell = value => text(value).replace(/\|/g, '\\|');

export function validateEnvelope(env) {
  const errors = [];
  if (!env || typeof env !== 'object') return ['envelope must be an object'];
  if (env.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!env.operation) errors.push('operation is required');
  if (!OUTCOMES.includes(env.outcome)) errors.push(`outcome must be one of ${OUTCOMES.join('|')}`);
  for (const [index, step] of (env.steps || []).entries()) {
    if (!step?.name) errors.push(`steps[${index}].name is required`);
    if (!STEP_STATUSES.includes(step?.status)) errors.push(`steps[${index}].status must be one of ${STEP_STATUSES.join('|')}`);
  }
  if (env.outcome === 'success') {
    if ((env.steps || []).some(step => ['failed', 'blocked', 'pending'].includes(step.status))) errors.push('success cannot have failed, blocked or pending steps');
    if ((env.blocked || []).length) errors.push('success cannot list blocked items');
  }
  return errors;
}

const list = items => (items?.length ? items.map(item => `- ${text(item)}`) : ['- None']);

export function renderEnvelope(env, timingBlock) {
  const errors = validateEnvelope(env);
  if (errors.length) throw new Error(`Invalid release envelope: ${errors.join('; ')}`);
  const v = env.versions || {};
  const steps = env.steps || [];
  const pub = env.publication || {};
  const out = [];
  const section = (title, lines) => out.push(`## ${title}`, '', ...lines, '');

  section('Operation', [`- Command: ${text(env.operation)}${env.mode ? ` (${clean(env.mode)})` : ''}`]);
  section('Target', [`- Project: ${text(env.target?.project)}`, `- Branch: ${text(env.target?.branch)}`, `- Environment: ${text(env.target?.environment)}`]);
  section('Versions', [`- Before: ${text(v.before)}`, `- After: ${text(v.after)}`, `- Candidate SHA: ${text(v.candidateSha)}`]);
  section('Execution steps', steps.length
    ? ['| # | Step | Status | Detail |', '| --- | --- | --- | --- |', ...steps.map((step, i) => `| ${i + 1} | ${cell(step.name)} | ${step.status} | ${step.detail ? cell(step.detail) : '-'} |`)]
    : ['- No steps recorded']);
  section('Evidence', (env.evidence || []).length
    ? env.evidence.map(item => `- ${text(item.command)} → exit ${item.exitCode ?? UNKNOWN}${item.path ? ` (${clean(item.path)})` : ''}`)
    : ['- None recorded']);
  section('Publication', [
    `- Pushed: ${pub.pushed === true ? 'yes' : pub.pushed === false ? 'no' : UNKNOWN}`,
    `- Refs: ${(pub.refs || []).length ? pub.refs.map(clean).join(', ') : 'none'}`,
    `- Tag: ${pub.tag ? clean(pub.tag) : 'none'}`,
  ]);
  section('Timing', String(timingBlock || '').trim().split('\n'));
  section('Remaining', [...list(env.pending), ...((env.blocked || []).length ? ['', 'Blocked:', ...list(env.blocked)] : [])]);
  section('Outcome', [`- ${env.outcome.toUpperCase()}`, `- Next action: ${env.nextAction ? clean(env.nextAction) : 'none'}`]);
  return `${out.join('\n').trimEnd()}\n`;
}

export async function renderFile(envelopePath, { timing = null } = {}) {
  const env = JSON.parse(await readFile(envelopePath, 'utf8'));
  const block = (await timingOutput(timing, timing ? '' : 'No timing state was passed to the renderer.')).finalOutput;
  return renderEnvelope(env, block);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [action, file, ...rest] = process.argv.slice(2);
  const timingIndex = rest.indexOf('--timing');
  const timing = timingIndex >= 0 ? rest[timingIndex + 1] : null;
  if (action !== 'render' || !file) {
    process.stderr.write('Usage: release-summary.mjs render <envelope.json> [--timing <state.json>]\n');
    process.exitCode = 1;
  } else {
    renderFile(file, { timing }).then(output => process.stdout.write(output))
      .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  }
}
