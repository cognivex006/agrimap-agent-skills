#!/usr/bin/env node
// AgriMap Release Description notification (managed by AgriMap bootstrap; local edits are replaced).
// Sends the AI-written, plain-language Release Description to the agrimap-notify service
// (POST /release-description), which posts a simple card to Microsoft Teams. The Jenkins
// build card (POST /release) is a separate notification owned by each Jenkinsfile.
// Requires Node >= 18. No dependencies.
//
//   node tools/agrimap/release-notify.mjs check
//   node tools/agrimap/release-notify.mjs set-url <https://.../agrimap-notify/release-description>
//   node tools/agrimap/release-notify.mjs generate --version <x.y.z> [--from <ref>] [--to <ref>] [--project-name <name>] [--out <file.md>]
//   node tools/agrimap/release-notify.mjs send --description <file.md> [--environment Production] [--preview]
//
// Description file: "# <project name> / <version>", then one "- " bullet per change. A bullet
// ending with "(เกี่ยวข้อง: a, b)" lists the other projects that change affects.
// generate writes that file deterministically from the team commit headers "feature:|fix: <ไทย> (x.y.z)"
// between the previous v* tag and --to, so every project gets the same format. Related projects come
// from "เกี่ยวข้อง:"/"Related:" body lines and from AgriMap.* NuGet / @agrimap/* package changes.
// URL: --url, else env NOTIFY_WEBHOOK_URL (process, then Windows user env or shell profile).
// Health: env NOTIFY_HEALTH_URL, else the same base with /healthz as the last path segment.
// Exit: 0 ok, 1 usage, 2 NOTIFY_WEBHOOK_URL_MISSING, 3 health failed, 4 post failed.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ENV = 'NOTIFY_WEBHOOK_URL';
const PROFILE_FILES = ['.profile', '.bashrc', '.zshrc'];
const ENVIRONMENTS = new Set(['Inhouse', 'Production']);
const COMMANDS = new Set(['git', 'reg', 'setx']);
const LIMITS = { name: 200, text: 500, items: 50, related: 20 };
const RELATED_LABELS = ['เกี่ยวข้อง', 'ส่วนนี้มาจาก', 'related'];

// Only explicit installation locations are eligible; never search inherited PATH or cwd.
export function commandPath(command) {
  if (!COMMANDS.has(command)) throw new Error('Unsupported command');
  let candidates = [];
  if (process.platform === 'win32') {
    candidates = command === 'git'
      ? [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], String.raw`C:\Program Files`,
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
        .filter(Boolean).map(root => path.join(root, 'Git', 'cmd', 'git.exe'))
      : [path.join(process.env.SystemRoot || String.raw`C:\Windows`, 'System32', `${command}.exe`)];
  } else if (command === 'git') {
    candidates = ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'];
  }
  const executable = candidates.find(file => path.isAbsolute(file) && existsSync(file));
  if (!executable) throw new Error(`Trusted executable not found: ${command}`);
  return executable;
}

export function itemText(subject) {
  const prefix = /^(?:feature|feat|fix)/iu.exec(subject);
  if (!prefix) return null;
  let rest = subject.slice(prefix[0].length).trimStart();
  if (rest.startsWith('(')) {
    const close = rest.indexOf(')');
    if (close < 0) return null;
    rest = rest.slice(close + 1).trimStart();
  }
  if (rest.startsWith('!')) rest = rest.slice(1);
  if (!rest.startsWith(':')) return null;
  return rest.slice(1).trim() || null;
}

// Scan candidate opening parentheses once; the suffix cannot contain a closing parenthesis.
function suffixStart(text, matches) {
  if (!text.endsWith(')')) return -1;
  const end = text.length - 1;
  const start = text.lastIndexOf(')', end - 1) + 1;
  for (let i = start; i < end; i++) {
    if (text[i] === '(' && matches(text, i + 1, end)) return i;
  }
  return -1;
}

export function stripVersion(value) {
  const text = value.trimEnd();
  const index = suffixStart(text, (source, start, end) => {
    let i = start;
    if (source[i] === 'v') i++;
    for (let part = 0; part < 3; part++) {
      const first = i;
      while (i < end && source[i] >= '0' && source[i] <= '9') i++;
      if (i === first) return false;
      if (part < 2 && source[i++] !== '.') return false;
    }
    return i === end || source[i] === '-' || source[i] === '+';
  });
  return index < 0 ? value : text.slice(0, index).trimEnd();
}

