#!/usr/bin/env node
// Node.js runtime policy check (7.0.0). Read-only: never installs, never runs nvm.
// Acceptable = at/above policy minimum, major line not end-of-life, and no newer
// security release in the same major. Missing release data -> "unknown" (warn).
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const POLICY_PATH = path.join(here, '..', 'assets', 'node-policy.json');
export const FAILING = new Set(['below-minimum', 'end-of-life', 'vulnerable']);

export function loadPolicy(file = POLICY_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? '').trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw new Error(`INVALID_VERSION: ${!x ? a : b}`);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

const clean = (v) => `v${parseVersion(v).join('.')}`;
const majorOf = (v) => parseVersion(v)[0];

// releases: nodejs.org/dist/index.json rows ({version, security}); schedule:
// nodejs/Release schedule.json ({"v22": {end: "YYYY-MM-DD"}}). Either may be null.
export function evaluateVersion(version, {policy, releases = null, schedule = null, now = new Date()} = {}) {
  if (!parseVersion(version)) return {version, status: 'unknown', reason: 'unparseable version'};
  const current = clean(version);
  if (compareVersions(current, policy.minimum) < 0) {
    return {version: current, status: 'below-minimum', reason: `below policy minimum ${policy.minimum} (${policy.minimumReason})`};
  }
  const major = majorOf(current);
  const end = schedule?.[`v${major}`]?.end;
  if (end && new Date(`${end}T00:00:00Z`) < now) {
    return {version: current, status: 'end-of-life', reason: `Node ${major} reached end of life on ${end}`};
  }
  if (!Array.isArray(releases)) {
    return {version: current, status: 'unknown', reason: 'release data unavailable; minimum checked only'};
  }
  const line = releases.filter((r) => parseVersion(r.version) && majorOf(r.version) === major);
  const newerSecurity = line.filter((r) => r.security && compareVersions(r.version, current) > 0);
  const latest = line.map((r) => clean(r.version)).sort(compareVersions).at(-1) ?? current;
  if (newerSecurity.length) {
    const fixedIn = newerSecurity.map((r) => clean(r.version)).sort(compareVersions)[0];
    return {version: current, status: 'vulnerable', reason: `security release ${fixedIn} is newer`, fixedIn, latestInLine: latest};
  }
  return {version: current, status: 'ok', reason: 'supported line, no newer security release', latestInLine: latest};
}

// Read-only nvm discovery: nvm (NVM_DIR/versions/node/v*) and nvm-windows (NVM_HOME/v*).
export function listNvmVersions(env = process.env, readDir = (dir) => readdirSync(dir)) {
  const found = [];
  const scan = (dir, manager) => {
    try {
      for (const name of readDir(dir)) if (parseVersion(name)) found.push({version: clean(name), manager});
    } catch { /* not installed */ }
  };
  if (env.NVM_DIR) scan(path.join(env.NVM_DIR, 'versions', 'node'), 'nvm');
  if (env.NVM_HOME) scan(env.NVM_HOME, 'nvm-windows');
  return found;
}

export function checkRuntime({version = process.version, policy = loadPolicy(), releases = null, schedule = null, installed = [], now = new Date()} = {}) {
  const result = evaluateVersion(version, {policy, releases, schedule, now});
  const candidates = installed
    .map((item) => ({...item, ...evaluateVersion(item.version, {policy, releases, schedule, now})}))
    .filter((item) => item.status === 'ok' || (item.status === 'unknown' && parseVersion(item.version)))
    .sort((a, b) => compareVersions(b.version, a.version));
  const best = candidates[0];
  const newerInstalled = best && parseVersion(result.version) && compareVersions(best.version, result.version) > 0 ? best : null;
  const failing = FAILING.has(result.status);
  let repair = null;
  if (newerInstalled) repair = `nvm use ${newerInstalled.version.slice(1)}`;
  else if (failing) repair = result.fixedIn ? `install Node ${result.latestInLine} or newer (nvm install ${majorOf(result.version)})` : 'install the current LTS (nvm install --lts, or nvm install lts on nvm-windows)';
  return {...result, failing, minimum: policy.minimum, newerInstalled: newerInstalled?.version ?? null, repair};
}

async function fetchJson(url, timeoutMs) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(timeoutMs)});
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function fetchReleaseData(policy = loadPolicy()) {
  const [releases, schedule] = await Promise.all([
    fetchJson(policy.sources.releases, policy.fetchTimeoutMs),
    fetchJson(policy.sources.schedule, policy.fetchTimeoutMs),
  ]);
  return {releases: Array.isArray(releases) ? releases : null, schedule: schedule && typeof schedule === 'object' ? schedule : null};
}

async function main(argv) {
  const [action = 'check', ...rest] = argv;
  if (action !== 'check') throw new Error(`UNKNOWN_ACTION: ${action}`);
  const json = rest.includes('--json');
  const offline = rest.includes('--offline');
  const at = rest.indexOf('--version');
  const version = at >= 0 ? rest[at + 1] : process.version;
  const policy = loadPolicy();
  const data = offline ? {releases: null, schedule: null} : await fetchReleaseData(policy);
  const result = checkRuntime({version, policy, ...data, installed: listNvmVersions()});
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`Node ${result.version}: ${result.status} — ${result.reason}\n`);
    if (result.repair) process.stdout.write(`Repair: ${result.repair}\n`);
  }
  return result.failing ? 1 : 0;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
