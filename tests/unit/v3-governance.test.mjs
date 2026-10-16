import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readFile,readdir,writeFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createHarness,projectRoot} from '../helpers/harness.mjs';
import {initRepo,createGitFixture,gitIn} from '../helpers/git-fixture.mjs';
import {selectWorkflow,classifyRequest,instructionProfile,verificationDecision,sqlContextToolAllowed,validateReadQuery} from '../../skills/agrimap-agent-skills/scripts/governance-policy.mjs';
import {normalizeIdentity,confirmationExpiry,localAuditMetadata} from '../../skills/agrimap-agent-skills/scripts/identity.mjs';
import {createPromptVersion} from '../../skills/agrimap-agent-skills/scripts/agm-prompt-version.mjs';
import {planBootstrap,applyBootstrap} from '../../skills/agrimap-agent-skills/scripts/project-bootstrap.mjs';

const present = p => stat(p).then(()=>true,()=>false);
async function fixture(t){const h=await createHarness('agrimap-v3-');t.after(()=>h.cleanup());return h;}
const body = detail => `# Prompt Result\n\n## Main Assignment\n${detail}\n\n## Subagent Assignments\nNone — Main owns all work\n\n## Acceptance Criteria\nObserved requested outcome.\n\n## Deviation and Handoff Contract\nPreserve scope.\n`;

test('bootstrap executable accepts plan/apply/upgrade and rejects unknown commands without writes',async t=>{
 const h=await fixture(t),script=path.join(projectRoot,'skills/agrimap-agent-skills/scripts/project-bootstrap.mjs');
 assert.equal(h.run(script,['plan','--target',h.temp,'--kind','be-main']).ok,true);
 assert.equal(await present(path.join(h.temp,'AGENTS.md')),false);
 assert.equal(h.run(script,['apply','--target',h.temp,'--kind','be-main']).applied,true);
 assert.equal(h.run(script,['upgrade','--target',h.temp,'--kind','be-main']).applied,true);
 const before=await readFile(path.join(h.temp,'AGENTS.md'));
 const bad=h.spawn(script,['unknown','--target',h.temp,'--kind','be-main']);
 assert.equal(bad.status,1);assert.match(bad.stderr,/Use plan/);
 assert.deepEqual(await readFile(path.join(h.temp,'AGENTS.md')),before);
});

test('start accepts the documented requested-by flag using existing conversation confirmation',async t=>{
 const h=await fixture(t);
 const r=h.run(h.scripts.workspace,['start','--operation','execute','--session','current','--requested-by','006006','--title','Authorized fix']);
 assert.equal(r.activeTask.requestedBy,'006006');
});

test('hook and runtime reuse a confirmed local session even without a users registry',async t=>{
 const h=await fixture(t),dir=path.join(h.temp,'.agrimap-agent/runtime/sessions');
 await mkdir(dir,{recursive:true});
 const identity={schemaVersion:2,sessionId:'previous',requestedBy:'006006',identitySource:'manual-confirmed',confirmedAt:new Date().toISOString(),expiresAt:null,...localAuditMetadata()};
 await writeFile(path.join(dir,'previous.json'),JSON.stringify(identity));
 // An expired current-session file must not mask a newer confirmation for this requester.
 await writeFile(path.join(dir,'current.json'),JSON.stringify({...identity,sessionId:'current',confirmedAt:'2020-01-01T00:00:00Z',expiresAt:'2020-01-02T00:00:00Z'}));
 const hook=h.run(h.scripts.hook,['--provider','codex'],{cwd:h.temp,session_id:'current',hook_event_name:'UserPromptSubmit',prompt:'$agm-release indexing'});
 assert.match(hook.hookSpecificOutput.additionalContext,/Confirmed requester: 006006/);
 const started=h.run(h.scripts.workspace,['start','--operation','execute','--session','current','--title','Authorized fix']);
 assert.equal(started.activeTask.requestedBy,'006006');
});

test('requester lookup is read-only and rejects revoked, expired, foreign and ambiguous identities',async t=>{
 const h=await fixture(t),dir=path.join(h.temp,'.agrimap-agent/runtime/sessions');
 const lookup=()=>h.run(h.scripts.workspace,['requester','--session','current']);
 assert.equal(lookup().needsRequester,true);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent')),false);
 await mkdir(dir,{recursive:true});
 const valid={schemaVersion:2,requestedBy:'006006',identitySource:'manual-confirmed',confirmedAt:new Date().toISOString(),expiresAt:null,...localAuditMetadata()};
 for(const override of [{machine:'another-machine'},{osUser:'another-user'},{expiresAt:'2020-01-01T00:00:00Z'},{revoked:true}]) {
  await writeFile(path.join(dir,'previous.json'),JSON.stringify({...valid,...override}));
  assert.equal(lookup().needsRequester,true);
 }
 await writeFile(path.join(dir,'previous.json'),JSON.stringify(valid));
 assert.equal(lookup().identity.requestedBy,'006006');
 await writeFile(path.join(dir,'other.json'),JSON.stringify({...valid,requestedBy:'another-requester'}));
 assert.equal(lookup().needsRequester,true);
 await writeFile(path.join(dir,'current.json'),JSON.stringify({...valid,revoked:true}));
 assert.equal(lookup().needsRequester,true);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/runtime/users')),false);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/tasks')),false);
});