export function splitRelated(value) {
  const text = value.trimEnd();
  let contentStart = -1;
  const index = suffixStart(text, (source, start, end) => {
    const label = RELATED_LABELS.find(name => source.slice(start, start + name.length).toLowerCase() === name);
    if (!label) return false;
    let i = start + label.length;
    while (i < end && /\s/u.test(source[i])) i++;
    if (source[i] === ':') i++;
    while (i < end && /\s/u.test(source[i])) i++;
    contentStart = i;
    return i < end;
  });
  return index < 0 ? { text: value, related: null }
    : { text: text.slice(0, index).trimEnd(), related: text.slice(contentStart, -1) };
}

function trailerText(line) {
  const text = line.trim();
  const prefix = /^(?:เกี่ยวข้อง|project ที่เกี่ยวข้อง|related)\s*:/iu.exec(text);
  return prefix ? text.slice(prefix[0].length).trim() || null : null;
}

export function bulletText(line) {
  const text = line.trim();
  const prefix = /^(?:[-*]|\d+\.)\s/u.exec(text);
  return prefix ? text.slice(prefix[0].length).trim() || null : null;
}

const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const fail = (code, exit, extra = {}) => { print({ ok: false, code, ...extra }); process.exit(exit); };
const clip = (value, max) => String(value).trim().slice(0, max);

export function args(argv) {
  const out = { _: [] };
  const tokens = argv[Symbol.iterator]();
  let current = tokens.next();
  while (!current.done) {
    const token = current.value;
    current = tokens.next();
    if (!token.startsWith('--')) { out._.push(token); continue; }
    const key = token.slice(2);
    if (current.done || current.value.startsWith('--')) out[key] = true;
    else { out[key] = current.value; current = tokens.next(); }
  }
  return out;
}

function validUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url : null; }
  catch { return null; }
}

function persistedUrl() {
  if (process.platform === 'win32') {
    try {
      const text = execFileSync(commandPath('reg'), ['query', String.raw`HKCU\Environment`, '/v', ENV], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const match = new RegExp(String.raw`${ENV}[ \t]+REG_\w+[ \t]+(\S.*)`).exec(text);
      if (match) return { url: match[1].trim(), source: 'windows-user-env' };
    } catch { /* not set */ }
    return null;
  }
  for (const name of PROFILE_FILES) {
    const file = path.join(os.homedir(), name);
    if (!existsSync(file)) continue;
    // [ \t] instead of \s keeps the multiline anchor from spanning lines (S5852).
    const match = new RegExp(String.raw`^[ \t]*export[ \t]+${ENV}=["']?([^"'\s]+)`, 'm').exec(readFileSync(file, 'utf8'));
    if (match) return { url: match[1], source: `~/${name}` };
  }
  return null;
}

function resolveUrl(options) {
  if (options.url) return { url: options.url, source: '--url' };
  if (process.env[ENV]) return { url: process.env[ENV], source: 'process-env' };
  return persistedUrl();
}

function healthUrl(postUrl) {
  if (process.env.NOTIFY_HEALTH_URL) return process.env.NOTIFY_HEALTH_URL;
  const url = new URL(postUrl);
  url.pathname = url.pathname.replace(/\/[^/]*\/?$/, '') + '/healthz';
  url.search = '';
  return url.toString();
}

async function checkHealth(url) {
  const target = healthUrl(url);
  try {
    const response = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(15000) });
    const body = (await response.text()).slice(0, 300);
    return { ok: response.ok, healthUrl: target, status: response.status, body };
  } catch (error) {
    return { ok: false, healthUrl: target, status: null, body: String(error?.cause?.code || error?.message || error) };
  }
}

// A machine that never set the URL gets a ready question for the host's question tool (4.9.9).
const STANDARD_URL = 'https://appserv2.cdg.co.th/agrimap-notify/release-description';
const missingUrlQuestion = {
  header: 'Notify URL',
  question: 'เครื่องนี้ยังไม่ได้ตั้ง URL แจ้งเตือน Release Description จะใช้ URL ไหน',
  options: [
    { label: 'ใช้ URL มาตรฐาน (แนะนำ)', description: STANDARD_URL, command: `node tools/agrimap/release-notify.mjs set-url ${STANDARD_URL}` },
    { label: 'ระบุ URL อื่น', description: 'URL ที่ลงท้ายด้วย /agrimap-notify/release-description', command: 'node tools/agrimap/release-notify.mjs set-url <url>' },
    { label: 'ข้ามการแจ้งเตือนรอบนี้', description: 'release ยังสำเร็จ รายงาน notify เป็น skipped', command: null },
  ],
};

