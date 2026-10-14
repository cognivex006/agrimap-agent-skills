// Skill routing evals (4.9.5): requester prompt x repository lane -> one skill.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHarness,projectRoot} from '../helpers/harness.mjs';
import {initRepo} from '../helpers/git-fixture.mjs';
import {sqlContextToolAllowed} from '../../skills/agrimap-agent-skills/scripts/governance-policy.mjs';
import {applyAgentsRoutingSection,applyWorkspace,invocation,laneFromPath,loadRouting,planWorkspace,renderRoutingReference,repositoryLane,routeLine,routeRequest,WORKSPACE_MARKER} from '../../skills/agrimap-agent-skills/scripts/skill-routing.mjs';

const routing=loadRouting();
const present=p=>stat(p).then(()=>true,()=>false);
async function fixture(t){const h=await createHarness('agrimap-routing-');t.after(()=>h.cleanup());return h;}

// [repository lane, prompt, expected skill (null = no route), expected action or lanes]
const EVALS=[
 ['be-main','เพิ่ม column REMARK ใน LUT_APP_MESSAGES','agm-sql',{lanes:['sql']}],
 ['be-main','แก้ UM_USER_I ให้รับ email ด้วย','agm-sql',{action:'edit'}],
 ['sql','สร้าง view สรุปยอดขายรายเดือน','agm-sql',{action:'create'}],
 ['be-main','สร้าง view สรุปยอดขายรายเดือน','agm-sql',{}],
 ['fe-main','สร้าง view สรุปยอดขายรายเดือน','agm-fe',{}],
 ['be-main','เพิ่ม index ให้ ORDER_H','agm-sql',{}],
 ['be-main','ทำไม SP_ORDER_Q ช้า','agm-diagnose',{lanes:['sql']}],
 ['be-main','ช่วยดู store ตัวนี้หน่อย UM_USER_U','agm-sql',{action:'analyze'}],
 ['be-main','เพิ่ม message code ORDER_NOT_FOUND','agm-sql',{}],
 ['be-main','สร้าง SP ใหม่ตาม package เดิม','agm-sql',{action:'create'}],
 ['be-main','แก้ sp ให้ใช้ hook ของ user','agm-sql',{action:'edit'}],
 ['be-main','สร้าง stored proc สำหรับ insert order','agm-sql',{}],
 ['be-main','อธิบาย sp นี้','agm-sql',{action:'explain'}],
 ['be-main','อธิบายว่าทำไม SP นี้ต้องใช้ transaction','agm-sql',{action:'explain'}],
 ['be-main','Explain SQL joins',null,{}],
 ['be-main','What is a release in music?',null,{}],
 ['be-main','What does customer service mean?',null,{}],
 ['be-main','วันนี้อธิบาย SQL joins ให้หน่อย',null,{}],
 ['fe-main','เพิ่มคอลัมน์ในตารางหน้า user list','agm-fe',{lanes:['fe-main']}],
 ['fe-main','แก้ function calculateTotal','agm-fe',{action:'edit'}],
 ['be-main','แก้ function calculateTotal','agm-be',{lanes:['be-main']}],
 ['fe-main','แก้ routing ของหน้า dashboard','agm-fe',{}],
 ['be-main','ทำไม API /orders ตอบ 500','agm-diagnose',{}],
 ['be-main','แก้ bug ที่ API /orders ตอบ 500','agm-be',{action:'edit'}],
 ['be-main','แก้ bug ที่เกิดบน production','agm-be',{action:'edit'}],
 ['be-main','แก้ไข validation ในโค้ด service นี้','agm-be',{action:'edit'}],
 ['be-main','refactor OrderService ให้อ่านง่าย','agm-be',{action:'refactor'}],
 ['fe-main','เขียน unit test ให้ order-list component','agm-fe',{action:'test'}],
 ['be-library','เพิ่ม extension method ใหม่','agm-be',{lanes:['be-library']}],
 ['be-main','เพิ่ม API สร้าง order และ SP ORDER_H_I','agm-exec',{lanes:['sql','be-main']}],
 [null,'แก้ services/agmws-order-netcore/Controllers/OrderController.cs และ sql/ORDER/procedure/ORDER_H_I.sql','agm-exec',{lanes:['be-main','sql']}],
 ['be-main','แก้ `sql/ORDER/procedure/ORDER_H_I.sql` ให้คืน ORDER_ID','agm-sql',{action:'edit'}],
 [null,'แก้ agmwa-platform-ng/src/app/order/order-list.component.ts ให้แสดงวันที่','agm-fe',{lanes:['fe-main']}],
 [null,'ช่วยวางแผนย้าย notification service ไป queue','agm-plan',{}],
 ['be-main','ช่วยวางแผนเที่ยวสงกรานต์',null,{}],
 ['be-main','bump version production แล้วนำขึ้น jenkins','agm-release',{}],
 ['be-main','ตรวจรับงาน order ตาม acceptance','agm-qa',{}],
 ['be-main','ออกแบบระบบแยก service notification','agm-architect',{}],
 ['be-main','ขอดูโครงสร้างตาราง ORDER_H ใน database จริง','agm-sql',{supporting:['sql-context-pack']}],
 ['be-main','agm-sql สร้าง LUT_ORDER_STATUS','agm-sql',{}],
 ['be-main','merge ยังไง?',null,{}],
 [null,'สวัสดี วันนี้อากาศดี',null,{}],
 ['be-main','ตัวอย่าง: `$agm-sql action=edit`',null,{}],
 ['be-main','วิเคราะห์ว่าทำไมการสร้าง SQL ไม่ใช้ skill agm-sql',null,{}],
];