test('questions do not initialize a workspace, require identity, or create tasks',async t=>{
 const h=await fixture(t);
 for(const operation of ['analyze','history','qa','design']){
  if(operation==='history')continue;
  const result=h.run(h.scripts.workspace,['start','--operation',operation,'--title','Explain this code']);
  assert.equal(result.started,false);
 }
 assert.equal(await present(path.join(h.temp,'.agrimap-agent')),false);
});
test('risk and real tracking select depth; model scaffolding is independent',()=>{
 assert.equal(selectWorkflow({operation:'analyze'}).depth,null);
 assert.equal(selectWorkflow({operation:'execute'}).depth,'light');
 assert.equal(selectWorkflow({operation:'execute',tracking:true}).depth,'standard');
 assert.equal(selectWorkflow({operation:'execute',risk:'public-contract-change'}).depth,'regulated');
 assert.throws(()=>selectWorkflow({operation:'execute',depth:'regulated'}),/WORKFLOW_DEPTH_REASON_MISMATCH/);
 assert.throws(()=>selectWorkflow({operation:'execute',tracking:true,depth:'light'}),/WORKFLOW_DEPTH_REASON_MISMATCH/);
 assert.deepEqual(instructionProfile({model:'unknown-new-model'}),{profile:'guided',model:'unknown-new-model',changesAuthority:false});
 assert.equal(verificationDecision({kind:'discussion'}),'none');
 assert.equal(verificationDecision({kind:'docs'}),'structure-and-links');
 assert.equal(verificationDecision({behaviorChanged:true,evidenceMatches:true}),'reuse-matching-evidence');
});

test('doctor inspection never starts identity or task state; update is an explicit write action',async t=>{
 const h=await fixture(t);
 for(const action of [null,'status','version','check']) {
  const args=['start','--operation','doctor','--title','Inspect AGM readiness'];
  if(action)args.push('--action',action);
  assert.equal(h.run(h.scripts.workspace,args).started,false);
 }
 assert.equal(await present(path.join(h.temp,'.agrimap-agent')),false);
 assert.equal(selectWorkflow({operation:'doctor',action:'update'}).depth,'light');
 assert.equal(classifyRequest({recognized:true,prompt:'Explain `agm-doctor update`'}).active,false);
});

