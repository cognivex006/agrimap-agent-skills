#!/usr/bin/env node
// Source-maintainer tool. Never distributed with runtime packages.
import {readFile, readdir, lstat, mkdir, mkdtemp, copyFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const hosts = ['codex', 'claude', 'antigravity'];
const canonical = 'skills/agrimap-agent-skills';
const plugin = 'plugins/agrimap-agent-skills';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const git = (root, ...args) => execFileSync('git', ['-c', `safe.directory=${path.resolve(root).replaceAll('\\','/')}`, ...args], {cwd:root, encoding:'utf8'}).trim();

// Owner-authorized reissue on the NEW repository (2026-10-20). The old
// repository/local tag is preserved, never repointed. No general tag override.
export const migration502 = {
  previousRepository:'orchex006/agrimap-agent-skills',
  previousSourceSha:'2447be9bdbaf31d7c17b2e07c8718d5f8d4a42d7',
  repository:'cognivex006/agrimap-agent-skills',
};
export function assertMigration502(version, runGit) {
  if (version !== '5.0.2' || runGit('rev-parse','v5.0.2^{commit}') !== migration502.previousSourceSha) throw new Error('RELEASE_MIGRATION_FORBIDDEN');
  for (const args of [['remote','get-url','--all','origin'], ['remote','get-url','--push','--all','origin']]) {
    if (!new RegExp(`^https://github\\.com/${migration502.repository}(?:\\.git)?$`).test(runGit(...args))) throw new Error('RELEASE_MIGRATION_REMOTE_FORBIDDEN');
  }
  return {...migration502, reason:'Owner-authorized 5.0.2 reissue with repository migration and local publication; differs from the previous repository release.'};
}

export function releaseDecision({version, expectedVersion, ref, dirty, tagExists}) {
  // Deliberately narrow publication syntax; general package SemVer support remains unchanged.
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/.exec(version || '');
  if (!match || expectedVersion !== version) throw new Error('RELEASE_VERSION_MISMATCH');
  const prerelease = version.includes('-rc.');
  if (ref !== (prerelease ? `release/${version.split('-')[0]}` : 'main')) throw new Error('RELEASE_BRANCH_FORBIDDEN');
  if (dirty) throw new Error('RELEASE_DIRTY_SOURCE');
  if (tagExists) throw new Error('RELEASE_VERSION_ALREADY_EXISTS');
  return {tag:`v${version}`, prerelease};
}

export function assertRuntimeFile(relative, bytes) {
  const normalized = relative.replaceAll('\\','/').toLowerCase();
  const parts = normalized.split('/');
  const name = parts.at(-1);
  const bootstrap = [canonical, `${plugin}/${canonical}`].some(prefix => normalized === `${prefix}/assets/bootstrap/${name}`);
  if (parts.some(p => ['.git', '.github', '.agrimap-agent', 'node_modules'].includes(p))
      || ['development.md', 'contributing.md'].includes(name)
      || (['agents.md', 'claude.md', 'gemini.md', 'cursor.md'].includes(name) && !bootstrap)
      || bytes.includes(Buffer.from('AGM-MAINTAINER-ONLY'))) {
    throw new Error(`MAINTAINER_INSTRUCTION_LEAK: ${relative}`);
  }
}

async function walk(root, relative) {
  const absolute = path.join(root, relative);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) throw new Error(`DISTRIBUTION_SYMLINK: ${relative}`);
  if (info.isFile()) return [relative.replaceAll('\\','/')];
  if (!info.isDirectory()) throw new Error(`DISTRIBUTION_SPECIAL_FILE: ${relative}`);
  const result = [];
  for (const entry of (await readdir(absolute)).sort()) result.push(...await walk(root, path.join(relative, entry)));
  return result;
}

