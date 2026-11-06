#!/usr/bin/env node
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from './cli-args.mjs';

const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/bootstrap');
const normalized = value => Buffer.from(value.toString('utf8').replaceAll('\r\n', '\n'));
const hash = value => createHash('sha256').update(value).digest('hex');
const kinds = ['fe-main', 'be-main', 'fe-library', 'be-library'];
const start = '<!-- BEGIN AGRIMAP DEPLOYMENT -->';
const end = '<!-- END AGRIMAP DEPLOYMENT -->';
const EC_START = '# BEGIN AGRIMAP ANALYZERS (managed by bootstrap upgrade; override in a later [*.cs] section)';
const EC_END = '# END AGRIMAP ANALYZERS';
// Managed analyzer block (6.1.2): replaced in place, or inserted before the first
// section so every project section after it keeps winning (later sections override).
export function applyEditorconfigBlock(text, block) {
  const managed = `${EC_START}\n${block.trimEnd()}\n${EC_END}\n`;
  const lf = text.replaceAll('\r\n', '\n');
  const s = lf.indexOf(EC_START), e = lf.indexOf(EC_END);
  if (s >= 0 && e > s) return lf.slice(0, s) + managed + lf.slice(e + EC_END.length).replace(/^\n/, '');
  if (!lf.trim()) return managed;
  const first = lf.search(/^\s*\[/m);
  if (first < 0) return lf.trimEnd() + '\n\n' + managed;
  return lf.slice(0, first) + managed + '\n' + lf.slice(first);
}
async function readMaybe(file) { try { return await readFile(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }

// Automatic merge of a customized copy file (4.9.9): template-lines.json holds the
// normalized line hashes of every template version, so a line the project added is
// one that no template ever had. The new template wins for maintained text and the
// project lines are kept in PROJECT CUSTOM blocks under the same heading.
const CUSTOM_START = '<!-- BEGIN PROJECT CUSTOM (kept by bootstrap upgrade) -->';
const CUSTOM_END = '<!-- END PROJECT CUSTOM -->';
const MARKER_LINE = /^<!-- (?:AGRIMAP BOOTSTRAP VERSION: [^>]+|BEGIN PROJECT CUSTOM \(kept by bootstrap upgrade\)|END PROJECT CUSTOM) -->$/;
const normalLine = line => line.trim().replace(/\s+/g, ' ');
export const templateLineKey = line => createHash('sha256').update(normalLine(line)).digest('hex').slice(0, 12);
export const isTemplateContentLine = line => Boolean(normalLine(line)) && !MARKER_LINE.test(normalLine(line));

// Blocks under each heading; fenced code stays one unit so a kept block is never split.
function markdownBlocks(text) {
  const blocks = [{ heading: '', units: [] }];
  let fence = null;
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    const block = blocks[blocks.length - 1];
    if (fence) { fence.push(line); if (/^\s*```/.test(line)) fence = null; continue; }
    if (/^\s*```/.test(line)) { fence = [line]; block.units.push(fence); continue; }
    if (/^#{1,6} /.test(line)) { blocks.push({ heading: line, units: [] }); continue; }
    block.units.push([line]);
  }
  return blocks;
}

export function mergeTemplate(installed, template, known) {
  const templateLines = new Set(template.replaceAll('\r\n', '\n').split('\n').filter(isTemplateContentLine).map(templateLineKey));
  const isCustom = line => isTemplateContentLine(line) && !known.has(templateLineKey(line)) && !templateLines.has(templateLineKey(line));
  const kept = new Map();
  const extra = [];
  let preserved = 0;
  for (const block of markdownBlocks(installed)) {
    const ownHeading = block.heading && isCustom(block.heading);
    const lines = block.units.filter(unit => ownHeading || unit.some(isCustom)).flat().filter(line => !MARKER_LINE.test(normalLine(line)));
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.some(line => line.trim()) && !ownHeading) continue;
    preserved += lines.filter(isTemplateContentLine).length + (ownHeading ? 1 : 0);
    const key = normalLine(block.heading);
    if (!ownHeading && template.split('\n').some(line => normalLine(line) === key)) kept.set(key, [...(kept.get(key) || []), ...lines]);
    else extra.push(...(block.heading ? [block.heading] : []), ...lines, '');
  }
  const out = [];
  const flush = key => { const lines = kept.get(key); if (lines?.length) { while (out.length && !out[out.length - 1].trim()) out.pop(); out.push('', CUSTOM_START, ...lines, CUSTOM_END, ''); kept.delete(key); } };
  let current = '';
  for (const unit of markdownBlocks(template)) {
    if (unit.heading) { flush(current); out.push(unit.heading); current = normalLine(unit.heading); }
    out.push(...unit.units.flat());
  }
  flush(current);
  if (extra.length) { while (out.length && !out[out.length - 1].trim()) out.pop(); out.push('', CUSTOM_START, ...extra.filter((line, index, list) => line.trim() || index < list.length - 1), CUSTOM_END); }
  return { content: `${out.join('\n').replace(/\n+$/, '')}\n`, preserved };
}
async function safeTarget(root, relative) {
  const dest = path.resolve(root, relative);
  if (!dest.startsWith(root + path.sep)) throw new Error('BOOTSTRAP_PATH_ESCAPE');
  let current = dest;
  while (true) {
    const info = await lstat(current).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (info?.isSymbolicLink()) throw new Error('BOOTSTRAP_LINK_FORBIDDEN');
    if (current === path.parse(current).root) break;
    current = path.dirname(current);
  }
  return dest;
}
export async function planBootstrap({ target, kind, upgrade = false, reviewedMerges = [] }) {
  if (!target || !kinds.includes(kind)) throw new Error('BOOTSTRAP_TARGET_KIND_REQUIRED');
  const root = path.resolve(target);
  const pkg = await readMaybe(path.join(root, 'package.json'));
  if (pkg && JSON.parse(pkg).name === 'agrimap-agent-skills') throw new Error('PACKAGE_PRODUCT_BOOTSTRAP_FORBIDDEN');
  const manifest = JSON.parse(await readFile(path.join(bundle, 'manifest.json'), 'utf8'));
  const receiptBytes = await readMaybe(await safeTarget(root, '.agrimap-agent/runtime/bootstrap.json'));
  let priorReceipt = null;
  try { priorReceipt = receiptBytes ? JSON.parse(receiptBytes) : null; } catch { /* Rebuild only after verified apply. */ }
  if (!Array.isArray(reviewedMerges) || new Set(reviewedMerges.map(e => e?.target)).size !== reviewedMerges.length
    || reviewedMerges.some(e => !e || !manifest.files.some(f => f.target === e.target)
      || !/^[a-f0-9]{64}$/.test(e.sha256 || '') || !/^[a-f0-9]{64}$/.test(e.backupHash || '') || typeof e.reason !== 'string' || !e.reason.trim())) {
    throw new Error('BOOTSTRAP_MERGE_REVIEW_INVALID');
  }
  if (upgrade && reviewedMerges.length) throw new Error('BOOTSTRAP_MERGE_REPLACEMENT_CONFLICT');
  const templateLines = JSON.parse(await readFile(path.join(bundle, 'template-lines.json'), 'utf8').catch(() => '{"files":{}}'));
  const entries = [];
  for (const item of manifest.files) {
    if (item.kinds && !item.kinds.includes(kind)) continue;
    const source = await readFile(path.join(bundle, item.source));
    if (hash(source) !== item.sha256) throw new Error('BOOTSTRAP_BUNDLE_HASH_MISMATCH');
    const dest = await safeTarget(root, item.target);
    const before = await readMaybe(dest);
    const prior = before && (item.previous || []).find(old => old.sha256 === hash(normalized(before)));
    let content = source, status = before ? hash(before) === hash(source) ? 'unchanged' : 'conflict' : 'create';
    // Managed tool files are owned by the bundle: always replaced (with backup), never merged.
    if ((prior || upgrade === true || item.mode === 'managed') && status === 'conflict') status = 'update';
    let previousVersion = prior?.version || null;
    if (item.mode === 'editorconfig') {
      const next = applyEditorconfigBlock(before?.toString('utf8') || '', source.toString('utf8'));
      content = Buffer.from(next);
      status = !before ? 'create' : before.toString('utf8').replaceAll('\r\n', '\n') === next ? 'unchanged' : 'update';
    }
    if (item.mode === 'section') {
      const text = before?.toString('utf8') || '';
      const block = source.toString('utf8').trimEnd();
      const managed = `${start}\n${block}\n${end}\n`;
      if (text.includes(start) || text.includes(end) || /^## Deployment\s*$/m.test(text)) {
        const existing = text.split(start).length === 2 && text.split(end).length === 2 && text.indexOf(start) < text.indexOf(end) ? text.match(/<!-- BEGIN AGRIMAP DEPLOYMENT -->\r?\n([\s\S]*?)\r?\n<!-- END AGRIMAP DEPLOYMENT -->/) : null;
        status = existing && existing[1].replaceAll('\r\n', '\n') === block ? 'unchanged' : 'conflict';
        content = before;
        const previousBlock = existing && (item.previous || []).find(old => old.sha256 === hash(Buffer.from(existing[1].replaceAll('\r\n', '\n') + '\n')));
        if (status === 'conflict' && existing && (previousBlock || upgrade === true)) {
          status = 'update'; previousVersion = previousBlock?.version || null;
          content = Buffer.from(text.replace(existing[0], managed.trimEnd()));
        }
      } else {
        const index = text.search(/^## Swagger\s*$/m);
        const next = index >= 0 ? text.slice(0,index) + managed + '\n' + text.slice(index) : text.trimEnd() + (text ? '\n\n' : '') + managed;
        content = Buffer.from(next); status = before ? 'insert-section' : 'create';
      }
    }
    // A reviewed merge is scoped to exact bytes and this exact canonical source.
    // It is not a force flag: future edits or bundle changes become conflicts again.
    const review = reviewedMerges.find(e => e.target === item.target);
    const recorded = priorReceipt?.version === manifest.version && Array.isArray(priorReceipt.files)
      ? priorReceipt.files.find(e => e?.target === item.target && e.merge?.sourceSha256 === item.sha256
        && /^[a-f0-9]{64}$/.test(e.merge.backupHash || '') && typeof e.merge.reason === 'string' && e.merge.reason.trim()) : null;
    let merge = null;
    if (!upgrade && (review || (recorded?.merge && before && recorded.sha256 === hash(before)))) {
      const evidence = review || { ...recorded.merge, sha256: recorded.sha256 };
      if (!before || hash(before) !== evidence.sha256) throw new Error('BOOTSTRAP_MERGE_TARGET_DRIFT');
      const backup = await readMaybe(await safeTarget(root, `.agrimap-agent/runtime/bootstrap-backups/${evidence.backupHash}/${item.target}`));
      if (!backup || hash(backup) !== evidence.backupHash) throw new Error('BOOTSTRAP_MERGE_BACKUP_REQUIRED');
      if (item.target === 'AGENTS.md' && !before.toString('utf8').includes(`<!-- AGRIMAP BOOTSTRAP VERSION: ${manifest.version} -->`)) {
        throw new Error('BOOTSTRAP_MERGE_VERSION_MISMATCH');
      }
      if (item.mode === 'section') {
        const text = before.toString('utf8');
        if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(start) >= text.indexOf(end)) throw new Error('BOOTSTRAP_MERGE_SECTION_INVALID');
      }
      merge = { sourceSha256: item.sha256, backupHash: evidence.backupHash, reason: evidence.reason };
      content = before; status = 'unchanged';
    }
    let autoMerge = null;
    if (!merge && item.mode === 'copy' && status === 'conflict') {
      const merged = mergeTemplate(before.toString('utf8'), source.toString('utf8'), new Set(templateLines.files?.[item.target] || []));
      content = Buffer.from(merged.content);
      status = hash(content) === hash(before) ? 'unchanged' : 'merge';
      autoMerge = { preserved: merged.preserved };
    }
    entries.push({ previousVersion, target: item.target, mode: item.mode, status, beforeHash: before ? hash(before) : null, sha256: hash(content || ''), ...(merge ? {merge} : {}), ...(autoMerge ? {autoMerge} : {}), content: (content || Buffer.alloc(0)).toString('base64') });
  }
  const agents = await readMaybe(await safeTarget(root, 'AGENTS.md'));
  const installedVersion = agents?.toString('utf8').match(/<!-- AGRIMAP BOOTSTRAP VERSION: ([^ ]+) -->/)?.[1] || null;
  const receiptVersion = priorReceipt?.version || null;
  return { version: manifest.version, installedVersion, receiptVersion, freshness: receiptVersion === manifest.version && installedVersion === manifest.version && entries.every(e => e.status === 'unchanged') ? 'current' : 'update-required', root, kind, upgrade: upgrade === true, ok: entries.every(e => e.status !== 'conflict'), entries };
}
// Never a stop (4.9.9): everything that can be applied is applied; a file that still
// conflicts (only a hand-edited README Deployment block can) stays pending and is reported.
export async function applyBootstrap(options) {
  const plan = await planBootstrap(options);
  const pending = plan.entries.filter(e => e.status === 'conflict').map(e => e.target);
  plan.entries = plan.entries.filter(e => e.status !== 'conflict');
  const receipt = await safeTarget(plan.root,'.agrimap-agent/runtime/bootstrap.json');
  // Preflight all target fingerprints before creating any target.
  for (const e of plan.entries) {
    const dest = await safeTarget(plan.root,e.target), before = await readMaybe(dest);
    if ((before ? hash(before) : null) !== e.beforeHash) throw new Error('BOOTSTRAP_TARGET_DRIFT');
  }
  // Save exact prior bytes before any replacement, including project README outside the managed block.
  for (const e of plan.entries.filter(e => e.status === 'update' || e.status === 'merge')) {
    const backup = await safeTarget(plan.root, `.agrimap-agent/runtime/bootstrap-backups/${e.beforeHash}/${e.target}`);
    await mkdir(path.dirname(backup), {recursive:true});
    const old = await readFile(await safeTarget(plan.root, e.target));
    if (hash(old) !== e.beforeHash) throw new Error('BOOTSTRAP_TARGET_DRIFT');
    await writeFile(backup, old);
  }
  for (const e of plan.entries.filter(e => e.status !== 'unchanged')) {
    const dest = await safeTarget(plan.root,e.target);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(e.content,'base64'), { flag: e.beforeHash === null ? 'wx' : 'w' });
    if (hash(await readFile(dest)) !== e.sha256) throw new Error('BOOTSTRAP_COPY_VERIFY_FAILED');
  }
  await mkdir(path.dirname(receipt),{recursive:true});
  await writeFile(receipt,JSON.stringify({version:plan.version,kind:plan.kind,files:plan.entries.map(({content,...e})=>e)},null,2)+'\n');
  return { ...plan, applied: true, ok: true, pending };
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const args = parseCliArgs(process.argv.slice(3));
  Promise.resolve().then(async () => {
    if (!['plan','apply','upgrade'].includes(command)) throw new Error('Use plan [--upgrade]|apply|upgrade --target <project> --kind <kind> [--reviewed-merges <json-file>]');
    const reviewedMerges = args['reviewed-merges'] ? JSON.parse(await readFile(args['reviewed-merges'], 'utf8')) : [];
    return (command === 'plan' ? planBootstrap : applyBootstrap)({ target: args.target, kind: args.kind, upgrade: command === 'upgrade' || args.upgrade === true, reviewedMerges });
  }).then(result => { console.log(JSON.stringify({...result,entries:result.entries.map(({content,...e})=>e)},null,2)); if (!result.ok && !result.applied) process.exitCode=1; })
    .catch(error => {console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;});
}