test('reviewed bootstrap merges preserve custom rules, require backup, and detect later drift',async t=>{
 const h=await fixture(t),opts={target:h.temp,kind:'be-main'};
 await applyBootstrap(opts);
 const file=path.join(h.temp,'AGENTS.md'),before=await readFile(file);
 const digest=value=>createHash('sha256').update(value).digest('hex');
 const backupHash=digest(before),merged=Buffer.concat([before,Buffer.from('\nProject-specific rule: retain the custom API naming convention.\n')]);
 await writeFile(file,merged);
 assert.equal((await planBootstrap(opts)).entries.find(e=>e.target==='AGENTS.md').status,'merge');
 const reviewedMerges=[{target:'AGENTS.md',sha256:digest(merged),backupHash,reason:'Reviewed bundle rules and retained project API naming.'}];
 await assert.rejects(applyBootstrap({...opts,reviewedMerges}),/BACKUP_REQUIRED/);
 const backup=path.join(h.temp,'.agrimap-agent/runtime/bootstrap-backups',backupHash,'AGENTS.md');
 await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,before);
 await assert.rejects(planBootstrap({...opts,reviewedMerges:[{...reviewedMerges[0],sha256:backupHash}]}),/TARGET_DRIFT/);
 assert.equal((await applyBootstrap({...opts,reviewedMerges})).applied,true);
 assert.deepEqual(await readFile(file),merged);
 assert.equal((await planBootstrap(opts)).freshness,'current');
 assert.equal((await applyBootstrap(opts)).entries.every(e=>e.status==='unchanged'),true);
 await writeFile(file,Buffer.concat([merged,Buffer.from('\nUnreviewed edit\n')]));
 assert.equal((await planBootstrap(opts)).entries.find(e=>e.target==='AGENTS.md').status,'merge');
 const receiptPath=path.join(h.temp,'.agrimap-agent/runtime/bootstrap.json');
 const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
 await writeFile(file,merged);receipt.version='0.0.0';await writeFile(receiptPath,JSON.stringify(receipt));
 assert.equal((await planBootstrap(opts)).entries.find(e=>e.target==='AGENTS.md').status,'merge');
 receipt.version=(await planBootstrap(opts)).version;receipt.files={invalid:'receipt'};await writeFile(receiptPath,JSON.stringify(receipt));
 assert.equal((await planBootstrap(opts)).entries.find(e=>e.target==='AGENTS.md').status,'merge');
 for(const reviewedMerges of [[null],[{target:'../outside',sha256:backupHash,backupHash,reason:'invalid target'}]]) {
  await assert.rejects(planBootstrap({...opts,reviewedMerges}),/MERGE_REVIEW_INVALID/);
 }
});
test('identity remains confirmed without daily expiry and is reused only locally',async t=>{
 const h=await fixture(t);
 const saved=h.run(h.scripts.workspace,['identify','--session','one','--owner','006006','--model','actual-model','--provider','codex']);
 assert.equal(saved.identity.expiresAt,null);
 assert.equal(confirmationExpiry(new Date().toISOString()),null);
 assert.equal(normalizeIdentity(saved.identity,{nowMs:Date.now()+365*86400000}).expired,false);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/tasks')),false);
 const started=h.run(h.scripts.workspace,['start','--session','two','--operation','execute','--title','Bounded fix']);
 assert.equal(started.activeTask.requestedBy,'006006');
 assert.equal(started.activeTask.taskId,null);
 assert.equal(started.activeTask.requesterAuthority,'unknown');
});
test('light completion derives null taskId and creates no report or task tree',async t=>{
 const h=await fixture(t);
 h.run(h.scripts.workspace,['identify','--session','one','--owner','006006']);
 const a=h.run(h.scripts.workspace,['start','--session','one','--operation','execute','--title','Bounded fix']).activeTask;
 h.run(h.scripts.workspace,['checkpoint','--session','one','--execution',a.executionId,'--event','verified','--summary','Observed expected behavior','--verification','targeted assertion passed']);
 const result=h.run(h.scripts.workspace,['complete','--session','one','--execution',a.executionId]);
 assert.equal(result.ok,true);assert.equal(result.report,null);
 assert.equal(h.run(h.scripts.workspace,['validate','--execution',a.executionId]).ok,true);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/tasks')),false);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/reports')),false);
});
test('tracked work keeps one savepoint instead of tasks/ and rejects failed closure (5.0.1)',async t=>{
 const h=await fixture(t);
 h.run(h.scripts.workspace,['identify','--session','one','--owner','006006']);
 const a=h.run(h.scripts.workspace,['start','--session','one','--operation','execute','--tracking','--title','Implement two dependent slices','--remaining','slice A;slice B']).activeTask;
 assert.equal(a.taskPath,null);assert.ok(a.taskId);
 const current=path.join(h.temp,'.agrimap-agent',a.currentMemoryPath);
 assert.match(await readFile(current,'utf8'),/## Remaining\n- slice A\n- slice B/);
 assert.equal(h.spawn(h.scripts.workspace,['complete','--session','one','--execution',a.executionId]).status,1);
 h.run(h.scripts.workspace,['checkpoint','--session','one','--execution',a.executionId,'--files','src/a.js','--summary','Slice A done','--remaining','slice B','--next','write slice B']);
 const mid=await readFile(current,'utf8');
 assert.match(mid,/## Done\n- Slice A done/);assert.match(mid,/## Remaining\n- slice B\n/);assert.match(mid,/## Next step\nwrite slice B/);
 h.run(h.scripts.workspace,['checkpoint','--session','one','--execution',a.executionId,'--event','verified','--status','failed','--summary','Regression fails']);
 assert.equal(h.spawn(h.scripts.workspace,['complete','--session','one','--execution',a.executionId]).status,1);
 h.run(h.scripts.workspace,['checkpoint','--session','one','--execution',a.executionId,'--event','verified','--status','passed','--summary','Regression passes after correction','--verification','targeted regression passed']);
 const check=h.run(h.scripts.workspace,['validate','--session','one','--execution',a.executionId]);
 assert.equal(check.ok,true);assert.deepEqual(check.warnings,['savepoint-remaining-items']);
 const done=h.run(h.scripts.workspace,['complete','--session','one','--execution',a.executionId]);assert.equal(done.ok,true);
 assert.equal(await present(current),false);
 assert.match(await readFile(path.join(h.temp,'.agrimap-agent',a.recentMemoryPath),'utf8'),/Completion gate passed\. Done: Slice A done/);
 assert.equal(h.run(h.scripts.workspace,['validate','--execution',a.executionId]).ok,true);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/tasks')),false);
 const history=h.run(h.scripts.workspace,['history','--requester','006006']);assert.equal(history.ok,true);
});
test('pending lists unfinished work and resume moves it to a new session safely (5.0.1)',async t=>{
 const h=await fixture(t);
 for(const s of ['one','two','three','four'])h.run(h.scripts.workspace,['identify','--session',s,'--owner','006006']);
 const a=h.run(h.scripts.workspace,['start','--session','one','--operation','execute','--persist','--title','Add export button']).activeTask;
 const saved=h.run(h.scripts.workspace,['savepoint','--session','one','--execution',a.executionId,'--done','API ready','--remaining','FE button;tests','--next','build the FE button']);
 assert.equal(saved.ok,true);assert.deepEqual(saved.remaining,['FE button','tests']);
 const listed=h.run(h.scripts.workspace,['pending']).pending;
 assert.equal(listed.length,1);assert.equal(listed[0].executionId,a.executionId);assert.equal(listed[0].attached,true);
 assert.equal(listed[0].session,'one');assert.equal(listed[0].next,'build the FE button');assert.deepEqual(listed[0].remaining,['FE button','tests']);
 // A session touched moments ago is not taken over silently.
 assert.equal(h.spawn(h.scripts.workspace,['resume','--session','two','--execution',a.executionId]).status,1);
 const moved=h.run(h.scripts.workspace,['resume','--session','two','--execution',a.executionId,'--take-over']);
 assert.equal(moved.ok,true);assert.equal(moved.next,'build the FE button');assert.deepEqual(moved.done,['API ready']);
 const active=path.join(h.temp,'.agrimap-agent/runtime/active');
 assert.equal(await present(path.join(active,'one.json')),false);assert.equal(await present(path.join(active,'two.json')),true);
 assert.match(await readFile(path.join(h.temp,'.agrimap-agent',a.currentMemoryPath),'utf8'),/- Session: two/);
 // Runtime state is local: without it the savepoint and created event rebuild the execution.
 await rm(path.join(active,'two.json'));
 const rebuilt=h.run(h.scripts.workspace,['resume','--session','three','--execution',a.executionId]);
 assert.equal(rebuilt.ok,true);assert.equal(JSON.parse(await readFile(path.join(active,'three.json'),'utf8')).objective,'Add export button');
 // A session that owns another execution is never overwritten.
 h.run(h.scripts.workspace,['start','--session','four','--operation','execute','--persist','--title','Other work']);
 const busy=h.spawn(h.scripts.workspace,['resume','--session','four','--execution',a.executionId]);
 assert.equal(busy.status,1);assert.match(busy.stdout,/SESSION_BUSY/);
 h.run(h.scripts.workspace,['checkpoint','--session','three','--execution',a.executionId,'--event','verified','--status','passed','--summary','Button works','--verification','manual check']);
 assert.equal(h.run(h.scripts.workspace,['complete','--session','three','--execution',a.executionId]).ok,true);
 assert.deepEqual(h.run(h.scripts.workspace,['pending']).pending.map(item=>item.objective),['Other work']);
});
test('unrelated conversation and quoted aliases are not activation',()=>{
 assert.equal(classifyRequest({recognized:true,prompt:'วันนี้กินอะไรดี'}).active,false);
 assert.equal(classifyRequest({recognized:true,prompt:'ช่วยวิเคราะห์โค้ด service นี้'}).active,true);
 assert.equal(classifyRequest({recognized:false,prompt:'ช่วยวิเคราะห์โค้ด service นี้'}).active,false);
 assert.equal(classifyRequest({recognized:false,prompt:'อธิบาย `$agm-be`'}).active,false);
 assert.equal(classifyRequest({recognized:true,prompt:'What is a release in music?'}).active,false);
 for(const prompt of ['What does customer service mean?','What is a branch?','Explain SQL joins','What is a dress code?']) assert.equal(classifyRequest({recognized:true,prompt}).active,false,prompt);
 assert.equal(classifyRequest({recognized:true,prompt:'Example: $agm-be'}).active,false);
});
test('hooks stay silent for SessionStart and unrelated prompts despite active state',async t=>{
 const h=await fixture(t);const root=path.join(h.temp,'agrimap-example');await mkdir(root);
 await mkdir(path.join(root,'.agrimap-agent/runtime/active'),{recursive:true});
 await writeFile(path.join(root,'.agrimap-agent/runtime/active/one.json'),JSON.stringify({executionId:'old',requestedBy:'006006'}));
 for(const input of [{hook_event_name:'SessionStart'}, ...['วันนี้กินอะไรดี','What is a release in music?','What does customer service mean?','Explain SQL joins','Example: $agm-be'].map(prompt=>({hook_event_name:'UserPromptSubmit',prompt}))]){
  const result=h.run(h.scripts.hook,['--provider','codex'],{...input,cwd:root,session_id:'one'});
  assert.equal(result.hookSpecificOutput,undefined);
 }
 assert.equal(await present(path.join(root,'.agrimap-agent/prompts')),false);
});
test('relevant Gemini submit retries archive once without mixing AI output',async t=>{
 const h=await fixture(t);const root=path.join(h.temp,'agrimap-example');await initRepo(root);
 const input={cwd:root,session_id:'one',hook_event_name:'BeforeAgent',prompt:'ช่วยอธิบายโค้ดในโครงการ',prompt_id:'submit-1'};
 h.run(h.scripts.hook,['--provider','gemini'],input);h.run(h.scripts.hook,['--provider','gemini'],input);
 const periods=await readdir(path.join(root,'.agrimap-agent/prompts'));
 const text=await readFile(path.join(root,'.agrimap-agent/prompts',periods[0],'one/history.md'),'utf8');
 assert.equal(text.split(input.prompt).length-1,1);assert.equal(text.includes('Confirmed requester'),false);
});
test('harness task notifications never enter raw prompt history',async t=>{
 const h=await fixture(t);const root=path.join(h.temp,'agrimap-example');await initRepo(root);
 const note='<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command "cd agrimap-example; node --test tests/unit/git-flow.test.mjs; git push origin develop" completed (exit code 0)</summary>\n</task-notification>';
 const send=(prompt,id)=>h.run(h.scripts.hook,['--provider','claude'],{cwd:root,session_id:'one',hook_event_name:'UserPromptSubmit',prompt,prompt_id:id});
 send('ช่วยอธิบายโค้ดในโครงการ','1');send(note,'2');send(note+'\nแก้ validation ในโค้ด service นี้','3');
 const periods=await readdir(path.join(root,'.agrimap-agent/prompts'));
 const text=await readFile(path.join(root,'.agrimap-agent/prompts',periods[0],'one/history.md'),'utf8');
 assert.equal(text.includes('task-notification'),false);assert.equal(text.includes('git push'),false);
 assert.equal(text.split('### [').length-1,2);assert.ok(text.includes('แก้ validation ในโค้ด service นี้'));
});
test('prompt explanation/no-op does not create versions; revisions need source evidence',async t=>{
 const h=await fixture(t);const opts={cwd:h.temp,conversationId:'one',context:'feature',requester:'006006',provider:'codex',model:'actual'};
 assert.equal((await createPromptVersion({...opts,intent:'explain'})).created,false);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent')),false);
 const first=await createPromptVersion({...opts,body:body('Add bounded feature')});
 await assert.rejects(()=>createPromptVersion({...opts,intent:'typo',body:body('Wrong intent')}),{code:'INVALID_PROMPT_INTENT'});
 const approval=await createPromptVersion({...opts,intent:'approve'});
 assert.equal(approval.created,false);assert.equal(approval.path,first.path);assert.equal(approval.sha256,first.sha256);assert.equal(approval.approvalRecorded,false);
 const before=await readFile(path.join(h.temp,first.path));
 assert.equal((await createPromptVersion({...opts,body:body('Add bounded feature')})).created,false);
 await assert.rejects(()=>createPromptVersion({...opts,body:body('Add feature and retries')}),{code:'PROMPT_CHANGE_EVIDENCE_REQUIRED'});
 const second=await createPromptVersion({...opts,body:body('Add feature and retries'),changeSummary:'Add retry bound',sourceEvidence:'Requester: retry at most three times'});
 assert.equal(second.version,2);assert.deepEqual(await readFile(path.join(h.temp,first.path)),before);
 assert.equal((await readdir(path.dirname(path.join(h.temp,first.path)))).filter(f=>f.endsWith('.md')).length,2);
});
test('SQL adapter allows bounded reads but rejects every database mutation route',()=>{
 assert.equal(sqlContextToolAllowed('sqlctx_query_data'),true);
 for(const tool of ['sqlctx_apply_routine_deployment','sqlctx_sync_context_index','sqlctx_apply_folder_classification','sqlctx_resolve_context_index'])assert.equal(sqlContextToolAllowed(tool),false);
 assert.equal(validateReadQuery('SELECT TOP (10) ID FROM dbo.T').ok,true);
 for(const sql of ['CREATE TABLE T (id int)','INSERT INTO T VALUES(1)','UPDATE T SET id=2','DELETE FROM T','DROP TABLE T','ALTER PROCEDURE p AS SELECT 1','EXEC p','SELECT * INTO X FROM T','SELECT 1; DELETE FROM T','SELECT * FROM OPENQUERY(server, \'DELETE\')'])assert.equal(validateReadQuery(sql).ok,false,sql);
});
test('bootstrap is exact, scoped, idempotent and preserves README/versions',async t=>{
 const h=await fixture(t);
 await writeFile(path.join(h.temp,'README.md'),'# Existing project\n\n## Swagger\nExisting API documentation.\n');
 await writeFile(path.join(h.temp,'Jenkinsfile'),"PROJECT_VERSION = '1.0.42'\n");
 const opts={target:h.temp,kind:'be-main'};const plan=await planBootstrap(opts);assert.equal(plan.ok,true);
 assert.equal(await present(path.join(h.temp,'AGENTS.md')),false);
 assert.equal((await applyBootstrap(opts)).applied,true);
 for(const file of ['AGENTS.md','GEMINI.md','CLAUDE.md','CURSOR.md','release-notes/README.md'])assert.deepEqual(await readFile(path.join(h.temp,file)),await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap',file)));
 const readme=await readFile(path.join(h.temp,'README.md'),'utf8');assert.ok(readme.includes('Existing API documentation.'));
 assert.match(readme,/push `jenkins` สำหรับ Inhouse/);
 assert.match(readme,/push `jenkins-release` สำหรับ Production/);
 const again=await applyBootstrap(opts);assert.ok(again.entries.every(e=>e.status==='unchanged'));
 assert.equal(await readFile(path.join(h.temp,'README.md'),'utf8'),readme);
 assert.equal(await readFile(path.join(h.temp,'Jenkinsfile'),'utf8'),"PROJECT_VERSION = '1.0.42'\n");
 for(const file of ['.gitignore','changelog.md','Jenkinsfile_Production','release-notes/1.0.0.md'])assert.equal(await present(path.join(h.temp,file)),false);
});
test('a hand-written AGENTS.md is merged, never blocking the install (4.9.9)',async t=>{
 const h=await fixture(t);await writeFile(path.join(h.temp,'AGENTS.md'),'User instructions\n');
 const r=await applyBootstrap({target:h.temp,kind:'be-main'});assert.equal(r.applied,true);assert.deepEqual(r.pending,[]);
 assert.match(await readFile(path.join(h.temp,'AGENTS.md'),'utf8'),/PROJECT CUSTOM[\s\S]*User instructions/);
 assert.equal(await present(path.join(h.temp,'CLAUDE.md')),true);
 await assert.rejects(()=>planBootstrap({target:projectRoot,kind:'be-main'}),/PACKAGE_PRODUCT_BOOTSTRAP_FORBIDDEN/);
});
test('init only installs project documents on explicit bootstrap',async t=>{
 const h=await fixture(t);h.run(h.scripts.workspace,['init']);
 assert.equal(await present(path.join(h.temp,'AGENTS.md')),false);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/tasks')),false);
 h.run(h.scripts.workspace,['init','--bootstrap','--kind','fe-main']);
 assert.equal(await present(path.join(h.temp,'AGENTS.md')),true);
});


test('legacy 3.2.2 bootstrap upgrades with backup and preserves surrounding README',async t=>{
 const h=await fixture(t);
 const legacy=await readFile(path.join(projectRoot,'tests/fixtures/bootstrap-3.2.2/AGENTS.md'),'utf8');
 const block=await readFile(path.join(projectRoot,'tests/fixtures/bootstrap-3.2.2/deployment.md'),'utf8');
 await writeFile(path.join(h.temp,'AGENTS.md'),legacy.replaceAll('\n','\r\n'));
 await writeFile(path.join(h.temp,'README.md'),'# Custom title\n\n<!-- BEGIN AGRIMAP DEPLOYMENT -->\n'+block.trimEnd()+'\n<!-- END AGRIMAP DEPLOYMENT -->\n\n## Custom instructions\nKeep this.\n');
 const opts={target:h.temp,kind:'be-main'};
 const plan=await planBootstrap(opts);
 assert.equal(plan.installedVersion,null); assert.equal(plan.freshness,'update-required'); assert.equal(plan.ok,true);
 assert.equal(plan.entries.find(e=>e.target==='AGENTS.md').status,'update');
 const result=await applyBootstrap(opts);assert.equal(result.applied,true);
 const old=result.entries.find(e=>e.target==='AGENTS.md');
 assert.equal(await readFile(path.join(h.temp,'.agrimap-agent/runtime/bootstrap-backups',old.beforeHash,'AGENTS.md'),'utf8'),legacy.replaceAll('\n','\r\n'));
 const text=await readFile(path.join(h.temp,'AGENTS.md'),'utf8');assert.ok(text.includes('AGRIMAP BOOTSTRAP VERSION: '+result.version));
 const readme=await readFile(path.join(h.temp,'README.md'),'utf8');assert.ok(readme.startsWith('# Custom title'));assert.ok(readme.endsWith('Keep this.\n'));
 assert.equal((await planBootstrap(opts)).freshness,'current');
 const receipt=JSON.parse(await readFile(path.join(h.temp,'.agrimap-agent/runtime/bootstrap.json'),'utf8'));assert.equal(receipt.version,result.version);
});

test('modified legacy contract merges automatically and keeps the owner rule (4.9.9)',async t=>{
 const h=await fixture(t);
 const legacy=await readFile(path.join(projectRoot,'tests/fixtures/bootstrap-3.2.2/AGENTS.md'),'utf8');
 const custom=legacy+'\nOwner-specific build rule.\n';await writeFile(path.join(h.temp,'AGENTS.md'),custom);
 const result=await applyBootstrap({target:h.temp,kind:'be-main'});
 assert.equal(result.applied,true);
 assert.match(await readFile(path.join(h.temp,'AGENTS.md'),'utf8'),/PROJECT CUSTOM[\s\S]*Owner-specific build rule\./);
 assert.equal(await present(path.join(h.temp,'.agrimap-agent/runtime/bootstrap.json')),true);
 assert.equal((await planBootstrap({target:h.temp,kind:'be-main'})).freshness,'current');
});


test('explicit upgrade replaces only contract targets with backups and stays idempotent',async t=>{
 const h=await fixture(t);
 await writeFile(path.join(h.temp,'AGENTS.md'),'Custom old contract\n');
 await writeFile(path.join(h.temp,'README.md'),'# Product\n<!-- BEGIN AGRIMAP DEPLOYMENT -->\nCustom old deployment\n<!-- END AGRIMAP DEPLOYMENT -->\nKeep footer.\n');
 await writeFile(path.join(h.temp,'Jenkinsfile'),"PROJECT_VERSION = '1.0.8'\n");
 const opts={target:h.temp,kind:'be-main',upgrade:true};
 const plan=await planBootstrap(opts);assert.equal(plan.ok,true);assert.equal(plan.upgrade,true);
 assert.equal(await readFile(path.join(h.temp,'AGENTS.md'),'utf8'),'Custom old contract\n');
 const result=await applyBootstrap(opts);assert.equal(result.applied,true);
 for(const e of result.entries.filter(e=>e.status==='update')) assert.equal(await present(path.join(h.temp,'.agrimap-agent/runtime/bootstrap-backups',e.beforeHash,e.target)),true);
 assert.deepEqual(await readFile(path.join(h.temp,'AGENTS.md')),await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/bootstrap/AGENTS.md')));
 const readme=await readFile(path.join(h.temp,'README.md'),'utf8');assert.ok(readme.startsWith('# Product'));assert.ok(readme.endsWith('Keep footer.\n'));assert.ok(!readme.includes('Custom old deployment'));
 assert.equal(await readFile(path.join(h.temp,'Jenkinsfile'),'utf8'),"PROJECT_VERSION = '1.0.8'\n");
 assert.equal((await planBootstrap(opts)).freshness,'current');
});

test('ambiguous README blocks stay pending while the rest installs (4.9.9)',async t=>{
 const h=await fixture(t);await writeFile(path.join(h.temp,'AGENTS.md'),'Keep old contract');
 await writeFile(path.join(h.temp,'README.md'),'<!-- BEGIN AGRIMAP DEPLOYMENT -->\nOne\n<!-- END AGRIMAP DEPLOYMENT -->\n<!-- BEGIN AGRIMAP DEPLOYMENT -->\nTwo\n<!-- END AGRIMAP DEPLOYMENT -->');
 const readme=await readFile(path.join(h.temp,'README.md'),'utf8');
 const r=await applyBootstrap({target:h.temp,kind:'be-main',upgrade:true});
 assert.equal(r.applied,true);assert.deepEqual(r.pending,['README.md']);
 assert.equal(await readFile(path.join(h.temp,'README.md'),'utf8'),readme);
});


test('Antigravity recording keeps host separate from actual model and preserves legacy Gemini',async t=>{
 const h=await fixture(t);
 const saved=h.run(h.scripts.workspace,['identify','--session','agy-example','--owner','006006','--provider','antigravity','--model','unknown']);
 assert.equal(saved.identity.provider,'antigravity');assert.equal(saved.identity.model,'unknown');
 const actual=normalizeIdentity({...saved.identity,model:'runtime-reported-id'});
 assert.equal(actual.provider,'antigravity');assert.equal(actual.model,'runtime-reported-id');
 const legacy=normalizeIdentity({...saved.identity,provider:'gemini',model:'legacy-model-id'});
 assert.equal(legacy.provider,'gemini');assert.equal(legacy.model,'legacy-model-id');
 const schema=JSON.parse(await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/assets/task-artifact-schema.json'),'utf8'));
 const inspect=value=>{
  if(!value || typeof value!=='object')return;
  if(value.label==='Provider' && value.enum){assert.ok(value.enum.includes('antigravity'));assert.ok(value.enum.includes('gemini'));}
  Object.values(value).forEach(inspect);
 };inspect(schema);
});

// ---- 4.6.0 Agent Collaboration Governance (P1)
test('hook in a non-git parent writes nothing and points to context with child repositories',async t=>{
 const h=await fixture(t);const parent=path.join(h.temp,'platform');
 await initRepo(path.join(parent,'agmws-orders-netcore'));
 const hook=h.run(h.scripts.hook,['--provider','claude'],{cwd:parent,session_id:'p1',hook_event_name:'UserPromptSubmit',prompt:'แก้ไข validation ในโค้ด service นี้'});
 assert.match(hook.hookSpecificOutput.additionalContext,/outside any Git repository/);
 assert.match(hook.hookSpecificOutput.additionalContext,/agmws-orders-netcore/);
 assert.equal(await present(path.join(parent,'.agrimap-agent')),false);
});
test('hook names the domain skill from the repository name and SQL intent (4.9.3)',async t=>{
 const h=await fixture(t);
 const ws=path.join(h.temp,'agmws-orders-netcore');await initRepo(ws);
 const be=h.run(h.scripts.hook,['--provider','claude'],{cwd:ws,session_id:'d1',hook_event_name:'UserPromptSubmit',prompt:'แก้ไข validation ในโค้ด service นี้'}).hookSpecificOutput.additionalContext;
 assert.match(be,/Domain skill .*agm-be \(be-main, backend_profile=agmws/);
 // 4.9.5: the turn line comes from intent x lane routing (assets/skill-routing.json).
 assert.match(be,/Skill for this turn: agrimap-agent-skills:agm-be \(lane be-main · intent change → action edit\)/);
 const wa=path.join(h.temp,'agmwa-platform-ng');await initRepo(wa);
 const fe=h.run(h.scripts.hook,['--provider','claude'],{cwd:wa,session_id:'d2',hook_event_name:'UserPromptSubmit',prompt:'สร้างตาราง ORDER และ SP สำหรับบันทึกข้อมูล'}).hookSpecificOutput.additionalContext;
 assert.match(fe,/agm-fe \(fe-main/);assert.match(fe,/Skill for this turn: agrimap-agent-skills:agm-sql \(lane sql · intent change → action create\)/);
});
test('hook short replies: option with a stored card, silence without, question guard for delivered work',async t=>{
 const h=await fixture(t);const root=path.join(h.temp,'agmws-x-netcore');await initRepo(root);
 const send=prompt=>h.run(h.scripts.hook,['--provider','claude'],{cwd:root,session_id:'s1',hook_event_name:'UserPromptSubmit',prompt});
 assert.equal(send('1').hookSpecificOutput,undefined);
 const sessions=path.join(root,'.agrimap-agent/runtime/sessions');await mkdir(sessions,{recursive:true});
 const lastCard={cardId:'s1-integration-1',kind:'integration',topic:'git/integration',risk:'R3',options:[{id:'1',label:'เปิด PR → develop'},{id:'2',label:'แก้ต่อ'}],recommended:'1',recordAs:'none',expiresAt:new Date(Date.now()+3600000).toISOString()};
 await writeFile(path.join(sessions,'s1.json'),JSON.stringify({lastCard,lastDelivery:{branch:'feature/x'}}));
 assert.match(send('1').hookSpecificOutput.additionalContext,/selects option 1 "เปิด PR → develop" of card s1-integration-1/);
 const question=send('merge ยังไง').hookSpecificOutput.additionalContext;
 assert.match(question,/question about integrate; answer it without running git actions/);assert.doesNotMatch(question,/integrate plan/);
 assert.match(send('merge').hookSpecificOutput.additionalContext,/integrate plan --intent integrate/);
});
test('completion stops appending Completed work unless the config opts in; logs are per execution and history reads old daily files',async t=>{
 const h=await fixture(t);await initRepo(h.temp);
 const run=title=>{const s=h.run(h.scripts.workspace,['start','--operation','execute','--session','c1','--requested-by','T','--report','--title',title]);const id=s.activeTask.executionId;
  h.run(h.scripts.workspace,['checkpoint','--session','c1','--execution',id,'--event','verified','--summary','ok']);h.run(h.scripts.workspace,['complete','--session','c1','--execution',id]);return id;};
 h.run(h.scripts.workspace,['init']);
 const first=run('First work');
 const project=path.join(h.temp,'.agrimap-agent/memory/project.md');
 assert.doesNotMatch(await readFile(project,'utf8'),/Completed work/);
 const logs=path.join(h.temp,'.agrimap-agent/logs');const period=(await readdir(logs))[0];const day=(await readdir(path.join(logs,period)))[0];
 assert.ok((await readdir(path.join(logs,period,day))).includes(`${first}.jsonl`));
 const config=path.join(h.temp,'.agrimap-agent/config.json');const c=JSON.parse(await readFile(config,'utf8'));c.memory.completedWorkInProjectMd=true;await writeFile(config,JSON.stringify(c));
 await new Promise(r=>setTimeout(r,1100));const second=run('Second work');
 assert.match(await readFile(project,'utf8'),new RegExp(`execution \`${second}\``));
 const legacy={...JSON.parse((await readFile(path.join(logs,period,day,`${first}.jsonl`),'utf8')).split('\n')[0]),execution_id:'legacy01',task_id:null};
 await writeFile(path.join(logs,period,`${day}.jsonl`),JSON.stringify(legacy)+'\n');
 const history=h.run(h.scripts.workspace,['history']);
 assert.ok(history.tasks.some(x=>x.executionId==='legacy01'));assert.ok(history.tasks.some(x=>x.executionId===first));
});
test('an integrated event after completed is a valid audit event',async t=>{
 const h=await fixture(t);await initRepo(h.temp);
 const s=h.run(h.scripts.workspace,['start','--operation','execute','--session','i1','--requested-by','T','--title','Integrate later']);const id=s.activeTask.executionId;
 h.run(h.scripts.workspace,['checkpoint','--session','i1','--execution',id,'--event','verified','--summary','ok']);h.run(h.scripts.workspace,['complete','--session','i1','--execution',id]);
 const logs=path.join(h.temp,'.agrimap-agent/logs');const period=(await readdir(logs))[0];const day=(await readdir(path.join(logs,period)))[0];
 const file=path.join(logs,period,day,`${id}.jsonl`);const completed=JSON.parse((await readFile(file,'utf8')).trim().split('\n').at(-1));
 await writeFile(file,(await readFile(file,'utf8'))+JSON.stringify({...completed,timestamp:new Date().toISOString(),event:'integrated',log_type:'result',message:'Integrated feature/x into develop',reason:'method=local-merge'})+'\n');
 const history=h.run(h.scripts.workspace,['history','--task',id]);
 assert.equal(history.invalidLines.length,0);assert.ok(history.tasks[0].events.includes('integrated'));
});
