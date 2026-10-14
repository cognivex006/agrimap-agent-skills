import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {projectRoot} from '../helpers/harness.mjs';

test('bootstrap preserves the complete owner-submitted canonical contract',async()=>{
  const bundle=path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap');
  const bytes=await readFile(path.join(bundle,'AGENTS.md'));
  // Approved source: owner submit 2026-09-08, revisions 2026-09-09, and owner-requested
  // same-directory branch freshness / confirmed requester reuse revision 2026-09-10. Updating this hash
  // requires an intentional new canonical contract, not a formatting repair.
  // 4.6.0: Agent Collaboration Governance §10 team workflow, policy/local allowlist, per-execution logs (spec ACG v2.1 §13, §19.16).
  // 4.8.0: instruction diet — §2 (full), §4–§8 moved verbatim to AGENTS.release.md; core keeps a short §2
  // plus the owner-answered precedence sentence (Q-4.8.0-02).
  // 4.9.3: owner-requested §0 skill-first routing, §10.6 team commit style and release §8.2 Release Description.
  // 4.9.5: owner-requested intent x lane routing; §0 is generated from assets/skill-routing.json, heading renamed,
  // host recording example compacted to stay within the 24,000-character diet.
  // 4.9.6: owner-requested mandatory §10.6 team commit style for every Agent commit (guard G7).
  // 4.9.8: owner-requested Thai commit descriptions (§10.6) and the --flash read scope in §2.
  // 4.9.9: owner-requested non-blocking bootstrap auto-merge and technical terms kept as-is in §10.6.
  // 5.0.1: owner decision 2026-10-14 — §9 prompt history local only, memory/current is the savepoint,
  // reports only on request, no new tasks/; §10.3 work branches are feature/ or hotfix/ only.
  // Package bumps only change the generated version marker; freeze every other byte.
  const sourceBytes=Buffer.from(bytes.toString('utf8').replace(/<!-- AGRIMAP BOOTSTRAP VERSION: [^>]+ -->/,'<!-- AGRIMAP BOOTSTRAP VERSION: 3.6.1 -->'));
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'),'bcb711ccf56e6a4244ef1378d14b6f3c24f37c463f61738d3ffad2d4cf6c829c');
  const manifest=JSON.parse(await readFile(path.join(bundle,'manifest.json'),'utf8'));
  assert.ok(bytes.toString('utf8').includes(`<!-- AGRIMAP BOOTSTRAP VERSION: ${manifest.version} -->`));
  assert.equal(manifest.files.find(f=>f.source==='AGENTS.md').sha256,createHash('sha256').update(bytes).digest('hex'));
  for(const file of ['CLAUDE.md','GEMINI.md','CURSOR.md']){
    const pointer=await readFile(path.join(bundle,file),'utf8');
    assert.match(pointer,/@(?:\.\/)?AGENTS\.md/);
    assert.ok(pointer.split(/\r?\n/).length<12,'Keep the host file a thin pointer');
  }
});