test('routing evals: Thai/English prompts pick one skill by intent x lane (4.9.5)',()=>{
 const failures=[];
 for(const [repoLane,prompt,skill,expect] of EVALS){
  const d=routeRequest(routing,{prompt,repoLane});
  const got=d.codeEvidence||d.reason==='named-skill'?d.skill:null;
  const ok=got===skill&&(!expect.action||d.action===expect.action)
   &&(!expect.lanes||JSON.stringify([...d.lanes].sort())===JSON.stringify([...expect.lanes].sort()))
   &&(!expect.supporting||JSON.stringify(d.supporting)===JSON.stringify(expect.supporting));
  if(!ok)failures.push(`${prompt} [${repoLane}] -> ${got} ${d.action||''} ${d.lanes.join('+')} (${d.reason})`);
 }
 assert.deepEqual(failures,[]);
});

test('sql-context-pack: owner request owns the turn, data questions stay supporting (4.9.5)',()=>{
 for(const prompt of ['$sql-context-pack export ทั้งหมด','/sql-context-pack:sql-context-pack sync','ใช้ sql-context-pack sync metadata ของ profile นี้','$sql-content-pack export UM_USER']){
  const d=routeRequest(routing,{prompt,repoLane:'be-main'});
  assert.equal(d.owner,'sql-context-pack',prompt);
  assert.match(routeLine(routing,d),/that package's turn: follow its own SKILL and approval gates/);
 }
 for(const prompt of ['ขอดูข้อมูลจริงของ ORDER_H','ใช้ sql-context-pack ดู column ของ UM_USER']){
  const d=routeRequest(routing,{prompt,repoLane:'be-main'});
  assert.equal(d.owner,null,prompt);assert.deepEqual(d.supporting,['sql-context-pack'],prompt);
 }
 // A quoted owner command is an example, never an owner turn.
 assert.equal(routeRequest(routing,{prompt:'อธิบายคำสั่ง `$sql-context-pack export` หน่อย',repoLane:'be-main'}).owner,null);
 const sql=routing.raw.supporting.find(item=>item.id==='sql-context-pack');
 for(const tool of sql.readOnlyTools)assert.equal(sqlContextToolAllowed(tool),true,tool);
 for(const tool of ['sqlctx_export_batch','sqlctx_sync_context_index','sqlctx_apply_routine_deployment','sqlctx_connect_profile','sqlctx_sqlfluff_ensure'])assert.equal(sqlContextToolAllowed(tool),false,tool);
 // 5.0.1: only agm-sql context migrate exports, and never syncs, classifies, deploys or connects.
 for(const tool of sql.migrateTools)assert.equal(sqlContextToolAllowed(tool,{action:'context-migrate'}),true,tool);
 for(const tool of ['sqlctx_sync_context_index','sqlctx_apply_folder_classification','sqlctx_submit_classification_proposals','sqlctx_apply_routine_deployment','sqlctx_connect_profile','sqlctx_change_profile'])assert.equal(sqlContextToolAllowed(tool,{action:'context-migrate'}),false,tool);
 assert.equal(sqlContextToolAllowed('sqlctx_export_batch',{action:'edit'}),false);
 assert.match(sql.supportingRule,/export only through agm-sql context migrate/);assert.match(sql.migrateRule,/never syncs DB_METADATA_CONTEXT/);
});

test('lanes from paths and repositories; host invocations per host',()=>{
 assert.equal(laneFromPath(routing,'sql/ORDER/procedure/ORDER_H_I.sql','be-main'),'sql');
 assert.equal(laneFromPath(routing,'Controllers/OrderController.cs','be-main'),'be-main');
 assert.equal(laneFromPath(routing,'Templates/Mail.html','be-main'),'be-main');
 assert.equal(laneFromPath(routing,'src/app/order/order.component.ts','fe-main'),'fe-main');
 assert.equal(laneFromPath(routing,'libraries/netcore/AgriMap.Platform.Core/X.cs',null),'be-library');
 assert.equal(laneFromPath(routing,'README.md','be-main'),null);
 assert.equal(repositoryLane(routing,{names:['agmbo-publisher-netcore']}),'be-main');
 assert.equal(repositoryLane(routing,{names:['web'],rootEntries:['angular.json','src']}),'fe-main');
 assert.equal(repositoryLane(routing,{names:['ui-lib'],rootEntries:['angular.json','projects']}),'fe-library');
 assert.equal(repositoryLane(routing,{names:['database'],rootEntries:['sqlserver']}),'sql');
 assert.equal(invocation(routing,'claude','agm-sql'),'agrimap-agent-skills:agm-sql');
 assert.equal(invocation(routing,'codex','agm-sql'),'$agm-sql');
 assert.equal(invocation(routing,'antigravity','agm-sql'),'/agm-sql');
});

test('generated routing artifacts match the registry (reference, bootstrap §0)',async()=>{
 const skill=path.join(projectRoot,'skills/agrimap-agent-skills');
 assert.equal(await readFile(path.join(skill,'references/skill-routing.md'),'utf8'),renderRoutingReference(routing));
 const agents=await readFile(path.join(skill,'assets/bootstrap/AGENTS.md'),'utf8');
 assert.equal(applyAgentsRoutingSection(agents,routing),agents);
 assert.match(agents,/^## 0\. Skill-first routing/m);
 assert.match(agents,/agrimap-agent-skills:agm-sql/);
 assert.doesNotMatch(agents,/แถวแรกที่ตรง/);
 const index=await readFile(path.join(skill,'references/operation-index.md'),'utf8');
 assert.doesNotMatch(index,/Never combine multiple operation skills implicitly/);
 const config=JSON.parse(await readFile(path.join(projectRoot,'config/operations.json'),'utf8'));
 for(const op of config.operations){
  const alias=await readFile(path.join(projectRoot,'plugins/agrimap-agent-skills/skills',op.name,'SKILL.md'),'utf8');
  const description=alias.split('\n')[2];
  assert.ok(description.includes(op.triggers),op.name);
  assert.ok(!/:\s/.test(description.slice('description: '.length)),`${op.name} description must stay a plain YAML scalar`);
  assert.ok(description.length<1024,op.name);
 }
});

test('hook: routed skill line in and outside a repository; owner turn drops the AgriMap SQL prohibition',async t=>{
 const h=await fixture(t);
 const ws=await initRepo(path.join(h.temp,'agmws-orders-netcore'));
 const send=(cwd,prompt,provider='claude')=>h.run(h.scripts.hook,['--provider',provider,'--mode','task'],{cwd,session_id:'r1',hook_event_name:'UserPromptSubmit',prompt}).hookSpecificOutput?.additionalContext||'';
 const diagnose=send(ws,'ทำไม SP_ORDER_Q ช้า');
 assert.match(diagnose,/Skill for this turn: agrimap-agent-skills:agm-diagnose \(lane sql · intent diagnose\)/);
 assert.match(diagnose,/Inside AgriMap operations SQL context is read-only/);
 assert.doesNotMatch(diagnose,/AgriMap 3\.0/);
 const owner=send(ws,'$sql-context-pack export ทั้งหมด');
 assert.match(owner,/Explicit sql-context-pack request/);
 assert.doesNotMatch(owner,/Inside AgriMap operations SQL context is read-only/);
 assert.equal(send(ws,'merge ยังไง?'),'');
 await initRepo(path.join(h.temp,'agmwa-platform-ng'));
 const outside=send(h.temp,'แก้ agmwa-platform-ng/src/app/order/order-list.component.ts ให้แสดงวันที่','codex');
 assert.match(outside,/Skill for this turn: \$agm-fe \(lane fe-main · intent change → action edit\)/);
 assert.match(outside,/Workspace routing: this folder has no AGENTS\.md/);
});

test('workspace routing: plan, apply, idempotent rerun, conflict and repository refusal',async t=>{
 const h=await fixture(t);
 await initRepo(path.join(h.temp,'services','agmws-orders-netcore'));
 await initRepo(path.join(h.temp,'apps','web','agmwa-platform-ng'));
 const plan=await planWorkspace(routing,h.temp,'4.9.5');
 assert.equal(plan.ok,true);
 assert.deepEqual(plan.files.map(f=>[path.basename(f.path),f.status]),[['AGENTS.md','create'],['CLAUDE.md','create']]);
 assert.equal(await present(path.join(h.temp,'AGENTS.md')),false,'plan never writes');
 const applied=await applyWorkspace(routing,h.temp,'4.9.5');
 assert.equal(applied.applied,true);
 const agents=await readFile(path.join(h.temp,'AGENTS.md'),'utf8');
 assert.ok(agents.includes(WORKSPACE_MARKER));
 assert.match(agents,/\| `services\/agmws-orders-netcore` \| `be-main` → `agm-be` \|/);
 assert.match(agents,/\| `apps\/web\/agmwa-platform-ng` \| `fe-main` → `agm-fe` \|/);
 assert.match(await readFile(path.join(h.temp,'CLAUDE.md'),'utf8'),/^@AGENTS\.md$/m);
 assert.deepEqual((await planWorkspace(routing,h.temp,'4.9.5')).files.map(f=>f.status),['unchanged','unchanged']);
 await writeFile(path.join(h.temp,'AGENTS.md'),'Team rules\n');
 const conflict=await applyWorkspace(routing,h.temp,'4.9.5');
 assert.equal(conflict.code,'WORKSPACE_FILE_CONFLICT');
 assert.equal(await readFile(path.join(h.temp,'AGENTS.md'),'utf8'),'Team rules\n');
 assert.equal((await planWorkspace(routing,path.join(h.temp,'services','agmws-orders-netcore'))).code,'WORKSPACE_IS_REPOSITORY');
});