export async function runtimePlan(root, host) {
  if (!hosts.includes(host)) throw new Error('DISTRIBUTION_HOST_INVALID');
  const distribution = await json(path.join(root, 'config/distribution.json'));
  const ops = await json(path.join(root, 'config/operations.json'));
  const entries = [];
  async function add(source, target = source) {
    for (const relative of [source, target]) {
      if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('UNSAFE_DISTRIBUTION_PATH');
    }
    let cursor = root;
    for (const part of source.split('/')) {
      cursor = path.join(cursor, part);
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`DISTRIBUTION_SYMLINK: ${source}`);
    }
    for (const file of await walk(root, source)) {
      const suffix = path.relative(path.join(root, source), path.join(root, file)).replaceAll('\\','/');
      entries.push({source:file, target:suffix ? `${target}/${suffix}` : target});
    }
  }
  const payload = host === 'antigravity' ? '' : `${plugin}/`;
  for (const name of ['README.md', 'CHANGELOG.md']) await add(name, payload + name);
  for (const name of distribution.userDocuments) {
    if (!/^[A-Z0-9.-]+\.md$/.test(name) || ['AGENTS.md','DEVELOPMENT.md'].includes(name)) throw new Error('UNSAFE_DOCUMENT_ALLOWLIST');
    await add(`docs/${name}`, `${payload}docs/${name}`);
  }
  await add('examples', `${payload}examples`);
  await add(canonical, `${payload}${canonical}`);
  if (host === 'antigravity') {
    await add('plugin.json');
    for (const op of ops.operations) await add(`skills/${op.name}.md`);
  } else {
    const manifest = host === 'codex' ? '.codex-plugin' : '.claude-plugin';
    await add(`${plugin}/${manifest}/plugin.json`);
    await add(`${plugin}/hooks/${host}-hooks.json`);
    await add(host === 'codex' ? '.agents/plugins/marketplace.json' : '.claude-plugin/marketplace.json');
    for (const op of ops.operations) await add(`${plugin}/skills/${op.name}`);
  }
  const targets = new Set();
  for (const entry of entries) {
    if (targets.has(entry.target)) throw new Error('DUPLICATE_DISTRIBUTION_TARGET');
    targets.add(entry.target);
    assertRuntimeFile(entry.target, await readFile(path.join(root, entry.source)));
  }
  return entries;
}