test('release stages synchronize stale local branches and re-evaluate in one invocation',async()=>{
  const references=path.join(projectRoot,'skills/agrimap-agent-skills/references');
  const steps=await readFile(path.join(references,'release-steps.md'),'utf8');
  const workflow=await readFile(path.join(references,'release-workflow.md'),'utf8');
  assert.match(steps,/Synchronize only the branch needed by the current stage with its remote using fast-forward-only semantics/);
  assert.match(steps,/continue the same invocation instead of reporting the stale pre-sync mismatch/);
  assert.match(steps,/Do not advance jenkins-release from jenkins\/develop merely to perform this readiness check/);
  assert.match(steps,/Remote divergence remains a blocker/);
  assert.match(workflow,/Before each stage, fetch and fast-forward-only synchronize the stage's local branch with its remote/);
  assert.match(workflow,/materially changed remote candidate, destination or tag requires a revised plan and confirmation/);
  assert.match(workflow,/Do not clone the product, add a worktree/);
  assert.match(workflow,/For behind-only branches, in this same directory/);
  assert.match(workflow,/Local-only prepare never gains commit authority/);
  // 4.9.6 owner request: release gathers finished work branches into develop (M) instead of leaving them out.
  assert.match(workflow,/### Finished work branches \(M\)/);
  assert.match(steps,/\| release production \| R → M → I → P/);
  assert.doesNotMatch(workflow,/do not automatically commit\/push feature/);
  assert.doesNotMatch(workflow,/autonomously establish isolated|use an isolated develop worktree\/clone/);
});


test('owner release command is the confirmation; only a version or candidate anomaly asks (5.0.1)',async()=>{
  const references=path.join(projectRoot,'skills/agrimap-agent-skills/references');
  const workflow=await readFile(path.join(references,'release-workflow.md'),'utf8');
  const steps=await readFile(path.join(references,'release-steps.md'),'utf8');
  const flash=await readFile(path.join(references,'release-flash.md'),'utf8');
  const template=await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/AGENTS.release.md'),'utf8');
  const release=JSON.parse(await readFile(path.join(projectRoot,'config/operations.json'),'utf8')).operations.find(item=>item.operation==='release');
  assert.match(workflow,/the owner-typed command is the confirmation/);
  assert.match(workflow,/Version anomaly: an owner-supplied version is not its environment's PATCH\+1/);
  assert.match(workflow,/A bare command with the default PATCH\+1 versions is never an anomaly/);
  assert.match(steps,/ask its questions in one round \(AGENTS\.release\.md §6\.5\), together with a version anomaly/);
  assert.match(template,/คำสั่งของ owner คือการยืนยัน/);
  for(const text of [workflow,steps,flash,JSON.stringify(release)]){
    assert.doesNotMatch(text,/not concrete Production approval|is not confirmation\.|Never infer that confirmation|one Production confirmation/);
  }
  assert.doesNotMatch(template,/ต้องยืนยันกับ owner หนึ่งครั้งก่อนรัน|คำถามที่เหลือมีแค่ยืนยัน Production/);
});

test('operation policy reaches every first-read adapter without leaking to unrelated skills', async()=>{
  const {renderAliasSkill,renderAntigravitySkill,renderGeminiCommandPrompt,renderOperationEntrypoint,operationConfigIssues}=await import('../../tools/operation-entrypoints.mjs');
  const config=JSON.parse(await readFile(path.join(projectRoot,'config/operations.json'),'utf8'));
  const release=config.operations.find(item=>item.operation==='release');
  assert.ok(release.entrypointPolicy, 'Release authority must be available before reference loading');
  const renderers=[renderAliasSkill,renderAntigravitySkill,renderGeminiCommandPrompt,renderOperationEntrypoint];
  for(const render of renderers){
    const output=render(release);
    assert.ok(output.includes(release.entrypointPolicy));
    const revised={...release,entrypointPolicy:'Owner supplied replacement policy'};
    assert.ok(render(revised).includes(revised.entrypointPolicy));
    assert.ok(!render(revised).includes(release.entrypointPolicy));
    const unrelated=config.operations.find(item=>item.operation!=='release');
    assert.ok(!render(unrelated).includes(release.entrypointPolicy));
  }
  const distributed=[
    'skills/agm-release.md',
    'plugins/agrimap-agent-skills/skills/agm-release/SKILL.md',
    'skills/agrimap-agent-skills/references/operations/release.md',
    'commands/agm-release.toml'
  ];
  for(const file of distributed) assert.ok((await readFile(path.join(projectRoot,file),'utf8')).includes(release.entrypointPolicy),file);
  const invalid=structuredClone(config);
  invalid.operations.find(item=>item.operation==='release').entrypointPolicy=42;
  assert.ok(operationConfigIssues(invalid).some(issue=>issue.includes('entrypointPolicy')));
});

test('4.6.0 template adds team workflow, policy allowlist, per-execution logs and keeps the 4.5.5 hash',async()=>{
  const bundle=path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap');
  const text=await readFile(path.join(bundle,'AGENTS.md'),'utf8');
  assert.match(text,/^## 10\. Team workflow/m);
  assert.match(text,/^### 10\.5 /m);
  assert.match(text,/`\.agrimap-agent\/policy\/\*\*`/);
  assert.match(text,/`\.agrimap-agent\/local\/\*\*` เป็นความจำเฉพาะเครื่อง/);
  assert.match(text,/logs\/YYYY-MM\/YYYY-MM-DD\/<RUN_ID>\.jsonl/);
  assert.match(text,/^\| `integrate`: /m);
  assert.match(await readFile(path.join(bundle,'AGENTS.release.md'),'utf8'),/\| `integrate` \|/);
  const manifest=JSON.parse(await readFile(path.join(bundle,'manifest.json'),'utf8'));
  const previous=manifest.files.find(f=>f.source==='AGENTS.md').previous;
  assert.deepEqual(previous.find(p=>p.version==='4.5.5'),{version:'4.5.5',sha256:'195f3134fc9e6eb1c0ae707b6f7762f87b3508a8046cdb8722da373d3742d5f6'});
});

test('instruction diet: core AGENTS.md at most 24,000 chars; core + release keep every heading; release file frozen (AC28)',async()=>{
  const bundle=path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap');
  const core=await readFile(path.join(bundle,'AGENTS.md'),'utf8');
  const release=await readFile(path.join(bundle,'AGENTS.release.md'),'utf8');
  assert.ok(core.length<=24000,String(core.length));
  const manifest=JSON.parse(await readFile(path.join(bundle,'manifest.json'),'utf8'));
  assert.ok(release.includes(`<!-- AGRIMAP BOOTSTRAP VERSION: ${manifest.version} -->`));
  const entry=manifest.files.find(f=>f.source==='AGENTS.release.md');
  assert.equal(entry.target,'AGENTS.release.md');assert.equal(entry.sha256,createHash('sha256').update(release).digest('hex'));
  const frozen=release.replace(/<!-- AGRIMAP BOOTSTRAP VERSION: [^>]+ -->/,'<!-- AGRIMAP BOOTSTRAP VERSION: 3.6.1 -->');
  // 5.0.1: owner decision 2026-10-14 — §2.1/§6.5 the owner command is the confirmation; only anomalies ask.
  assert.equal(createHash('sha256').update(frozen).digest('hex'),'5f69c517a55b0a9713973f31f8e68a28f95919b20c2c44e6e06df821e05477c5');
  const headings=['## 0.','## 1.','## 2.','### 2.1','### 2.2','### 2.3','## 3.','## 4.','## 5.','### 5.1','### 5.2','## 6.','### 6.1','### 6.2','### 6.3','## 7.','## 8.','### 8.1','## 9.','### 9.1','### 9.5','## 10.','### 10.5','## Bootstrap contract freshness'];
  const all=(core+'\n'+release).split('\n');
  for(const h of headings)assert.ok(all.some(line=>line.startsWith(h)),h);
  assert.match(core,/อ่าน `AGENTS\.release\.md` ทั้งไฟล์ก่อนเริ่ม/);
  for(const moved of ['## 4.','## 5.','## 6.','## 7.','## 8.'])assert.ok(!core.split('\n').some(line=>line.startsWith(moved)),moved);
});

test('upgrade from the 4.7.0 template: unmodified AGENTS.md updates, an edited one merges automatically (4.9.9), release file is created',async t=>{
  const {createHarness}=await import('../helpers/harness.mjs');
  const {planBootstrap}=await import('../../skills/agrimap-agent-skills/scripts/project-bootstrap.mjs');
  const {writeFile}=await import('node:fs/promises');
  const h=await createHarness('agm-diet-');t.after(()=>h.cleanup());
  const old=await readFile(path.join(projectRoot,'tests/fixtures/bootstrap-4.7.0/AGENTS.md'));
  await writeFile(path.join(h.temp,'AGENTS.md'),old);
  let plan=await planBootstrap({target:h.temp,kind:'be-main'});
  const status=target=>plan.entries.find(e=>e.target===target).status;
  assert.equal(status('AGENTS.md'),'update');assert.equal(status('AGENTS.release.md'),'create');
  assert.equal(plan.entries.find(e=>e.target==='AGENTS.md').previousVersion,'4.7.0');
  await writeFile(path.join(h.temp,'AGENTS.md'),Buffer.concat([old,Buffer.from('\nProject rule: keep custom naming.\n')]));
  plan=await planBootstrap({target:h.temp,kind:'be-main'});
  assert.equal(status('AGENTS.md'),'merge');assert.equal(status('AGENTS.release.md'),'create');assert.equal(plan.ok,true);
  assert.equal(plan.entries.find(e=>e.target==='AGENTS.md').autoMerge.preserved,1);
});

test('managed bootstrap tool file is always replaced with a backup, never a merge conflict (4.9.3)',async t=>{
  const {createHarness}=await import('../helpers/harness.mjs');
  const {planBootstrap,applyBootstrap}=await import('../../skills/agrimap-agent-skills/scripts/project-bootstrap.mjs');
  const {mkdir,writeFile}=await import('node:fs/promises');
  const h=await createHarness('agm-managed-');t.after(()=>h.cleanup());
  const target='tools/agrimap/release-notify.mjs';
  await mkdir(path.join(h.temp,'tools/agrimap'),{recursive:true});
  await writeFile(path.join(h.temp,target),'// local edit\n');
  const plan=await planBootstrap({target:h.temp,kind:'be-main'});
  assert.equal(plan.entries.find(e=>e.target===target).status,'update');
  const applied=await applyBootstrap({target:h.temp,kind:'be-main'});
  assert.equal(applied.applied,true);
  const bundle=await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/release-notify.mjs'));
  assert.deepEqual(await readFile(path.join(h.temp,target)),bundle);
  const beforeHash=plan.entries.find(e=>e.target===target).beforeHash;
  assert.equal((await readFile(path.join(h.temp,'.agrimap-agent/runtime/bootstrap-backups',beforeHash,target),'utf8')),'// local edit\n');
});

test('release-notify: short Release Description payload with related projects; unhealthy never POSTs; healthy send posts once (4.9.3)',async t=>{
  const {createHarness}=await import('../helpers/harness.mjs');
  const {spawn}=await import('node:child_process');
  const {mkdir,writeFile}=await import('node:fs/promises');
  const http=await import('node:http');
  const h=await createHarness('agm-notify-');t.after(()=>h.cleanup());
  const script=path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/release-notify.mjs');
  const repo=path.join(h.temp,'agmwa-demo-ng');await mkdir(repo);
  await writeFile(path.join(repo,'desc.md'),['# agmwa-demo-ng / 1.4.2','','- เพิ่มการเข้าสู่ระบบด้วย ThaiD','- ปรับขั้นตอนเข้าสู่ระบบ (เกี่ยวข้อง: agmws-identity-netcore, @agrimap/auth-client)','- '+'ก'.repeat(600)].join(String.fromCharCode(10)));
  const env={...process.env,NOTIFY_WEBHOOK_URL:'',NOTIFY_HEALTH_URL:'',HOME:h.temp,USERPROFILE:h.temp};
  // Async spawn: the in-process test server must keep serving while the script runs.
  const run=(args,extra={})=>new Promise(resolve=>{const child=spawn(process.execPath,[script,...args],{cwd:repo,env:{...env,...extra}});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('close',status=>resolve({status,stdout,stderr}));});
  const preview=await run(['send','--description','desc.md','--environment','Production','--preview']);
  assert.equal(preview.status,0,preview.stdout+preview.stderr);
  const payload=JSON.parse(preview.stdout).payload;
  assert.deepEqual(Object.keys(payload).sort(),['environment','items','projectName','version']);
  assert.equal(payload.projectName,'agmwa-demo-ng');assert.equal(payload.version,'1.4.2');assert.equal(payload.items.length,3);
  assert.deepEqual(payload.items[0],{text:'เพิ่มการเข้าสู่ระบบด้วย ThaiD',relatedProjects:[]});
  assert.deepEqual(payload.items[1],{text:'ปรับขั้นตอนเข้าสู่ระบบ',relatedProjects:['agmws-identity-netcore','@agrimap/auth-client']});
  assert.equal(payload.items[2].text.length,500,'items are clipped to the service limit');
  // 4.9.9: a machine without the URL gets a ready question, standard URL first (Windows reads the user registry, so check off Windows).
  if(process.platform!=='win32'){
    const missing=await run(['send','--description','desc.md']);
    assert.equal(missing.status,2);const question=JSON.parse(missing.stdout).question;
    assert.equal(question.options[0].description,'https://appserv2.cdg.co.th/agrimap-notify/release-description');
    assert.match(question.options[0].command,/set-url https:\/\/appserv2\.cdg\.co\.th\/agrimap-notify\/release-description$/);
  }
  assert.match(await readFile(script,'utf8'),/question: missingUrlQuestion/);
  let healthy=false;const posts=[];
  const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    if(req.method==='POST')posts.push({url:req.url,body:JSON.parse(body)});
    res.statusCode=req.url.endsWith('/healthz')?(healthy?200:503):200;res.end('{"status":"accepted_by_webhook"}');});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const url='http://127.0.0.1:'+server.address().port+'/agrimap-notify/release-description';
  const unhealthy=await run(['send','--description','desc.md','--url',url]);
  assert.equal(unhealthy.status,3);assert.equal(JSON.parse(unhealthy.stdout).sent,false);assert.deepEqual(posts,[]);
  assert.ok(JSON.parse(unhealthy.stdout).health.healthUrl.endsWith('/agrimap-notify/healthz'));
  healthy=true;
  const sent=await run(['send','--description','desc.md','--url',url]);
  assert.equal(sent.status,0,sent.stdout);assert.equal(JSON.parse(sent.stdout).sent,true);
  assert.equal(posts.length,1);assert.equal(posts[0].url,'/agrimap-notify/release-description');assert.equal(posts[0].body.items.length,3);
});

test('release-notify generate: same shape from feature/fix commit headers with related projects detected (4.10.1)',async t=>{
  const {createHarness}=await import('../helpers/harness.mjs');
  const {execFileSync}=await import('node:child_process');
  const {writeFile}=await import('node:fs/promises');
  const h=await createHarness('agm-generate-');t.after(()=>h.cleanup());
  const script=path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/release-notify.mjs');
  const env={...process.env,AGM_GUARD_DISABLE:'1'};
  const git=(...a)=>execFileSync('git',a,{cwd:h.temp,encoding:'utf8',env});
  const commit=async(file,content,...messages)=>{await writeFile(path.join(h.temp,file),content);git('add','--',file);git('-c','core.hooksPath=/dev/null','commit','-q',...messages.flatMap(m=>['-m',m]));};
  git('init','-q');git('config','user.email','t@t');git('config','user.name','t');git('remote','add','origin','https://git.example/agmws-demo-netcore.git');
  await commit('a.txt','a','feature: เริ่มต้นระบบ');git('tag','v1.0.0');
  await commit('a.csproj','<PackageReference Include="AgriMap.Platform.Logging" Version="2.0.0" />','fix: ปรับ log เป็น JSON พร้อมรหัสติดตามคำขอ (1.0.1)');
  await commit('b.txt','b','ci: ปรับขั้นตอน build');
  await commit('c.txt','c','feature: เพิ่มรายงานสรุป','เกี่ยวข้อง: agmwa-platform-ng');
  const out=JSON.parse(execFileSync(process.execPath,[script,'generate','--version','1.0.1','--out','d.md'],{cwd:h.temp,encoding:'utf8'}));
  assert.equal(out.range,'v1.0.0..HEAD');
  assert.equal(await readFile(path.join(h.temp,'d.md'),'utf8'),['# agmws-demo-netcore / 1.0.1','- ปรับ log เป็น JSON พร้อมรหัสติดตามคำขอ (เกี่ยวข้อง: AgriMap.Platform)','- เพิ่มรายงานสรุป (เกี่ยวข้อง: agmwa-platform-ng)',''].join(String.fromCharCode(10)));
  await writeFile(path.join(h.temp,'e.md'),['# p / 1','- ข้อหนึ่ง','  เกี่ยวข้อง: AgriMap.Platform'].join(String.fromCharCode(10)));
  const preview=JSON.parse(execFileSync(process.execPath,[script,'send','--description','e.md','--preview'],{cwd:h.temp,encoding:'utf8'}));
  assert.deepEqual(preview.payload.items,[{text:'ข้อหนึ่ง',relatedProjects:['AgriMap.Platform']}]);
  assert.match(await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/references/release-notify.md'),'utf8'),/release-notify.mjs generate --version/);
});

test('release production/full and promote always push the Production tag and send the Release Description (4.9.8)',async()=>{
  const bundle=path.join(projectRoot,'skills/agrimap-agent-skills');
  const release=await readFile(path.join(bundle,'assets/bootstrap/AGENTS.release.md'),'utf8');
  const section=(from,to)=>release.slice(release.indexOf(from),release.indexOf(to,release.indexOf(from)));
  assert.match(release,/`release production`, `release full` และ `promote` เทียบเท่า `Version \+ Tags` เสมอ/);
  assert.match(section('## 7. Production annotated tag','## 8.'),/คำสั่ง agm-release `release production`, `release full`, `promote`/);
  const notify=section('### 8.2','- **Release Description**');
  assert.match(notify,/`promote` ทุกครั้งที่ Production tag checkpoint ผ่าน/);
  assert.doesNotMatch(notify,/`promote` และกลุ่ม A\/B ไม่ส่ง/);
  assert.match(release,/bootstrap ที่ใหม่กว่า\*\*ไม่ขวาง\*\* promote\/tag\/notify/);
  const steps=await readFile(path.join(bundle,'references/release-steps.md'),'utf8');
  assert.match(steps,/\| promote \| R → V → check recorded D\/J → Q → C → T → M → F → N \|/);
  assert.match(await readFile(path.join(bundle,'references/release-notify.md'),'utf8'),/and `promote`, every time the Production tag checkpoint/);
  const operations=JSON.parse(await readFile(path.join(projectRoot,'config/operations.json'),'utf8')).operations;
  assert.equal(operations.find(item=>item.name==='agm-release').conditionalReferences.find(item=>item.path==='release-notify.md').when,'release production|full or promote');
});

test('a customized AGENTS.md merges automatically: template updated, project rules kept, idempotent, never blocking (4.9.9)',async t=>{
  const {createHarness}=await import('../helpers/harness.mjs');
  const {planBootstrap,applyBootstrap,mergeTemplate}=await import('../../skills/agrimap-agent-skills/scripts/project-bootstrap.mjs');
  const {writeFile}=await import('node:fs/promises');
  const h=await createHarness('agm-merge-');t.after(()=>h.cleanup());
  const old=(await readFile(path.join(projectRoot,'tests/fixtures/bootstrap-4.7.0/AGENTS.md'),'utf8')).replaceAll('\r\n','\n');
  const heading=old.split('\n').find(line=>line.startsWith('## 10.'));
  const custom=old.replace(heading,heading+'\n\n- กติกาของทีม: ตั้งชื่อ endpoint เป็น kebab-case')+'\n## กติกาเฉพาะ project\n\n- deploy วันศุกร์ต้องแจ้งหัวหน้าทีม\n';
  await writeFile(path.join(h.temp,'AGENTS.md'),custom);
  const plan=await planBootstrap({target:h.temp,kind:'be-main'});
  const entry=plan.entries.find(e=>e.target==='AGENTS.md');
  assert.equal(entry.status,'merge');assert.equal(plan.ok,true);
  const applied=await applyBootstrap({target:h.temp,kind:'be-main'});
  assert.equal(applied.applied,true);assert.deepEqual(applied.pending,[]);
  const merged=await readFile(path.join(h.temp,'AGENTS.md'),'utf8');
  const template=await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/AGENTS.md'),'utf8');
  const manifest=JSON.parse(await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/manifest.json'),'utf8'));
  assert.ok(merged.includes(`<!-- AGRIMAP BOOTSTRAP VERSION: ${manifest.version} -->`),'marker is the new version');
  assert.ok(merged.includes('ตั้งชื่อ endpoint เป็น kebab-case'));assert.ok(merged.includes('deploy วันศุกร์ต้องแจ้งหัวหน้าทีม'));
  assert.ok(merged.includes('## 10.6'),'new template sections arrive');
  assert.equal(merged.split('BEGIN PROJECT CUSTOM').length-1,2);
  assert.equal(mergeTemplate(merged,template,new Set(JSON.parse(await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/template-lines.json'),'utf8')).files['AGENTS.md'])).content,merged,'idempotent');
  const again=await planBootstrap({target:h.temp,kind:'be-main'});
  assert.equal(again.entries.find(e=>e.target==='AGENTS.md').status,'unchanged');
  const backups=await readFile(path.join(h.temp,'.agrimap-agent/runtime/bootstrap-backups',entry.beforeHash,'AGENTS.md'),'utf8');
  assert.equal(backups,custom,'backup kept');
});

test('release-notify commandPath uses only explicit install locations, never PATH or cwd decoys (4.10.2)',async t=>{
  const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');
  const os=await import('node:os');
  const {pathToFileURL}=await import('node:url');
  const {commandPath}=await import(pathToFileURL(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/release-notify.mjs')).href);
  assert.throws(()=>commandPath('node'),/Unsupported command/);
  assert.throws(()=>commandPath('git.exe'),/Unsupported command/);
  const temp=await mkdtemp(path.join(os.tmpdir(),'agm-cmdpath-'));
  const keys=['PATH','Path','ProgramW6432','ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA','SystemRoot'];
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const cwd=process.cwd();
  t.after(async()=>{for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}process.chdir(cwd);await rm(temp,{recursive:true,force:true});});
  const decoy=path.join(temp,'decoy');await mkdir(decoy);
  for(const name of ['git','git.exe','reg.exe','setx.exe'])await writeFile(path.join(decoy,name),'');
  process.env.PATH=decoy;process.env.Path=decoy;process.chdir(decoy);
  if(process.platform!=='win32'){
    const {existsSync}=await import('node:fs');
    const approved=['/usr/bin/git','/usr/local/bin/git','/opt/homebrew/bin/git'].find(file=>existsSync(file));
    if(approved)assert.equal(commandPath('git'),approved);
    else assert.throws(()=>commandPath('git'),/Trusted executable not found: git/);
    assert.throws(()=>commandPath('reg'),/Trusted executable not found: reg/);
    return;
  }
  const programs=path.join(temp,'programs');const system=path.join(temp,'windows');
  for(const k of ['ProgramW6432','ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA'])process.env[k]=programs;
  process.env.SystemRoot=system;
  // C:\Program Files is a fixed fallback, so a machine Git may still be found there; it must never be a decoy.
  const {existsSync}=await import('node:fs');
  const fixedGit=path.join('C:\\Program Files','Git','cmd','git.exe');
  if(existsSync(fixedGit))assert.equal(commandPath('git'),fixedGit);
  else assert.throws(()=>commandPath('git'),/Trusted executable not found: git/);
  assert.throws(()=>commandPath('reg'),/Trusted executable not found: reg/);
  assert.throws(()=>commandPath('setx'),/Trusted executable not found: setx/);
  const git=path.join(programs,'Git','cmd','git.exe');await mkdir(path.dirname(git),{recursive:true});await writeFile(git,'');
  await mkdir(path.join(system,'System32'),{recursive:true});
  for(const name of ['reg','setx'])await writeFile(path.join(system,'System32',`${name}.exe`),'');
  assert.equal(commandPath('git'),git);
  assert.equal(commandPath('reg'),path.join(system,'System32','reg.exe'));
  assert.equal(commandPath('setx'),path.join(system,'System32','setx.exe'));
});