function requireUrl(options) {
  const resolved = resolveUrl(options);
  if (!resolved) fail('NOTIFY_WEBHOOK_URL_MISSING', 2, { next: 'Ask question with the host question tool (not plain text), run the chosen set-url command, then send again', question: missingUrlQuestion });
  if (!validUrl(resolved.url)) fail('NOTIFY_WEBHOOK_URL_INVALID', 1, { source: resolved.source });
  return resolved;
}

function setUrl(value) {
  const url = validUrl(value);
  if (!url) fail('NOTIFY_WEBHOOK_URL_INVALID', 1, { next: 'Pass an http(s) URL such as https://<host>/agrimap-notify/release-description' });
  if (process.platform === 'win32') {
    execFileSync(commandPath('setx'), [ENV, url.toString()], { stdio: 'ignore' });
    print({ ok: true, saved: 'windows-user-env', url: url.toString(), note: 'New terminals see it; this script also reads it directly.' });
    return;
  }
  const file = path.join(os.homedir(), '.profile');
  const line = `export ${ENV}="${url.toString()}"`;
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const pattern = new RegExp(String.raw`^[ \t]*export[ \t]+${ENV}=.*$`, 'm');
  writeFileSync(file, pattern.test(text) ? text.replace(pattern, line) : text.replace(/\n?$/, '\n') + line + '\n');
  print({ ok: true, saved: '~/.profile', url: url.toString() });
}

const git = (...argv) => execFileSync(commandPath('git'), argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
const splitNames = value => value.split(/[,、]/).map(name => clip(name, LIMITS.name)).filter(Boolean);

// A dependency the commit changed: AgriMap.Platform.Logging -> AgriMap.Platform, @agrimap/auth-client stays.
function dependencyProjects(sha) {
  let diff = '';
  try { diff = git('show', '--format=', '-U0', sha, '--', '*.csproj', '*.props', '*.targets', 'package.json', '*/package.json'); }
  catch { return []; }
  const names = new Set();
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const nuget = /Include="(AgriMap\.\w+)(?:\.[\w.]+)?"/.exec(line);
    if (nuget) names.add(nuget[1]);
    const npm = /"(@agrimap\/[\w.-]+)"\s*:/i.exec(line);
    if (npm) names.add(npm[1]);
  }
  return [...names];
}

function repoName() {
  try {
    const remote = git('remote', 'get-url', 'origin').trim();
    const name = remote.replace(/\.git$/, '').split(/[/:\\]/).pop();
    if (name) return name;
  } catch { /* no remote */ }
  try { return path.basename(git('rev-parse', '--show-toplevel').trim()); } catch { return path.basename(process.cwd()); }
}