export async function buildRelease(root, {publication = false, expectedVersion, ref, migrate502 = false} = {}) {
  root = path.resolve(root);
  const pkg = await json(path.join(root, 'package.json'));
  if (pkg.name !== 'agrimap-agent-skills') throw new Error('PACKAGE_SOURCE_REQUIRED');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/.test(pkg.version)) throw new Error('PACKAGE_VERSION_INVALID');
  const sourceSha = git(root, 'rev-parse', 'HEAD');
  const sourceDirty = Boolean(git(root, 'status', '--porcelain', '--untracked-files=all'));
  const sourceRef = ref || git(root, 'branch', '--show-current');
  const tag = `v${pkg.version}`;
  if (migrate502 && !publication) throw new Error('RELEASE_MIGRATION_REQUIRES_PUBLICATION_BUILD');
  const migration = migrate502 ? assertMigration502(pkg.version, (...args)=>git(root,...args)) : null;
  if (publication) {
    // A local legacy tag is allowed only for the pinned owner-authorized
    // new-repository reissue. Remote tag creation still fails atomically.
    releaseDecision({version:pkg.version, expectedVersion, ref:sourceRef, dirty:sourceDirty, tagExists:!migration && Boolean(git(root, 'tag', '--list', tag))});
    // Source ref must resolve to this very commit, not merely be a supplied branch label.
    if (git(root, 'rev-parse', `refs/remotes/origin/${sourceRef}`) !== sourceSha) throw new Error('RELEASE_SOURCE_REF_MISMATCH');
  }
  const bootstrap = await json(path.join(root, canonical, 'assets/bootstrap/manifest.json'));
  const lock = await json(path.join(root, canonical, 'assets/tool-versions.json'));
  if (bootstrap.version !== pkg.version || lock.skillVersion !== pkg.version) throw new Error('RELEASE_GENERATED_VERSION_DRIFT');
  for (const provider of ['codex', 'claude']) {
    const manifest = await json(path.join(root, plugin, `.${provider}-plugin/plugin.json`));
    if (manifest.version !== pkg.version) throw new Error('RELEASE_PROVIDER_VERSION_DRIFT');
  }
  const plans = await Promise.all(hosts.map(host => runtimePlan(root, host)));
  if (publication) {
    const tracked = new Set(git(root, 'ls-files', '-z').split('\0'));
    if (plans.flat().some(entry => !tracked.has(entry.source))) throw new Error('RELEASE_UNTRACKED_PAYLOAD');
  }
  const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith(`## ${pkg.version} `));
  if (start < 0) throw new Error('RELEASE_CHANGELOG_MISSING');
  if (publication && /unreleased|publication not verified/i.test(lines[start])) throw new Error('RELEASE_NOTES_NOT_FINAL');
  const end = lines.findIndex((line, n) => n > start && line.startsWith('## '));
  // All validation above happens before output creation. Never overwrite an existing build.
  await mkdir(path.join(root, 'dist'), {recursive:true});
  if ((await lstat(path.join(root, 'dist'))).isSymbolicLink()) throw new Error('UNSAFE_DISTRIBUTION_OUTPUT');
  const output = await mkdtemp(path.join(root, 'dist', `release-${pkg.version}-`));
  const artifacts = [];
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i], stage = path.join(output, host);
    await mkdir(stage);
    for (const {source, target} of plans[i]) {
      const dest = path.join(stage, target);
      await mkdir(path.dirname(dest), {recursive:true});
      await copyFile(path.join(root, source), dest);
    }
    // Runtime manifests carry identity, not source-only npm scripts/tools.
    await writeFile(path.join(stage, 'package.json'), JSON.stringify({name:pkg.name, version:pkg.version, private:true, type:'module', engines:pkg.engines}, null, 2) + '\n');
    const files = [];
    for (const file of await walk(stage, '.')) {
      const relative = file.replace(/^\.\//, '');
      const bytes = await readFile(path.join(stage, relative));
      assertRuntimeFile(relative, bytes);
      files.push({path:relative, sha256:hash(bytes)});
    }
    const archive = `${pkg.name}-${pkg.version}-${host}.tgz`;
    execFileSync('tar', ['-czf', path.join(output, archive), '-C', stage, '.'], {stdio:'pipe'});
    const bytes = await readFile(path.join(output, archive));
    artifacts.push({host, archive, sha256:hash(bytes), bytes:bytes.length, files});
  }
  const catalog = {schemaVersion:1, package:pkg.name, version:pkg.version, tag:publication ? tag : null,
    status:publication ? 'publication-build' : 'local-preview', prerelease:pkg.version.includes('-'),
    sourceSha, sourceRef, sourceDirty, ...(migration ? {migration} : {}), artifacts};
  const catalogBytes = JSON.stringify(catalog, null, 2) + '\n';
  await writeFile(path.join(output, 'release.json'), catalogBytes);
  await writeFile(path.join(output, 'SHA256SUMS'), [...artifacts.map(a => `${a.sha256}  ${a.archive}`), `${hash(catalogBytes)}  release.json`].join('\n') + '\n');
  // Notes extracted only from the selected version, not a generated summary of unrelated history.
  await writeFile(path.join(output, 'release-notes.md'), lines.slice(start, end < 0 ? undefined : end).join('\n') + '\n');
  return {ok:true, output, version:pkg.version, sourceSha, sourceDirty, publication, artifacts:artifacts.map(({files,...a}) => a)};
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length && !(args[0] === '--release' && (args.length === 3 || (args.length === 4 && args[3] === '--migrate-5.0.2')))) throw new Error('Use no arguments for a local build, or --release <version> <branch> [--migrate-5.0.2] for publication preparation');
    console.log(JSON.stringify(await buildRelease(process.cwd(), {publication:args[0] === '--release', expectedVersion:args[1], ref:args[2], migrate502:args[3] === '--migrate-5.0.2'}), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
