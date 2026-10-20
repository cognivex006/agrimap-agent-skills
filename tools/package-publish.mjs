#!/usr/bin/env node
// Maintainer-only. Explicit local publication; never called by verification/build.
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRelease, assertMigration502} from './package-release.mjs';
import {command, verifyPackage} from './package-verify.mjs';

export const repository = 'cognivex006/agrimap-agent-skills';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function publishPackage(root, {version, latest, migrate502 = false, run = command, verify = verifyPackage, build = buildRelease} = {}) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/.test(version || '') || typeof latest !== 'boolean') {
    throw new Error('Use --version <exact-version> --latest true|false');
  }
  const prerelease = version.includes('-rc.');
  if (prerelease && latest) throw new Error('Prerelease cannot become latest stable');
  const git = (...args) => run(root, 'git', args);
  const gh = (...args) => run(root, 'gh', args);
  const api = (...args) => JSON.parse(gh('api', ...args));
  const ref = prerelease ? `release/${version.split('-')[0]}` : 'main';
  const tag = `v${version}`;
  const migration = migrate502 ? assertMigration502(version, git) : null;
  for (const args of [['remote','get-url','--all','origin'], ['remote','get-url','--push','--all','origin']]) {
    if (!new RegExp(`^https://github\\.com/${repository}(?:\\.git)?$`).test(git(...args))) throw new Error('PUBLICATION_REMOTE_MISMATCH');
  }
  if (git('branch', '--show-current') !== ref) throw new Error('RELEASE_BRANCH_FORBIDDEN');
  if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('RELEASE_DIRTY_SOURCE');
  const metadata = api(`repos/${repository}`);
  if (metadata.full_name !== repository || !metadata.permissions?.push || metadata.archived || metadata.disabled) throw new Error('PUBLICATION_REPOSITORY_NOT_WRITABLE');
  const refs = api(`repos/${repository}/git/matching-refs/tags/${tag}`);
  if (refs.some(item => item.ref === `refs/tags/${tag}`) || (!migration && git('tag','--list',tag))) throw new Error('RELEASE_VERSION_ALREADY_EXISTS');
  const releases = gh('api', '--paginate', `repos/${repository}/releases`, '--jq', '.[].tag_name');
  if (releases.split(/\r?\n/).includes(tag)) throw new Error('RELEASE_VERSION_ALREADY_EXISTS');
  // FETCH_HEAD is fetched from the new origin, so stale tracking refs from the
  // previous account cannot prove publication eligibility.
  git('fetch','--no-tags','origin',`refs/heads/${ref}:refs/remotes/origin/${ref}`);
  const sourceSha = git('rev-parse','HEAD');
  if (git('rev-parse','FETCH_HEAD') !== sourceSha || api(`repos/${repository}/git/ref/heads/${ref}`).object.sha !== sourceSha) throw new Error('RELEASE_SOURCE_REF_MISMATCH');
  verify(root, {run});
  const result = await build(root, {publication:true, expectedVersion:version, ref, migrate502});
  if (result.sourceSha !== sourceSha || result.sourceDirty || !result.publication || result.version !== version) throw new Error('PUBLICATION_BUILD_MISMATCH');
  const catalogPath = path.join(result.output,'release.json');
  const catalog = JSON.parse(await readFile(catalogPath,'utf8'));
  if (catalog.status !== 'publication-build' || catalog.sourceSha !== sourceSha || catalog.sourceDirty || catalog.tag !== tag || catalog.version !== version) throw new Error('PUBLICATION_CATALOG_MISMATCH');
  if (migration && JSON.stringify(catalog.migration) !== JSON.stringify(migration)) throw new Error('PUBLICATION_MIGRATION_METADATA_MISMATCH');
  if (catalog.artifacts.length !== 3 || ['codex','claude','antigravity'].some(host => catalog.artifacts.filter(a=>a.host===host).length !== 1)) throw new Error('PUBLICATION_HOSTS_MISSING');
  const files = [...catalog.artifacts.map(a=>a.archive), 'release.json','SHA256SUMS'];
  if (new Set(files).size !== files.length || files.some(file => path.basename(file) !== file || !/^[A-Za-z0-9_.-]+$/.test(file))) throw new Error('PUBLICATION_ASSET_PATH_INVALID');
  const expected = new Map();
  for (const file of files) expected.set(file, sha256(await readFile(path.join(result.output,file))));
  for (const artifact of catalog.artifacts) if (expected.get(artifact.archive) !== artifact.sha256) throw new Error('PUBLICATION_CHECKSUM_MISMATCH');
  const sums = (await readFile(path.join(result.output,'SHA256SUMS'),'utf8')).trim().split(/\r?\n/);
  if (sums.length !== files.length - 1 || sums.some(line => {
    const [hash,file] = line.split('  '); return file === 'SHA256SUMS' || expected.get(file) !== hash;
  }) || new Set(sums.map(line=>line.split('  ')[1])).size !== sums.length) throw new Error('PUBLICATION_CHECKSUM_MISMATCH');
  if (git('rev-parse','HEAD') !== sourceSha || git('status','--porcelain','--untracked-files=all') || api(`repos/${repository}/git/ref/heads/${ref}`).object.sha !== sourceSha) throw new Error('RELEASE_SOURCE_CHANGED');
  let stage = 'create-tag';
  const temp = await mkdtemp(path.join(os.tmpdir(),'agm-publication-'));
  try {
    // Atomic creation fails if another publisher created the same tag. Never
    // force, delete, clobber assets or resume a partial release automatically.
    gh('api', `repos/${repository}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sourceSha}`);
    stage = 'create-draft';
    gh('release','create',tag, ...files.map(file=>path.join(result.output,file)), '--repo',repository,'--verify-tag','--title',tag,'--notes-file',path.join(result.output,'release-notes.md'),'--draft',...(prerelease ? ['--prerelease'] : []));
    stage = 'verify-draft';
    const draft = JSON.parse(gh('release','view',tag,'--repo',repository,'--json','tagName,isDraft,isPrerelease,assets'));
    if (draft.tagName !== tag || !draft.isDraft || draft.isPrerelease !== prerelease || draft.assets.length !== files.length || new Set(draft.assets.map(a=>a.name)).size !== files.length || draft.assets.some(a=>!expected.has(a.name))) throw new Error('PUBLICATION_DRAFT_MISMATCH');
    if (api(`repos/${repository}/git/ref/tags/${tag}`).object.sha !== sourceSha) throw new Error('PUBLICATION_TAG_MISMATCH');
    gh('release','download',tag,'--repo',repository,'--dir',temp);
    for (const file of files) if (sha256(await readFile(path.join(temp,file))) !== expected.get(file)) throw new Error(`PUBLICATION_DOWNLOAD_MISMATCH: ${file}`);
    stage = 'publish-draft';
    gh('release','edit',tag,'--repo',repository,'--draft=false',`--latest=${latest}`);
    stage = 'verify-publication';
    const published = JSON.parse(gh('release','view',tag,'--repo',repository,'--json','tagName,isDraft,isPrerelease,url'));
    if (published.isDraft || published.tagName !== tag || published.isPrerelease !== prerelease) throw new Error('PUBLICATION_FINAL_STATE_MISMATCH');
    return {ok:true, repository, version, sourceSha, url:published.url, output:result.output};
  } catch (error) {
    throw new Error(`PUBLICATION_INCOMPLETE at ${stage}; inspect ${repository} ${tag}, source ${sourceSha}, artifacts ${result.output}. No automatic retry/overwrite. ${error.message}`, {cause:error});
  } finally { await rm(temp,{recursive:true,force:true}); }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (![4,5].includes(args.length) || args[0] !== '--version' || args[2] !== '--latest' || !['true','false'].includes(args[3]) || (args.length === 5 && args[4] !== '--migrate-5.0.2')) throw new Error('Use --version <exact-version> --latest true|false [--migrate-5.0.2]');
    console.log(JSON.stringify(await publishPackage(process.cwd(), {version:args[1], latest:args[3] === 'true', migrate502:args[4] === '--migrate-5.0.2'}), null, 2));
  } catch (error) { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; }
}
