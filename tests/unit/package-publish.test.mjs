import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {publishPackage, repository} from '../../tools/package-publish.mjs';
import {verifyPackage} from '../../tools/package-verify.mjs';
import {assertMigration502, migration502} from '../../tools/package-release.mjs';

const sha = 'a'.repeat(40);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const version = '9.0.0';
const tag = `v${version}`;

async function fixture(t, overrides = {}) {
  const version = overrides.version || '9.0.0';
  const tag = `v${version}`;
  const prerelease = version.includes('-rc.');
  const dir = await mkdtemp(path.join(os.tmpdir(),'agm-publish-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const artifacts = [];
  for (const host of ['codex','claude','antigravity']) {
    const archive = `agrimap-agent-skills-${version}-${host}.tgz`;
    const bytes = Buffer.from(`fixture ${host}`);
    await writeFile(path.join(dir,archive),bytes);
    artifacts.push({host,archive,sha256:hash(bytes)});
  }
  const catalog = {version,tag,sourceSha:sha,sourceDirty:false,status:'publication-build',artifacts};
  if (overrides.migrate502) catalog.migration = {...migration502,reason:'Owner-authorized 5.0.2 reissue with repository migration and local publication; differs from the previous repository release.'};
  const catalogBytes = JSON.stringify(catalog);
  await writeFile(path.join(dir,'release.json'),catalogBytes);
  await writeFile(path.join(dir,'SHA256SUMS'),[...artifacts.map(a=>`${a.sha256}  ${a.archive}`),`${hash(catalogBytes)}  release.json`].join('\n')+'\n');
  await writeFile(path.join(dir,'release-notes.md'),'fixture notes');
  const files = [...artifacts.map(a=>a.archive),'release.json','SHA256SUMS'];
  const calls = [];
  let published = false;
  const run = (root,exe,args) => {
    calls.push({exe,args});
    const custom = overrides.run?.(exe,args);
    if (custom !== undefined) return custom;
    if (exe === 'git') {
      if (args[0] === 'remote') return `https://github.com/${repository}`;
      if (args[0] === 'branch') return prerelease ? `release/${version.split('-')[0]}` : 'main';
      if (args[0] === 'rev-parse' && args[1] === 'v5.0.2^{commit}') return migration502.previousSourceSha;
      if (args[0] === 'tag') return overrides.migrate502 ? 'v5.0.2' : '';
      if (args[0] === 'status' || args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return sha;
    }
    if (exe === 'gh') {
      const endpoint = args.find(a=>a.startsWith(`repos/${repository}`));
      if (args[0] === 'api') {
        if (endpoint === `repos/${repository}`) return JSON.stringify({full_name:repository,permissions:{push:true}});
        if (endpoint.includes('/matching-refs/')) return '[]';
        if (endpoint.endsWith('/releases')) return '';
        if (endpoint.includes('/git/ref/')) return JSON.stringify({object:{sha}});
        if (endpoint.endsWith('/git/refs')) return '{}';
      }
      if (args[0] === 'release') {
        if (args[1] === 'create') return '';
        if (args[1] === 'edit') { published=true; return ''; }
        if (args[1] === 'view') return JSON.stringify({tagName:tag,isDraft:!published,isPrerelease:prerelease,assets:files.map(name=>({name})),url:'https://example.invalid/release'});
        if (args[1] === 'download') {
          // Synchronous mock CLI, like the real run boundary.
          overrides.downloadDir = args[args.indexOf('--dir')+1];
          return '';
        }
      }
    }
    throw new Error(`Unexpected mock call ${exe} ${args.join(' ')}`);
  };
  // Copy at the command boundary before the publisher reads downloaded bytes.
  const {copyFileSync, writeFileSync} = await import('node:fs');
  const wrappedRun = (...args) => {
    const result = run(...args);
    if (args[1] === 'gh' && args[2][0] === 'release' && args[2][1] === 'download') {
      for (const name of files) copyFileSync(path.join(dir,name),path.join(overrides.downloadDir,name));
      if (overrides.tamper) writeFileSync(path.join(overrides.downloadDir,files[0]),'tampered');
    }
    return result;
  };
  const verify = () => { calls.push({exe:'verify',args:[]}); };
  const build = async () => {
    calls.push({exe:'build',args:[]});
    if (overrides.invalidCatalog) {
      catalog.status='local-preview'; await writeFile(path.join(dir,'release.json'),JSON.stringify(catalog));
    }
    return {output:dir,version,sourceSha:sha,sourceDirty:false,publication:true};
  };
  return {dir,calls,options:{version,latest:false,migrate502:overrides.migrate502,run:wrappedRun,verify,build},writes:()=>calls.filter(c=>c.exe==='gh' && (c.args.includes('-f') || ['create','edit'].includes(c.args[1])))};
}

test('local publication checks fresh source, builds, verifies downloaded draft, then publishes', async t=>{
  const f = await fixture(t);
  const result = await publishPackage('.',f.options);
  assert.equal(result.ok,true);
  const steps = f.calls.map(c=>`${c.exe} ${c.args.slice(0,2).join(' ')}`);
  assert.ok(steps.indexOf('verify ') < steps.indexOf('build '));
  assert.ok(steps.indexOf('gh release download') < steps.indexOf('gh release edit'));
  const tagWrite = f.writes()[0].args;
  assert.ok(tagWrite.includes(`sha=${sha}`));
  assert.equal(f.writes().length,3);
  assert.ok(!JSON.stringify(f.calls).match(/workflow|actions|GITHUB_TOKEN|--clobber|--force/));
  assert.ok(!f.calls.some(c=>c.exe==='git' && ['push','tag'].includes(c.args[0]) && c.args[1] !== '--list'));
});

test('invalid source, credentials, destination, reused version and preview never write GitHub',async t=>{
  const cases = [
    {run:(exe,args)=>exe==='git' && args[0]==='remote' ? 'https://github.com/wrong/repo' : undefined},
    {run:(exe,args)=>exe==='git' && args[0]==='branch' ? 'feature/work' : undefined},
    {run:(exe,args)=>exe==='git' && args[0]==='status' ? ' M package.json' : undefined},
    {run:(exe,args)=>{if(exe==='gh') throw new Error('HTTP 403');}},
    {run:(exe,args)=>exe==='gh' && args.some(a=>a.includes('/matching-refs/')) ? JSON.stringify([{ref:`refs/tags/${tag}`}]) : undefined},
    {run:(exe,args)=>exe==='git' && args[0]==='tag' ? tag : undefined},
    {run:(exe,args)=>exe==='git' && args[1]==='FETCH_HEAD' ? 'b'.repeat(40) : undefined},
    {invalidCatalog:true},
  ];
  for (const config of cases) {
    const f = await fixture(t,config);
    await assert.rejects(publishPackage('.',f.options));
    assert.equal(f.writes().length,0);
  }
});

test('rc publication uses its release branch, marks prerelease and never promotes latest',async t=>{
  const f = await fixture(t,{version:'9.0.0-rc.1'});
  await publishPackage('.',f.options);
  assert.ok(f.calls.some(c=>c.exe==='git' && c.args.includes('refs/heads/release/9.0.0:refs/remotes/origin/release/9.0.0')));
  assert.ok(f.calls.find(c=>c.exe==='gh' && c.args[1]==='create').args.includes('--prerelease'));
  assert.ok(f.calls.find(c=>c.exe==='gh' && c.args[1]==='edit').args.includes('--latest=false'));
});

test('failed local verification prevents tag and draft creation',async t=>{
  const f = await fixture(t);
  await assert.rejects(publishPackage('.',{...f.options,verify:()=>{throw new Error('local gate failed');}}),/local gate failed/);
  assert.equal(f.writes().length,0);
});

test('owner 5.0.2 reissue preserves legacy local tag, records migration, and still rejects a remote tag',async t=>{
  const f = await fixture(t,{version:'5.0.2',migrate502:true});
  assert.equal((await publishPackage('.',f.options)).ok,true);
  assert.ok(!f.calls.some(c=>c.exe==='git' && c.args[0]==='tag'));
  const existing = await fixture(t,{version:'5.0.2',migrate502:true,run:(exe,args)=>exe==='gh' && args.some(a=>a.includes('/matching-refs/')) ? JSON.stringify([{ref:'refs/tags/v5.0.2'}]) : undefined});
  await assert.rejects(publishPackage('.',existing.options),/RELEASE_VERSION_ALREADY_EXISTS/);
  assert.equal(existing.writes().length,0);
  const runGit = (...args)=>args[0]==='rev-parse' ? migration502.previousSourceSha : `https://github.com/${repository}`;
  assert.doesNotThrow(()=>assertMigration502('5.0.2',runGit));
  assert.throws(()=>assertMigration502('5.0.3',runGit),/MIGRATION_FORBIDDEN/);
  assert.throws(()=>assertMigration502('5.0.2',()=>sha),/MIGRATION_FORBIDDEN/);
  assert.throws(()=>assertMigration502('5.0.2',(...args)=>args[0]==='rev-parse' ? migration502.previousSourceSha : 'https://github.com/other/repo'),/MIGRATION_REMOTE_FORBIDDEN/);
});

test('download corruption leaves draft and reports partial state without publishing/retrying',async t=>{
  const f = await fixture(t,{tamper:true});
  await assert.rejects(publishPackage('.',f.options),/PUBLICATION_INCOMPLETE at verify-draft/);
  assert.equal(f.writes().length,2);
  assert.ok(!f.calls.some(c=>c.args[1]==='edit'));
});

test('tag race fails at atomic creation without creating draft or retrying',async t=>{
  const f = await fixture(t,{run:(exe,args)=>{if(exe==='gh' && args.includes(`ref=refs/tags/${tag}`)) throw new Error('Reference already exists');}});
  await assert.rejects(publishPackage('.',f.options),/PUBLICATION_INCOMPLETE at create-tag/);
  assert.equal(f.writes().length,1);
});

test('explicit latest choice is required and prerelease cannot be latest',async()=>{
  for (const options of [{version}, {version:'9.0.0-rc.1',latest:true}]) await assert.rejects(publishPackage('.',options));
});

test('local verify runs route/commit checks and all gates without remote writes; drift stops tests',()=>{
  const calls = [];
  const run = (root,exe,args)=>{ calls.push({exe,args}); return ''; };
  assert.equal(verifyPackage('.', {base:'develop',head:'feature/test',run,npmCli:'/npm-cli.js'}).ok,true);
  assert.ok(calls.some(c=>c.args[0]==='tools/check-commit-style.mjs'));
  for (const task of ['sync','test:release','audit:tokens:strict','package:build']) assert.ok(calls.some(c=>c.args.includes(task)));
  assert.ok(calls.every(c=>c.exe!=='gh' && !c.args.includes('push')));
  let count=0;
  assert.throws(()=>verifyPackage('.', {npmCli:'/npm-cli.js',run:(root,exe,args)=>args[0]==='diff' ? String(count++) : ''}),/GENERATED_DRIFT/);
});

test('source has no Actions workflows and only the explicit publish script can publish',async()=>{
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const workflows = await readdir(path.join(root,'.github/workflows'),{recursive:true}).catch(error=>{
    if (error.code !== 'ENOENT') throw error; return [];
  });
  assert.ok(!workflows.some(file=>/\.ya?ml$/i.test(file)));
  const pkg = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.scripts['package:publish'],'node tools/package-publish.mjs');
  for (const name of ['package:verify','package:build','test','test:release']) assert.doesNotMatch(pkg.scripts[name],/tools\/package-publish\.mjs|gh\s|workflow/);
});