function previousTag(to) {
  try { return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', `${to}^`).trim(); } catch { return ''; }
}

function readReleaseLog(range) {
  try { return git('log', '--no-merges', '--reverse', '--format=%H%x1f%s%x1f%b%x1e', range); }
  catch { fail('GIT_RANGE_INVALID', 1, { range }); }
}

function addDescriptionRecord(items, record) {
  const [sha, subject, body = ''] = record.replace(/^\s+/, '').split('\x1f');
  const header = subject ? itemText(subject) : null;
  if (!sha || !header) return;
  const parsed = splitRelated(stripVersion(header));
  const text = clip(parsed.text, LIMITS.text);
  if (!text) return;
  const related = new Set(items.get(text) || []);
  if (parsed.related) splitNames(parsed.related).forEach(name => related.add(name));
  for (const line of body.split(/\r?\n/)) {
    const trailer = trailerText(line);
    if (trailer) splitNames(trailer).forEach(name => related.add(name));
  }
  dependencyProjects(sha).forEach(name => related.add(name));
  items.set(text, [...related]);
}

function collectDescriptionItems(log) {
  const items = new Map();
  for (const record of log.split('\x1e')) addDescriptionRecord(items, record);
  return items;
}

function descriptionBullet([text, related], projectName) {
  const own = related.filter(name => name !== projectName).slice(0, LIMITS.related);
  const suffix = own.length ? ` (เกี่ยวข้อง: ${own.join(', ')})` : '';
  return `- ${text}${suffix}`;
}

function optionValue(value) {
  return value && value !== true ? value : null;
}

export function generateDescription(options) {
  const version = String(options.version || '').replace(/^v/, '').trim();
  if (!version || version === 'true') fail('RELEASE_VERSION_MISSING', 1, { next: 'Pass --version <Production version>' });
  const to = optionValue(options.to) || 'HEAD';
  const from = optionValue(options.from) || previousTag(to);
  const range = from ? `${from}..${to}` : to;
  const items = collectDescriptionItems(readReleaseLog(range));
  const projectName = clip(optionValue(options['project-name']) || repoName(), LIMITS.name);
  const bullets = [...items].slice(0, LIMITS.items).map(item => descriptionBullet(item, projectName));
  const lines = [`# ${projectName} / ${version}`, ...bullets];
  return { projectName, version, range, items: lines.length - 1, markdown: lines.join('\n') + '\n' };
}

function generate(options) {
  const result = generateDescription(options);
  if (!result.items) fail('RELEASE_DESCRIPTION_EMPTY', 1, { range: result.range, next: 'No feature:/fix: commit in range; check --from/--to or the commit headers' });
  if (options.out && options.out !== true) writeFileSync(options.out, result.markdown, 'utf8');
  print({ ok: true, file: options.out && options.out !== true ? options.out : null, ...result });
}

// "# Project / Version" (or plain) first line, then "- " / "* " / "1. " bullets.
function parseDescription(file) {
  const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const heading = lines.find(line => line.trim());
  const title = String(heading || '').replace(/^#+\s*/, '').replaceAll('**', '').trim();
  const [projectName, version] = title.includes(' / ') ? title.split(' / ').map(part => part.trim()) : [title, ''];
  const bullets = [];
  for (const line of lines) {
    const bullet = bulletText(line);
    const trailer = !bullet && bullets.length ? trailerText(line) : null;
    if (bullet) bullets.push(bullet);
    else if (trailer) bullets[bullets.length - 1] += ` (เกี่ยวข้อง: ${trailer})`;
  }
  const items = bullets.map(text => {
    const parsed = splitRelated(text);
    const relatedProjects = parsed.related ? splitNames(parsed.related).slice(0, LIMITS.related) : [];
    return { text: clip(parsed.text, LIMITS.text), relatedProjects };
  }).filter(item => item.text);
  return { projectName, version, items };
}

function buildPayload(options) {
  const description = parseDescription(options.description);
  const projectName = clip(options['project-name'] || description.projectName, LIMITS.name);
  const version = clip(options.version || description.version, LIMITS.name);
  if (!projectName) fail('PROJECT_NAME_MISSING', 1, { next: 'Start the description with "# <project> / <version>" or pass --project-name' });
  if (!version) fail('RELEASE_VERSION_MISSING', 1, { next: 'Start the description with "# <project> / <version>" or pass --version' });
  if (!description.items.length) fail('RELEASE_DESCRIPTION_EMPTY', 1, { next: 'List each change as a "- " bullet' });
  const environment = options.environment || null;
  if (environment && !ENVIRONMENTS.has(environment)) fail('ENVIRONMENT_INVALID', 1, { allowed: [...ENVIRONMENTS] });
  return { projectName, version, ...(environment ? { environment } : {}), items: description.items.slice(0, LIMITS.items) };
}

async function send(options) {
  if (!options.description || options.description === true) fail('DESCRIPTION_REQUIRED', 1, { next: 'Pass --description <file.md>' });
  if (!existsSync(options.description)) fail('DESCRIPTION_NOT_FOUND', 1, { file: options.description });
  const payload = buildPayload(options);
  if (options.preview) { print({ ok: true, preview: true, payload }); return; }
  const { url, source } = requireUrl(options);
  const health = await checkHealth(url);
  if (!health.ok) fail('NOTIFY_HEALTH_FAILED', 3, { url, source, health, sent: false });
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
    const body = (await response.text()).slice(0, 1000);
    if (!response.ok) fail('NOTIFY_POST_FAILED', 4, { url, status: response.status, body, sent: false });
    print({ ok: true, sent: true, url, source, status: response.status, body, projectName: payload.projectName, version: payload.version, items: payload.items.length });
  } catch (error) {
    fail('NOTIFY_POST_FAILED', 4, { url, error: String(error?.cause?.code || error?.message || error), sent: 'unknown' });
  }
}

async function main() {
  const options = args(process.argv.slice(2));
  const command = options._[0] || 'help';
  if (command === 'check') {
    const { url, source } = requireUrl(options);
    const health = await checkHealth(url);
    print({ ok: health.ok, url, source, health });
    process.exit(health.ok ? 0 : 3);
  } else if (command === 'set-url') {
    setUrl(options._[1]);
  } else if (command === 'generate') {
    generate(options);
  } else if (command === 'send') {
    await send(options);
  } else {
    print({ ok: command === 'help', usage: ['check', 'set-url <url>', 'generate --version <x.y.z> [--from <ref>] [--to <ref>] [--project-name <name>] [--out <file.md>]', 'send --description <file.md> [--environment Inhouse|Production] [--project-name <name>] [--version <x.y.z>] [--preview]'] });
    process.exit(command === 'help' ? 0 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
