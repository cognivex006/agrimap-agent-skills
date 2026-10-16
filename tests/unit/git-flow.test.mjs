import assert from 'node:assert/strict';
import test from 'node:test';
import {cp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHarness,projectRoot} from '../helpers/harness.mjs';
import {createGitFixture,cloneRemote,gitIn} from '../helpers/git-fixture.mjs';
import {defaultRun} from '../../skills/agrimap-agent-skills/scripts/run-command.mjs';
import {compareUrl,planIntegration,applyIntegration,prDecision} from '../../skills/agrimap-agent-skills/scripts/git-flow.mjs';
import {initPolicy,loadPolicy} from '../../skills/agrimap-agent-skills/scripts/workflow-policy.mjs';

const present=p=>stat(p).then(()=>true,()=>false);
async function fixture(t){const h=await createHarness('agm-flow-');t.after(()=>h.cleanup());return h;}

// A product repository on develop with AGENTS.md and a confirmed policy pushed.
async function project(h,{name='repo',method='pull-request',files={},changelog=false}={}){
  const f=await createGitFixture(h,{name,files:{'AGENTS.md':'# Rules\n',...(changelog?{'CHANGELOG.md':'# Changelog\n'}:{}),...files}});
  f.git(['switch','-q','develop']);
  await initPolicy(f.repo,'gitflow',{integration:{method}},'owner');
  f.git(['add','--','.agrimap-agent']);f.git(['commit','-q','-m','chore: workflow policy']);f.git(['push','-q','origin','develop']);
  return bind(h,f.repo,f.remote);
}
function bind(h,repo,remote){
  const cli=(args,cwd=repo)=>JSON.parse(h.spawn(h.scripts.workspace,[...args,'--cwd',repo],undefined,cwd).stdout);
  const ack=session=>{const c=cli(['context','--session',session]);return cli(['context','--session',session,'--ack',c.chain.filter(e=>c.readRequired.includes(e.relative)).map(e=>e.sha12).join(',')]);};
  return {repo,remote,git:args=>gitIn(repo,args),cli,ack};
}
async function startWork(p,{session='s1',slug='order-export',title='เพิ่มการส่งออกคำสั่งซื้อ',type='feature'}={}){
  p.ack(session);
  const started=p.cli(['start','--operation','execute','--session',session,'--requested-by','Tester','--title',title]);
  assert.equal(started.ok,true,JSON.stringify(started));
  const plan=p.cli(['branch','plan','--session',session,'--type',type,'--slug',slug]);
  const applied=p.cli(['branch','apply','--session',session,'--type',type,'--slug',slug,'--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));
  return {executionId:started.activeTask.executionId,plan,applied};
}
function verify(p,session,executionId,status='passed'){
  return p.cli(['checkpoint','--session',session,'--execution',executionId,'--event','verified','--summary','tests run','--status',status]);
}
function deliver(p,session,extra=[]){
  const plan=p.cli(['deliver','plan','--session',session,...extra]);
  if(!plan.planHash)return {plan};
  return {plan,applied:p.cli(['deliver','apply','--session',session,'--plan-hash',plan.planHash,...extra])};
}

test('develop -> feature branch -> commit + push with remote verified; develop untouched (AC3, git-flow 1/10)',async t=>{
  const h=await fixture(t);const p=await project(h);
  const developBefore=p.git(['rev-parse','develop']);const remoteDevelop=p.git(['rev-parse','origin/develop']);
  const {executionId,plan}=await startWork(p);
  assert.equal(plan.action,'create');assert.equal(plan.baseSha,remoteDevelop);
  assert.equal(p.git(['branch','--show-current']),'feature/order-export');
  await writeFile(path.join(p.repo,'export.js'),'export const csv = () => "";\n');
  verify(p,'s1',executionId);
  const {plan:dplan,applied}=deliver(p,'s1');
  assert.equal(applied.ok,true,JSON.stringify(applied));
  assert.match(dplan.message.header,/^feature: \S.*$/u,'team commit style: <type>: <plain description>, no scope');
  const body=p.git(['log','-1','--format=%B']);
  assert.match(body,new RegExp(`AGM-Execution: ${executionId}`));
  assert.equal(applied.remoteSha,p.git(['rev-parse','HEAD']));assert.equal(applied.remoteVerified,true);
  assert.equal(p.git(['rev-parse','develop']),developBefore);
  assert.equal(gitIn(p.remote,['rev-parse','develop']),remoteDevelop);
  // Idempotent: only audit logs changed since, so no second commit.
  const again=deliver(p,'s1');
  assert.equal(again.plan.commit,false);
  assert.equal(p.git(['rev-parse','HEAD']),applied.commit);
});

test('dirty base carries files, pre-existing dirt is never delivered, mixed asks, runtime excluded (AC4, git-flow 2/6)',async t=>{
  const h=await fixture(t);const p=await project(h,{files:{'notes.md':'a\n','shared.md':'a\n'}});
  await writeFile(path.join(p.repo,'notes.md'),'local edit\n');
  await writeFile(path.join(p.repo,'shared.md'),'before start\n');
  p.ack('s1');
  const started=p.cli(['start','--operation','execute','--session','s1','--requested-by','Tester','--title','เพิ่มการส่งออก']);
  assert.deepEqual(started.activeTask.preexistingDirty.map(e=>e.path).sort(),['notes.md','shared.md']);
  const plan=p.cli(['branch','plan','--session','s1','--type','feature','--slug','export']);
  assert.equal(plan.action,'create-carry');assert.ok(plan.warnings.some(w=>w.code==='BASE_NOT_REFRESHED_DIRTY'));
  p.cli(['branch','apply','--session','s1','--type','feature','--slug','export','--plan-hash',plan.planHash]);
  assert.equal(await readFile(path.join(p.repo,'notes.md'),'utf8'),'local edit\n');
  await writeFile(path.join(p.repo,'export.js'),'x\n');
  await writeFile(path.join(p.repo,'shared.md'),'before start\nand this work\n');
  verify(p,'s1',started.activeTask.executionId);
  const mixed=p.cli(['deliver','plan','--session','s1']);
  assert.equal(mixed.card.topic,'git/delivery-mixed');assert.equal(mixed.planHash,null);
  const {plan:dplan,applied}=deliver(p,'s1',['--mixed','exclude']);
  assert.equal(applied.ok,true,JSON.stringify(applied));
  const committed=p.git(['show','--name-only','--format=','HEAD']).split('\n');
  assert.ok(committed.includes('export.js'));
  assert.ok(!committed.includes('notes.md')&&!committed.includes('shared.md'));
  assert.ok(!committed.some(f=>f.startsWith('.agrimap-agent/runtime/')||f.startsWith('.agrimap-agent/memory/current/')));
  assert.ok(committed.some(f=>/^\.agrimap-agent\/logs\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d+\.jsonl$/.test(f)));
  assert.ok(dplan.paths.foreign.includes('notes.md'));
});

test('host branches push under the team name or rename; collisions get a suffix; stale plans refuse (git-flow 3/4/5)',async t=>{
  const h=await fixture(t);const p=await project(h);
  p.git(['switch','-q','-c','claude/abc']);
  p.ack('s1');p.cli(['start','--operation','execute','--session','s1','--requested-by','Tester','--title','x']);
  let plan=p.cli(['branch','plan','--session','s1','--type','feature','--slug','host-work']);
  assert.equal(plan.action,'host-keep');assert.equal(plan.remoteBranch,'feature/host-work');assert.deepEqual(plan.commands,[]);
  p.cli(['policy','set','--key','branching.hostWorktreeBranch','--value','rename','--requested-by','owner']);
  plan=p.cli(['branch','plan','--session','s1','--type','feature','--slug','host-work']);
  assert.deepEqual(plan.commands,[['git','branch','-m','feature/host-work']]);
  p.git(['switch','-q','develop']);p.git(['branch','feature/taken']);
  plan=p.cli(['branch','plan','--session','s1','--type','feature','--slug','taken']);
  assert.equal(plan.branch,'feature/taken-2');
  await writeFile(path.join(p.repo,'new.txt'),'x\n');
  const stale=p.cli(['branch','apply','--session','s1','--type','feature','--slug','taken','--plan-hash',plan.planHash]);
  assert.equal(stale.code,'PLAN_STALE');
});

test('delivery gates: protected branch, missing ack, secrets without values, changelog, local path leak (git-flow 7/8/9)',async t=>{
  const h=await fixture(t);const p=await project(h,{changelog:true});
  p.ack('s1');
  const started=p.cli(['start','--operation','execute','--session','s1','--requested-by','Tester','--title','แก้ปัญหาการบันทึก']);
  await writeFile(path.join(p.repo,'a.js'),'x\n');
  assert.equal(p.cli(['deliver','plan','--session','s1']).code,'PROTECTED_BRANCH');
  assert.equal(p.cli(['deliver','plan','--session','other']).code,'NO_ACTIVE_EXECUTION');
  const plan=p.cli(['branch','plan','--session','s1','--type','fix','--slug','gates']);
  // 5.0.1: a fix still branches as feature/ and keeps fix as its commit type.
  assert.equal(plan.branch,'feature/gates');assert.equal(plan.workType,'feature');assert.equal(plan.changeType,'fix');
  p.cli(['branch','apply','--session','s1','--type','fix','--slug','gates','--plan-hash',plan.planHash]);
  await writeFile(path.join(p.repo,'AGENTS.md'),'# Rules changed\n');
  assert.equal(p.cli(['deliver','plan','--session','s1']).code,'INSTRUCTIONS_NOT_ACKNOWLEDGED');
  gitIn(p.repo,['checkout','--','AGENTS.md']);
  const secret='SyntheticSecret'+'Value123';
  await writeFile(path.join(p.repo,'config.js'),`const password = "${secret}";\n`);
  const suspected=p.cli(['deliver','plan','--session','s1']);
  assert.equal(suspected.code,'SECRET_SUSPECTED');assert.equal(suspected.card.risk,'R3');
  assert.ok(!JSON.stringify(suspected).includes(secret));
  assert.deepEqual(suspected.findings,[{path:'config.js',line:1,kind:'CREDENTIAL'}]);
  assert.equal(p.cli(['deliver','plan','--session','s1','--exclude-paths','config.js']).code,'CHANGELOG_REQUIRED');
  const na=p.cli(['deliver','plan','--session','s1','--exclude-paths','config.js','--changelog-na','internal refactor']);
  assert.equal(na.ok,true);assert.ok(!na.paths.own.includes('config.js'));
  // Local memory paths never reach committed files; force-added local memory is excluded.
  const external=path.join(h.temp,'orders-spec');await mkdir(external);
  p.cli(['local','set-path','--kind','repo','--id','orders-spec','--path',external]);
  await writeFile(path.join(p.repo,'doc.md'),`see ${external.replaceAll('\\','/')}\n`);
  const leak=p.cli(['deliver','plan','--session','s1','--exclude-paths','config.js','--changelog-na','x']);
  assert.equal(leak.code,'LOCAL_PATH_LEAK');assert.deepEqual(leak.leaks,[{path:'doc.md',line:1}]);
  await writeFile(path.join(p.repo,'doc.md'),'see spec orders-spec\n');
  gitIn(p.repo,['add','-f','--','.agrimap-agent/local/memory.md']);
  const ok=p.cli(['deliver','plan','--session','s1','--exclude-paths','config.js','--changelog-na','x']);
  assert.ok(!ok.paths.own.some(f=>f.startsWith('.agrimap-agent/local/')));
  assert.ok(ok.warnings.some(w=>w.code==='LOCAL_MEMORY_TRACKED'));
  // Prompt history is local only (5.0.1): never delivered, and a tracked copy is reported.
  await mkdir(path.join(p.repo,'.agrimap-agent','prompts','2026-10','c1'),{recursive:true});
  await writeFile(path.join(p.repo,'.agrimap-agent','prompts','2026-10','c1','history.md'),'### [2026-10-14 09:00:00]\nแก้ export\n');
  assert.match(await readFile(path.join(p.repo,'.agrimap-agent','.gitignore'),'utf8'),/^prompts\/$/m);
  gitIn(p.repo,['add','-f','--','.agrimap-agent/prompts/2026-10/c1/history.md']);
  const prompts=p.cli(['deliver','plan','--session','s1','--exclude-paths','config.js','--changelog-na','x']);
  assert.ok(!prompts.paths.own.some(f=>f.startsWith('.agrimap-agent/prompts/')));
  assert.ok(prompts.warnings.some(w=>w.code==='PROMPT_HISTORY_TRACKED'));
  assert.equal(started.ok,true);
});

test('failed verification still delivers the work branch with a trailer and offers no merge (AC22, git-flow 7)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  const {executionId}=await startWork(p,{slug:'unverified'});
  await writeFile(path.join(p.repo,'b.js'),'x\n');
  verify(p,'s1',executionId,'failed');
  const {plan,applied}=deliver(p,'s1');
  assert.ok(plan.warnings.some(w=>w.code==='DELIVERED_UNVERIFIED'));
  assert.equal(applied.ok,true);assert.equal(applied.remoteVerified,true);
  assert.match(p.git(['log','-1','--format=%B']),/AGM-Verification: failed/);
  const options=p.cli(['integrate','options','--session','s1']);
  assert.equal(options.card.options[0].value,'continue');
  assert.ok(!options.card.options.some(o=>o.value==='integrate'));
  const merge=p.cli(['integrate','plan','--session','s1','--intent','integrate']);
  assert.equal(merge.card.topic,'git/integrate-unverified');
});

test('remote work branch ahead is REMOTE_AHEAD (git-flow 11)',async t=>{
  const h=await fixture(t);const p=await project(h);
  const {executionId}=await startWork(p,{slug:'ahead'});
  await writeFile(path.join(p.repo,'c.js'),'x\n');verify(p,'s1',executionId);
  const first=deliver(p,'s1').applied;assert.equal(first.ok,true);
  const other=await cloneRemote(h,p.remote,'other');
  gitIn(other,['switch','-q','feature/ahead']);await writeFile(path.join(other,'d.js'),'y\n');
  gitIn(other,['add','--','d.js']);gitIn(other,['commit','-q','-m','feat: other']);gitIn(other,['push','-q','origin','feature/ahead']);
  await writeFile(path.join(p.repo,'c.js'),'x2\n');
  const again=deliver(p,'s1',['--input',await messageFile(h)]).applied;
  assert.equal(again.code,'REMOTE_AHEAD');
});
async function messageFile(h){const f=path.join(h.temp,'message.json');await writeFile(f,JSON.stringify({type:'feat',scope:'orders',subject:'งานต่อเนื่อง'}));return f;}

async function deliveredBranch(p,{session,slug,file,content='x\n'}){
  const {executionId}=await startWork(p,{session,slug,title:`ส่งงานส่วน ${slug}`});
  await writeFile(path.join(p.repo,file),content);verify(p,session,executionId);
  const {applied}=deliver(p,session);assert.equal(applied.ok,true,JSON.stringify(applied));
  p.cli(['complete','--session',session,'--execution',executionId]);
  return applied;
}

test('short reply "1" then local merge: merge commit on origin/develop, branch tree, no checkout of develop (AC5, git-flow 12)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  const applied=await deliveredBranch(p,{session:'s1',slug:'merge-me',file:'m.js'});
  const options=p.cli(['integrate','options','--session','s1']);
  assert.equal(options.card.options[0].value,'integrate');
  const hook=h.run(h.scripts.hook,['--provider','claude'],{cwd:p.repo,session_id:'s1',hook_event_name:'UserPromptSubmit',prompt:'1'});
  assert.match(hook.hookSpecificOutput.additionalContext,/selects option 1/);
  const oldDevelop=p.git(['rev-parse','origin/develop']);
  const plan=p.cli(['integrate','plan','--session','s1','--intent','integrate']);
  assert.equal(plan.needsMerge,false);assert.equal(plan.verificationRequired,false);
  const result=p.cli(['integrate','apply','--session','s1','--intent','integrate','--plan-hash',plan.planHash]);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.remoteVerified,true);
  const merge=gitIn(p.remote,['rev-parse','develop']);
  assert.equal(gitIn(p.remote,['rev-parse',`${merge}^1`]),oldDevelop);
  assert.equal(gitIn(p.remote,['rev-parse',`${merge}^2`]),applied.commit);
  assert.equal(gitIn(p.remote,['rev-parse',`${merge}^{tree}`]),p.git(['rev-parse',`${applied.commit}^{tree}`]));
  assert.equal(p.git(['branch','--show-current']),'feature/merge-me');
  assert.equal(result.card?.card?.topic||result.card?.topic,'git/delete-branch');
});

test('audit written after delivery rides with the next delivery instead of becoming preexisting (R1, AC24)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  const first=await deliveredBranch(p,{session:'s1',slug:'residue',file:'one.js'});
  const plan=p.cli(['integrate','plan','--session','s1','--intent','integrate']);
  assert.equal(p.cli(['integrate','apply','--session','s1','--intent','integrate','--plan-hash',plan.planHash]).ok,true);
  const residue=p.git(['status','--porcelain','--untracked-files=all']).match(/\.agrimap-agent\/logs\/\S+/g)||[];
  assert.ok(residue.length,'integrate/complete leave audit dirty');
  p.ack('s2');
  const started=p.cli(['start','--operation','execute','--session','s2','--requested-by','Tester','--title','งานรอบที่สอง']);
  assert.equal(started.ok,true,JSON.stringify(started));
  assert.ok(!started.activeTask.preexistingDirty.some(e=>e.path.startsWith('.agrimap-agent/logs/')));
  const bplan=p.cli(['branch','plan','--session','s2','--type','feature','--slug','residue','--mode','current']);
  p.cli(['branch','apply','--session','s2','--type','feature','--slug','residue','--mode','current','--plan-hash',bplan.planHash]);
  await writeFile(path.join(p.repo,'two.js'),'y'+String.fromCharCode(10));verify(p,'s2',started.activeTask.executionId);
  const {applied}=deliver(p,'s2');
  assert.equal(applied.ok,true,JSON.stringify(applied));assert.notEqual(applied.commit,first.commit);
  const committed=p.git(['show','--name-only','--format=','HEAD']).split(String.fromCharCode(10));
  for(const file of residue)assert.ok(committed.includes(file),`${file} committed`);
});

test('two branches delivered the same day merge into develop without .agrimap-agent conflicts (AC7, git-flow 13)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  // Second developer works in another clone on the same day.
  const clone=await cloneRemote(h,p.remote,'dev-two');gitIn(clone,['switch','-q','develop']);
  const q=bind(h,clone,p.remote);
  await deliveredBranch(p,{session:'s1',slug:'first',file:'one.js'});
  // Execution ids are second-resolution run ids; two real developers do not
  // start in the same second, fast CI runners can.
  await new Promise(resolve=>setTimeout(resolve,1100));
  await deliveredBranch(q,{session:'s2',slug:'second',file:'two.js'});
  let plan=p.cli(['integrate','plan','--session','s1','--intent','integrate']);
  assert.equal(p.cli(['integrate','apply','--session','s1','--intent','integrate','--plan-hash',plan.planHash]).ok,true);
  plan=q.cli(['integrate','plan','--session','s2','--intent','integrate']);
  assert.equal(plan.needsMerge,true);assert.equal(plan.verificationRequired,true);
  const staged=q.cli(['integrate','apply','--session','s2','--intent','integrate','--plan-hash',plan.planHash]);
  assert.equal(staged.ok,true,JSON.stringify(staged));assert.equal(staged.next.action,'run-verification');
  const final=q.cli(['integrate','apply','--session','s2','--intent','integrate','--stage','push']);
  assert.equal(final.ok,true,JSON.stringify(final));
  const files=gitIn(p.remote,['ls-tree','-r','--name-only','develop']).split('\n');
  assert.ok(files.includes('one.js')&&files.includes('two.js'));
  assert.equal(await present(path.join(clone,'.git','MERGE_HEAD')),false);
});

test('conflicts abort cleanly and a moved target is REMOTE_TARGET_ADVANCED with local refs unchanged (git-flow 14/15)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge',files:{'shared.js':'base\n'}});
  await deliveredBranch(p,{session:'s1',slug:'conflict',file:'shared.js',content:'mine\n'});
  const other=await cloneRemote(h,p.remote,'other');
  gitIn(other,['switch','-q','develop']);await writeFile(path.join(other,'shared.js'),'theirs\n');
  gitIn(other,['commit','-q','-am','fix: theirs']);gitIn(other,['push','-q','origin','develop']);
  const plan=p.cli(['integrate','plan','--session','s1','--intent','integrate']);
  const conflict=p.cli(['integrate','apply','--session','s1','--intent','integrate','--plan-hash',plan.planHash]);
  assert.equal(conflict.code,'MERGE_CONFLICT');assert.deepEqual(conflict.conflicts,['shared.js']);
  assert.equal(await present(path.join(p.repo,'.git','MERGE_HEAD')),false);

  const q=await project(h,{name:'race',method:'local-merge'});
  await deliveredBranch(q,{session:'s1',slug:'race',file:'r.js'});
  const racePlan=q.cli(['integrate','plan','--session','s1','--intent','integrate']);
  const racer=await cloneRemote(h,q.remote,'racer');
  gitIn(racer,['switch','-q','develop']);await writeFile(path.join(racer,'z.js'),'z\n');
  gitIn(racer,['add','--','z.js']);gitIn(racer,['commit','-q','-m','feat: race']);gitIn(racer,['push','-q','origin','develop']);
  const before=[q.git(['rev-parse','feature/race']),q.git(['rev-parse','develop']),q.git(['rev-parse','origin/develop'])];
  const raced=q.cli(['integrate','apply','--session','s1','--intent','integrate','--plan-hash',racePlan.planHash]);
  assert.equal(raced.code,'REMOTE_TARGET_ADVANCED');
  assert.deepEqual([q.git(['rev-parse','feature/race']),q.git(['rev-parse','develop']),q.git(['rev-parse','origin/develop'])],before);
});

test('open-pr without a forge CLI returns a manual compare URL; URLs are correct for GitHub and GitLab (git-flow 16)',async t=>{
  const h=await fixture(t);const p=await project(h);
  await deliveredBranch(p,{session:'s1',slug:'manual',file:'x.js'});
  const plan=p.cli(['integrate','plan','--session','s1','--intent','open-pr']);
  assert.equal(plan.status,'manual-pr');
  assert.equal(compareUrl('auto','https://github.com/o/r.git','feature/x','develop'),'https://github.com/o/r/compare/develop...feature/x?expand=1');
  assert.equal(compareUrl('auto','git@github.com:o/r.git','feature/x','develop'),'https://github.com/o/r/compare/develop...feature/x?expand=1');
  assert.equal(compareUrl('auto','git@gitlab.example.com:g/r.git','feature/x','develop'),'https://gitlab.example.com/g/r/-/merge_requests/new?merge_request%5Bsource_branch%5D=feature%2Fx&merge_request%5Btarget_branch%5D=develop');
});

test('stubbed gh: CLEAN merges, BLOCKED stops, pending asks, never --admin (git-flow 17)',async t=>{
  const h=await fixture(t);const p=await project(h);
  await deliveredBranch(p,{session:'s1',slug:'pr-flow',file:'y.js'});
  const delivery=JSON.parse(await readFile(path.join(p.repo,'.agrimap-agent/runtime/sessions/s1.json'),'utf8')).lastDelivery;
  const policy=(await loadPolicy(p.repo)).policy;
  const calls=[];
  const stub=view=>(command,args,options)=>{
    if(command==='gh'){
      calls.push(args);
      if(args[0]==='auth')return {ok:true,stdout:'',stderr:''};
      if(args[1]==='list')return {ok:true,stdout:JSON.stringify([{number:7,url:'https://github.com/o/r/pull/7'}]),stderr:''};
      if(args[1]==='view')return {ok:true,stdout:JSON.stringify(view),stderr:''};
      if(args[1]==='merge')return {ok:true,stdout:'',stderr:''};
    }
    if(command==='git'&&args.join(' ')==='remote get-url origin')return {ok:true,stdout:'https://github.com/o/r.git\n',stderr:''};
    return defaultRun(command,args,options);
  };
  const base={root:p.repo,state:path.join(p.repo,'.agrimap-agent'),policy,delivery,intent:'integrate',ackRequired:[],fetch:false};
  const clean=stub({mergeStateStatus:'CLEAN',reviewDecision:'APPROVED',statusCheckRollup:[{status:'COMPLETED',conclusion:'SUCCESS'}],url:'u'});
  const plan=await planIntegration({...base,run:clean});
  await applyIntegration({...base,run:clean,planHash:plan.planHash});
  assert.ok(calls.some(a=>a.join(' ')==='pr merge 7 --merge'));
  const blocked=await planIntegration({...base,run:stub({mergeStateStatus:'BLOCKED',reviewDecision:'REVIEW_REQUIRED',statusCheckRollup:[]})});
  assert.equal(blocked.code,'PR_BLOCKED');
  const pending=await planIntegration({...base,run:stub({mergeStateStatus:'BLOCKED',statusCheckRollup:[{status:'IN_PROGRESS'}]})});
  assert.equal(pending.card.topic,'git/pr-pending');
  assert.equal(prDecision({mergeStateStatus:'BLOCKED',statusCheckRollup:[{status:'IN_PROGRESS'}]},{whenGreen:true}).decision,'auto-merge');
  assert.ok(!calls.flat().includes('--admin'));
});

test('scripts never force push, add all, stash, reset, clone or check out (AC8)',async()=>{
  for(const file of ['git-flow.mjs','governance-commands.mjs','workflow-policy.mjs','instruction-chain.mjs','project-profile.mjs','spec-sync.mjs','spec-adapters.mjs','yaml-lines.mjs']){
    const source=await readFile(path.join(projectRoot,'skills/agrimap-agent-skills/scripts',file),'utf8');
    for(const forbidden of ['"--force"','"-f"','"--force-with-lease"','"--mirror"','"-A"','"--all"','"stash"','"reset"','"clone"','"checkout"','"worktree", "add"','"--admin"','execSync(','shell: true']){
      assert.ok(!source.includes(forbidden),`${file} contains ${forbidden}`);
    }
    assert.ok(!/"add", "\."/.test(source),`${file} stages everything`);
  }
});

// ------------------------------------------------------------ spec sync gate (P2)

const PACK_FIXTURE=path.join(projectRoot,'tests','fixtures','spec-pack-morynth');
async function writeProfile(repo,profile){
  await mkdir(path.join(repo,'.agrimap-agent','policy'),{recursive:true});
  await writeFile(path.join(repo,'.agrimap-agent','policy','project.json'),JSON.stringify({schemaVersion:1,status:'confirmed',confirmedBy:'owner',confirmedAt:'2026-09-19',decisionRef:null,inference:null,hybrid:{newWork:'spec-first'},...profile},null,2));
}
// Spec-first product repo whose pack lives in specs/pack (kind repo).
async function specFirst(h,{enforcement='warn',mode='spec-first',sync='auto',tasksEdit=null}={}){
  const p=await project(h,{name:`web-${mode}-${enforcement}`});
  await cp(PACK_FIXTURE,path.join(p.repo,'specs','pack'),{recursive:true});
  if(tasksEdit){const f=path.join(p.repo,'specs/pack/06-agent/TASKS.yaml');await writeFile(f,tasksEdit(await readFile(f,'utf8')));}
  await writeProfile(p.repo,{developmentMode:mode,specs:{sources:[{id:'demo-console',kind:'repo',path:'specs/pack',format:'morynth-context-index@1'}],scopes:[{source:'demo-console',covers:['src/**']}],sync,enforcement}});
  p.git(['add','--','specs','.agrimap-agent']);p.git(['commit','-q','-m','docs: spec pack']);p.git(['push','-q','origin','develop']);
  return p;
}

test('spec-first delivery self-fixes SPEC_NOT_SYNCED, then commits code and spec together (AC18, 19.19 #7)',async t=>{
  const h=await fixture(t);const p=await specFirst(h);
  const {executionId}=await startWork(p,{slug:'registry-summary'});
  const context=p.cli(['spec','context','--session','s1','--tasks','FE-002']);
  assert.equal(context.ok,true);assert.ok(context.readFirst.length<=8);
  await mkdir(path.join(p.repo,'src'),{recursive:true});await writeFile(path.join(p.repo,'src','summary.js'),'export const total = 1;\n');
  verify(p,'s1',executionId);
  const gate=p.cli(['deliver','plan','--session','s1']);
  assert.equal(gate.code,'SPEC_NOT_SYNCED');assert.equal(gate.severity,'self-fix');assert.match(gate.next.command,/spec sync plan/);
  const plan=p.cli(['spec','sync','plan','--session','s1','--evidence','AC-REG-001=src/summary.js']);
  assert.equal(plan.ok,true,JSON.stringify(plan));
  const applied=p.cli(['spec','sync','apply','--session','s1','--evidence','AC-REG-001=src/summary.js','--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));
  const {applied:delivered}=deliver(p,'s1');
  assert.equal(delivered.ok,true,JSON.stringify(delivered));
  assert.equal(delivered.specLine,'- Spec: FE-002 → delivered · evidence 1 · manifest updated');
  const committed=p.git(['show','--name-only','--format=','HEAD']).split('\n');
  for(const file of ['src/summary.js','specs/pack/06-agent/TASKS.yaml','specs/pack/00-source-of-truth/TRACEABILITY.md','specs/pack/CHANGELOG.md','specs/pack/manifest.sha256'])assert.ok(committed.includes(file),file);
  assert.match(p.git(['show','HEAD','--','.agrimap-agent/logs']),/"milestone":"spec-sync"/);
});

test('spec-na passes, enforcement block stops, code-first is not checked (19.19 #7)',async t=>{
  const h=await fixture(t);
  const warn=await specFirst(h);
  const w=await startWork(warn,{slug:'na'});
  await mkdir(path.join(warn.repo,'src'),{recursive:true});await writeFile(path.join(warn.repo,'src','a.js'),'x\n');verify(warn,'s1',w.executionId);
  const na=warn.cli(['deliver','plan','--session','s1','--spec-na','formatting only']);
  assert.equal(na.ok,true,JSON.stringify(na));assert.equal(na.specLine,'- Spec: ไม่เกี่ยว (formatting only)');
  const block=await specFirst(h,{enforcement:'block'});
  const b=await startWork(block,{slug:'block'});
  await mkdir(path.join(block.repo,'src'),{recursive:true});await writeFile(path.join(block.repo,'src','b.js'),'x\n');verify(block,'s1',b.executionId);
  const stopped=block.cli(['deliver','plan','--session','s1']);
  assert.equal(stopped.code,'SPEC_SYNC_REQUIRED');assert.equal(stopped.severity,'stop');
  const code=await specFirst(h,{mode:'code-first',sync:'off'});
  const c=await startWork(code,{slug:'legacy'});
  await mkdir(path.join(code.repo,'src'),{recursive:true});await writeFile(path.join(code.repo,'src','c.js'),'x\n');verify(code,'s1',c.executionId);
  const free=code.cli(['deliver','plan','--session','s1']);
  assert.equal(free.ok,true,JSON.stringify(free));assert.equal(free.specLine,'- Spec: ไม่เกี่ยว (code-first)');
  const refused=code.cli(['spec','sync','plan','--session','s1','--tasks','FE-002']);
  assert.equal(refused.code,'SPEC_SYNC_OFF');
  assert.equal(await readFile(path.join(code.repo,'specs/pack/06-agent/TASKS.yaml'),'utf8'),await readFile(path.join(PACK_FIXTURE,'06-agent/TASKS.yaml'),'utf8'));
});

test('an unparseable TASKS.yaml still delivers with warnings under the warning contract (AC21, 19.19 #8)',async t=>{
  const h=await fixture(t);const p=await specFirst(h,{tasksEdit:text=>text.replace('    title: Export registry to CSV','\ttitle: Export registry to CSV')});
  const {executionId}=await startWork(p,{slug:'broken-yaml'});
  p.cli(['spec','context','--session','s1','--tasks','FE-002']);
  await mkdir(path.join(p.repo,'src'),{recursive:true});await writeFile(path.join(p.repo,'src','d.js'),'x\n');verify(p,'s1',executionId);
  assert.equal(p.cli(['deliver','plan','--session','s1']).code,'SPEC_NOT_SYNCED');
  const attempt=p.cli(['spec','sync','plan','--session','s1']);
  assert.ok(attempt.warnings.some(w=>w.code==='ADAPTER_PARSE_FAILED'));
  const {plan,applied}=deliver(p,'s1');
  assert.equal(applied?.ok,true,JSON.stringify(plan));
  assert.ok(applied.warnings.some(w=>w.code==='SPEC_NOT_SYNCED'));assert.ok(applied.warnings.some(w=>w.code==='ADAPTER_PARSE_FAILED'));
  assert.ok(applied.warnings.every(w=>w.code&&w.fix),'each warning has code and fix');
  assert.equal(applied.remoteVerified,true);
});

test('a separate spec repository gets its own commit; two commits are reported (AC23)',async t=>{
  const h=await fixture(t);
  const spec=await createGitFixture(h,{name:'demo-console-spec',files:{}});
  await cp(PACK_FIXTURE,spec.repo,{recursive:true});
  spec.git(['add','--','.']);spec.git(['commit','-q','-m','docs: import pack']);spec.git(['push','-q','origin','main']);
  spec.git(['switch','-q','-c','docs/sync-fe-002']);
  const p=await project(h,{name:'demo-console-web'});
  await writeProfile(p.repo,{developmentMode:'spec-first',specs:{sources:[{id:'demo-console',kind:'external',format:'morynth-context-index@1',fingerprint:{file:'06-agent/CONTEXT-INDEX.yaml',contains:'id: demo-console'}}],scopes:[{source:'demo-console',covers:['src/**']}],sync:'auto',enforcement:'warn'}});
  p.git(['add','--','.agrimap-agent']);p.git(['commit','-q','-m','docs: project profile']);p.git(['push','-q','origin','develop']);
  const {executionId}=await startWork(p,{slug:'external-spec'});
  const set=p.cli(['local','set-path','--kind','spec','--id','demo-console','--path',spec.repo]);
  assert.equal(set.ok,true,JSON.stringify(set));
  p.cli(['spec','context','--session','s1','--tasks','FE-002']);
  await mkdir(path.join(p.repo,'src'),{recursive:true});await writeFile(path.join(p.repo,'src','e.js'),'x\n');verify(p,'s1',executionId);
  const plan=p.cli(['spec','sync','plan','--session','s1']);
  const applied=p.cli(['spec','sync','apply','--session','s1','--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(applied.linkedRoots.length,1);
  const s=bind(h,spec.repo,spec.remote);
  const message=await messageFile(h);
  const splan=s.cli(['deliver','plan','--session','s1','--explicit','push','--input',message]);
  assert.equal(splan.ok,true,JSON.stringify(splan));
  const sapplied=s.cli(['deliver','apply','--session','s1','--explicit','push','--input',message,'--plan-hash',splan.planHash]);
  assert.equal(sapplied.ok,true,JSON.stringify(sapplied));assert.equal(sapplied.remoteVerified,true);
  assert.ok(spec.git(['show','--name-only','--format=','HEAD']).split('\n').includes('06-agent/TASKS.yaml'));
  const {applied:code}=deliver(p,'s1');
  assert.equal(code.ok,true,JSON.stringify(code));
  assert.deepEqual(code.commits.map(c=>c.root),['code','spec:demo-console']);
  assert.ok(code.commits.every(c=>c.remoteVerified));
  assert.ok(!p.git(['show','HEAD']).includes(spec.repo.replaceAll('\\','/')),'no absolute spec path committed');
});

test('a non-Git external spec pack is updated locally with SPEC_SOURCE_NOT_GIT on delivery',async t=>{
  const h=await fixture(t);
  const pack=path.join(h.temp,'demo-console-spec-v1.0.0');await cp(PACK_FIXTURE,pack,{recursive:true});
  const p=await project(h,{name:'demo-console-app'});
  await writeProfile(p.repo,{developmentMode:'spec-first',specs:{sources:[{id:'demo-console',kind:'external',format:'morynth-context-index@1',fingerprint:{file:'06-agent/CONTEXT-INDEX.yaml',contains:'id: demo-console'}}],scopes:[],sync:'auto',enforcement:'warn'}});
  p.git(['add','--','.agrimap-agent']);p.git(['commit','-q','-m','docs: project profile']);p.git(['push','-q','origin','develop']);
  const {executionId}=await startWork(p,{slug:'local-pack'});
  p.cli(['local','set-path','--kind','spec','--id','demo-console','--path',pack]);
  p.cli(['spec','context','--session','s1','--tasks','FE-002']);
  await writeFile(path.join(p.repo,'f.js'),'x\n');verify(p,'s1',executionId);
  const plan=p.cli(['spec','sync','plan','--session','s1']);
  const applied=p.cli(['spec','sync','apply','--session','s1','--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));assert.match(applied.specLine,/local only/);
  assert.match(await readFile(path.join(pack,'06-agent','TASKS.yaml'),'utf8'),/id: FE-002\n.*\n {4}status: delivered/);
  const {applied:delivered}=deliver(p,'s1');
  assert.equal(delivered.ok,true,JSON.stringify(delivered));
  assert.ok(delivered.warnings.some(w=>w.code==='SPEC_SOURCE_NOT_GIT'));
});

test('code-first "update the spec too" becomes a standing rule without a card (AC19, AC26; owner answer Q-4.7.0-03)',async t=>{
  const h=await fixture(t);const p=await specFirst(h,{mode:'code-first',sync:'off'});
  const {executionId}=await startWork(p,{slug:'expiry-fix',type:'fix'});
  await mkdir(path.join(p.repo,'src','license'),{recursive:true});await writeFile(path.join(p.repo,'src','license','expiry.js'),'x\n');verify(p,'s1',executionId);
  const once=p.cli(['spec','sync','plan','--session','s1','--once','--tasks','FE-002']);
  assert.equal(once.ok,true,JSON.stringify(once));
  const standing=p.cli(['spec','standing','--session','s1','--paths','src/license/expiry.js','--requested-by','owner']);
  assert.equal(standing.ok,true,JSON.stringify(standing));assert.equal(standing.card,undefined);
  assert.match(standing.decidedForYou,/ทุกงาน/);
  const profile=JSON.parse(await readFile(path.join(p.repo,'.agrimap-agent','policy','project.json'),'utf8'));
  assert.equal(profile.developmentMode,'hybrid');assert.equal(profile.specs.sync,'auto');
  assert.ok(profile.specs.scopes.some(scope=>scope.covers.includes('src/license/**')));
  assert.match(profile.decisionRef,/development-mode\.md$/);
  const next=p.cli(['spec','sync','plan','--session','s1','--tasks','FE-002']);
  assert.equal(next.ok,true,'no --once needed afterwards');
});

test('first context of a session in spec-first scope reports open spec drift once (warning contract 4)',async t=>{
  const h=await fixture(t);const p=await specFirst(h);
  const first=p.cli(['context','--session','s9']);
  assert.ok(first.openWarnings.count>=1);assert.ok(first.openWarnings.lines.length<=5);
  assert.ok(first.openWarnings.lines.some(line=>/DONE_WITHOUT_EVIDENCE: demo-console: FE-001/.test(line)));
  p.cli(['context','--session','s9','--ack',first.chain.filter(e=>first.readRequired.includes(e.relative)).map(e=>e.sha12).join(',')]);
  assert.equal(p.cli(['context','--session','s9']).openWarnings,undefined);
});

test('4.6.0 configs with the unused specSync:false default are switched on once; a later explicit false stays (Q-4.7.0-01)',async t=>{
  const h=await fixture(t);const p=await project(h,{name:'migrated'});
  const file=path.join(p.repo,'.agrimap-agent','config.json');
  await writeFile(file,JSON.stringify({governance:{workflowPolicy:true,delivery:true,decisionMemory:false,guards:false,projectMode:true,specSync:false}},null,2));
  p.cli(['init']);
  let after=JSON.parse(await readFile(file,'utf8')).governance;
  assert.equal(after.specSync,true);assert.equal(after.specSyncDefault,'4.7.0');
  await writeFile(file,JSON.stringify({...JSON.parse(await readFile(file,'utf8')),governance:{...after,specSync:false}},null,2));
  p.cli(['init']);
  after=JSON.parse(await readFile(file,'utf8')).governance;
  assert.equal(after.specSync,false);
});

test('stubbed glab uses flags verified against glab 1.115 --help (R2)',async t=>{
  const h=await fixture(t);const p=await project(h);
  await deliveredBranch(p,{session:'s1',slug:'mr-flow',file:'g.js'});
  const delivery=JSON.parse(await readFile(path.join(p.repo,'.agrimap-agent/runtime/sessions/s1.json'),'utf8')).lastDelivery;
  const policy=(await loadPolicy(p.repo)).policy;
  const calls=[];let created=false;
  const run=(command,args,options)=>{
    if(command==='glab'){
      calls.push(args);
      if(args[0]==='auth')return {ok:true,stdout:'',stderr:''};
      if(args[1]==='list')return {ok:true,stdout:JSON.stringify(created?[{iid:3,web_url:'https://gitlab.example.com/g/r/-/merge_requests/3'}]:[]),stderr:''};
      if(args[1]==='create'){created=true;return {ok:true,stdout:'https://gitlab.example.com/g/r/-/merge_requests/3\n',stderr:''};}
      if(args[1]==='view')return {ok:true,stdout:JSON.stringify({web_url:'u',detailed_merge_status:'mergeable',head_pipeline:{status:'success'}}),stderr:''};
      if(args[1]==='merge')return {ok:true,stdout:'',stderr:''};
    }
    if(command==='git'&&args.join(' ')==='remote get-url origin')return {ok:true,stdout:'git@gitlab.example.com:g/r.git\n',stderr:''};
    return defaultRun(command,args,options);
  };
  const base={root:p.repo,state:path.join(p.repo,'.agrimap-agent'),policy,delivery,intent:'integrate',ackRequired:[],fetch:false,run};
  const plan=await planIntegration(base);
  const result=await applyIntegration({...base,planHash:plan.planHash});
  assert.equal(result.ok,true,JSON.stringify(result));
  const create=calls.find(a=>a[1]==='create');
  for(const flag of ['--source-branch','--target-branch','--title','--description-file','--yes'])assert.ok(create.includes(flag),flag);
  assert.ok(calls.find(a=>a[1]==='list').includes('-F'));
  assert.deepEqual(calls.find(a=>a[1]==='merge'),['mr','merge','3','--yes','--auto-merge=false']);
});

test('a merge git refuses before conflicts (local file would be overwritten) is MERGE_FAILED with stderr and a clean state',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  await deliveredBranch(p,{session:'s1',slug:'refused',file:'r.js'});
  const other=await cloneRemote(h,p.remote,'other');
  gitIn(other,['switch','-q','develop']);
  await mkdir(path.join(other,'.agrimap-agent','reports'),{recursive:true});
  await writeFile(path.join(other,'.agrimap-agent','reports','shared.md'),'theirs\n');
  gitIn(other,['add','--','.agrimap-agent/reports/shared.md']);gitIn(other,['commit','-q','-m','docs: report']);gitIn(other,['push','-q','origin','develop']);
  await mkdir(path.join(p.repo,'.agrimap-agent','reports'),{recursive:true});
  await writeFile(path.join(p.repo,'.agrimap-agent','reports','shared.md'),'mine, not committed\n');
  const before=p.git(['rev-parse','HEAD']);
  const plan=p.cli(['integrate','plan','--session','s1','--intent','integrate']);
  const result=p.cli(['integrate','apply','--session','s1','--intent','integrate','--plan-hash',plan.planHash]);
  assert.equal(result.code,'MERGE_FAILED',JSON.stringify(result));assert.equal(result.card,null);
  assert.match(result.stderr,/would be overwritten/);
  assert.equal(await present(path.join(p.repo,'.git','MERGE_HEAD')),false);
  assert.equal(p.git(['rev-parse','HEAD']),before);
  assert.equal(await readFile(path.join(p.repo,'.agrimap-agent','reports','shared.md'),'utf8'),'mine, not committed\n');
});

test('team commit style: feature|fix|comment for work, bump|audit|ci for agm-release, Thai headers (4.9.3)',async()=>{
  const {TEAM_HEADER}=await import('../../skills/agrimap-agent-skills/scripts/git-flow.mjs');
  for(const header of ['feature: เพิ่มรับ User หลายช่องทาง','fix: แก้ dynamic form เพิ่มวันที่ ช่วงเวลา','comment: ปรับโทนสีปุ่มเป็นสีม่วง','bump: Production 1.4.2','audit: บันทึกประวัติ release 1.4.2','ci: อัปเดต bootstrap 4.9.3'])assert.match(header,TEAM_HEADER,header);
  for(const header of ['feat(orders): add export','Feature: เพิ่ม','fix:ไม่มีช่องว่าง','docs: update'])assert.doesNotMatch(header,TEAM_HEADER,header);
});

test('a generated execution ID that collides within the same second moves to the next free second (§9.2)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  // Reserve the current and next two Bangkok seconds, as a concurrent run would.
  const parts=d=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const taken=[];
  for(let i=0;i<3;i++){const v=parts(new Date(Date.now()+i*1000));const id=v.day+v.hour+v.minute+v.second;taken.push(id);await mkdir(path.join(p.repo,'.agrimap-agent/runtime/reservations',v.year+'-'+v.month,id),{recursive:true});}
  p.ack('s9');
  const started=p.cli(['start','--operation','execute','--session','s9','--requested-by','Tester','--title','เริ่มงานวินาทีเดียวกัน']);
  assert.equal(started.ok,true,JSON.stringify(started));
  assert.ok(!taken.includes(started.activeTask.executionId),started.activeTask.executionId);
});

test('team commit style is enforced: Conventional types map to feature|fix|comment|ci and lose their scope (4.9.6)',async t=>{
  const {checkCommitHeader,teamHeader}=await import('../../skills/agrimap-agent-skills/scripts/git-flow.mjs');
  assert.deepEqual(checkCommitHeader('feat(orders): เพิ่มการส่งออก'),{ok:false,reason:'type',suggestion:'feature: เพิ่มการส่งออก'});
  assert.equal(checkCommitHeader('feat(orders): add export','conventional').ok,true,'opt-out policy');
  for(const [from,to] of [['docs: x','comment: x'],['refactor(api): x','comment: x'],['chore: x','ci: x'],['fix(ui)!: x','fix: x']])assert.equal(teamHeader(from),to,from);
  for(const header of ["Merge branch 'feature/x' into develop",'Revert "feature: x"','fixup! feature: x'])assert.equal(checkCommitHeader(header).ok,true,header);
  assert.deepEqual(checkCommitHeader('wip'),{ok:false,reason:'type',suggestion:null});
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  const {executionId}=await startWork(p,{slug:'legacy-input'});
  await writeFile(path.join(p.repo,'e.js'),'x\n');verify(p,'s1',executionId);
  const plan=p.cli(['deliver','plan','--session','s1','--input',await messageFile(h)]);
  assert.equal(plan.message.header,'feature: งานต่อเนื่อง');
  await writeFile(path.join(h.temp,'embedded.json'),JSON.stringify({subject:'docs(readme): อธิบายการติดตั้ง'}));
  assert.equal(p.cli(['deliver','plan','--session','s1','--input',path.join(h.temp,'embedded.json')]).message.header,'comment: อธิบายการติดตั้ง');
});

// Post-delivery logs/recent memory stay modified on the work branch; release commits them as audit (AGENTS.release.md §6.4).
function commitCarriedAudit(p){
  const paths=[...p.git(['diff','--name-only']).split('\n'),...p.git(['ls-files','--others','--exclude-standard']).split('\n')].filter(file=>file.startsWith('.agrimap-agent/'));
  if(paths.length){p.git(['add','--',...paths]);p.git(['commit','-q','-m','audit: บันทึกประวัติงาน']);}
}

test('release gather merges verified work branches into local develop without switching or pushing; others need a card (4.9.6)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  const a=await deliveredBranch(p,{session:'s1',slug:'ready-a',file:'a.js'});
  commitCarriedAudit(p);p.git(['switch','-q','develop']);
  const b=await deliveredBranch(p,{session:'s2',slug:'ready-b',file:'b.js'});
  commitCarriedAudit(p);p.git(['switch','-q','develop']);
  const {executionId}=await startWork(p,{session:'s3',slug:'failing'});
  await writeFile(path.join(p.repo,'c.js'),'x\n');verify(p,'s3',executionId,'failed');
  assert.equal(deliver(p,'s3').applied.ok,true);
  commitCarriedAudit(p);p.git(['switch','-q','-c','fix/by-hand','develop']);await writeFile(path.join(p.repo,'d.js'),'x\n');
  p.git(['add','--','d.js']);p.git(['commit','-q','-m','fix: แก้ด้วยมือ']);p.git(['push','-q','-u','origin','fix/by-hand']);
  const originDevelop=p.git(['rev-parse','origin/develop']);
  const pending=p.cli(['integrate','pending','--session','s1']);
  assert.deepEqual(pending.counts,{ready:2,unverified:1,manual:1,conflict:0,merged:0});
  const card=p.cli(['integrate','gather','plan','--session','s1','--scope','all']);
  assert.equal(card.card.topic,'git/release-gather');assert.equal(card.planHash,null);
  const plan=p.cli(['integrate','gather','plan','--session','s1','--mode','ready','--scope','all']);
  assert.deepEqual(plan.selected.map(item=>item.name),['feature/ready-a','feature/ready-b']);
  const applied=p.cli(['integrate','gather','apply','--session','s1','--mode','ready','--scope','all','--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(applied.pushed,false);
  assert.equal(p.git(['branch','--show-current']),'fix/by-hand','gather never switches the worktree');
  assert.equal(p.git(['rev-parse','origin/develop']),originDevelop,'the release D stage pushes develop, not gather');
  for(const sha of [a.commit,b.commit])p.git(['merge-base','--is-ancestor',sha,'develop']);
  assert.equal(p.git(['log','-1','--format=%s','develop']),"Merge branch 'feature/ready-b' into develop");
  assert.equal(p.git(['rev-parse','develop^2']),p.git(['rev-parse','feature/ready-b']),'the carried audit commit rides along');
  assert.deepEqual(p.cli(['integrate','pending','--session','s1']).counts,{ready:0,unverified:1,manual:1,conflict:0,merged:2});
  await writeFile(path.join(p.repo,'d.js'),'dirty\n');
  assert.equal(p.cli(['integrate','gather','plan','--session','s1','--mode','all']).code,'DELIVER_FIRST');
});

test('release gather reports a branch that conflicts with develop and never merges it (4.9.6)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  await deliveredBranch(p,{session:'s1',slug:'clash',file:'README.md',content:'# mine\n'});
  commitCarriedAudit(p);p.git(['switch','-q','develop']);await writeFile(path.join(p.repo,'README.md'),'# theirs\n');
  p.git(['add','--','README.md']);p.git(['commit','-q','-m','fix: ปรับ README']);p.git(['push','-q','origin','develop']);
  const plan=p.cli(['integrate','gather','plan','--session','s1','--scope','all']);
  assert.equal(plan.card,null);assert.deepEqual(plan.selected,[]);
  assert.equal(plan.skipped[0].conflict,true);
  assert.ok(plan.warnings.some(w=>w.code==='GATHER_CONFLICT'&&w.subject==='feature/clash'));
});

test('commit descriptions are Thai by default; English stays for technical names (4.9.8)',async t=>{
  const {checkCommitHeader}=await import('../../skills/agrimap-agent-skills/scripts/git-flow.mjs');
  for(const header of ['feature: เพิ่มรับ User หลายช่องทาง','fix: แก้ dynamic form เพิ่มวันที่','comment: อัปเดต README','bump: ขึ้นเวอร์ชัน Production 1.4.2','feature: เพิ่ม API สร้าง order และ SP ORDER_H_I'])assert.equal(checkCommitHeader(header).ok,true,header);
  for(const header of ['fix: resolve Windows short paths','bump: 4.9.8','feature: add export button'])assert.deepEqual(checkCommitHeader(header),{ok:false,reason:'thai',suggestion:null},header);
  assert.equal(checkCommitHeader('fix: resolve paths','agrimap','en').ok,true,'policy commitLanguage en');
  assert.deepEqual(checkCommitHeader('feat(x): add y'),{ok:false,reason:'type+thai',suggestion:null});
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  const {executionId}=await startWork(p,{slug:'english',title:'Add export button'});
  await writeFile(path.join(p.repo,'f.js'),'x\n');verify(p,'s1',executionId);
  const plan=p.cli(['deliver','plan','--session','s1']);
  assert.equal(plan.code,'MESSAGE_INVALID');assert.match(plan.message,/Thai description/);assert.match(plan.next.command,/subject/);
});

// A product repository with the three release branches, as agm-release sees it.
async function releaseRepo(h){
  const f=await createGitFixture(h,{name:'rel',jenkins:true,branches:['develop','jenkins','jenkins-release'],files:{'AGENTS.md':'# Rules\n'}});
  const p=bind(h,f.repo,f.remote);
  const push=(dir,ref)=>gitIn(dir,['push','-q','origin',ref]);
  p.git(['switch','-q','develop']);await writeFile(path.join(p.repo,'app.js'),'v1\n');
  p.git(['add','--','app.js']);p.git(['commit','-q','-m','feature: เพิ่มหน้าแรก']);push(p.repo,'develop');
  p.git(['switch','-q','jenkins']);p.git(['merge','-q','--ff-only','develop']);push(p.repo,'jenkins');
  // Someone promoted with a merge commit: jenkins-release holds history develop lacks, but no new file.
  p.git(['switch','-q','jenkins-release']);p.git(['merge','-q','--no-ff','jenkins','-m',"Merge branch 'jenkins' into jenkins-release"]);push(p.repo,'jenkins-release');
  p.git(['switch','-q','develop']);p.git(['fetch','-q','origin']);
  return {p,push};
}

test('release preflight syncs a clean origin/develop and merge-only jenkins-release history without a question (4.9.8)',async t=>{
  const h=await fixture(t);const {p}=await releaseRepo(h);
  await writeFile(path.join(p.repo,'Jenkinsfile_Production'),"IMAGE_TAG = 'v1.0.1'\nPROJECT_VERSION = '1.0.1'\n");
  p.git(['add','--','Jenkinsfile_Production']);p.git(['commit','-q','-m','bump: ขึ้นเวอร์ชัน Production 1.0.1']);
  const other=await cloneRemote(h,p.remote,'other');
  gitIn(other,['switch','-q','develop']);await writeFile(path.join(other,'other.js'),'x\n');
  gitIn(other,['add','--','other.js']);gitIn(other,['commit','-q','-m','fix: แก้งานของอีกคน']);gitIn(other,['push','-q','origin','develop']);
  const pre=p.cli(['release','preflight']);
  assert.equal(pre.ok,true,JSON.stringify(pre.blockers));assert.equal(pre.branches.develop.state,'diverged');
  assert.deepEqual(pre.questions,[]);assert.deepEqual(pre.owners.production,{imageTag:'v1.0.1',projectVersion:'1.0.1'});
  assert.deepEqual(pre.autoActions.map(item=>item.action),['merge origin/develop into develop','merge origin/jenkins-release into develop']);
  const originDevelop=p.git(['rev-parse','origin/develop']);
  const plan=p.cli(['release','sync','plan']);assert.equal(plan.card,null);
  const applied=p.cli(['release','sync','apply','--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(applied.pushed,false);
  for(const ref of ['origin/develop','origin/jenkins','origin/jenkins-release'])p.git(['merge-base','--is-ancestor',ref,'develop']);
  assert.equal(p.git(['rev-parse','origin/develop']),originDevelop,'sync never pushes');
  assert.equal(await readFile(path.join(p.repo,'other.js'),'utf8'),'x\n','checked-out develop moved forward');
  assert.deepEqual(p.cli(['release','sync','plan']).merges,[],'second sync has nothing left');
});

test('a jenkins-release hotfix that develop lacks is back-merged without a question (4.9.9)',async t=>{
  const h=await fixture(t);const {p,push}=await releaseRepo(h);
  p.git(['switch','-q','jenkins-release']);await writeFile(path.join(p.repo,'hotfix.js'),'prod\n');
  p.git(['add','--','hotfix.js']);p.git(['commit','-q','-m','fix: แก้ด่วนบน production']);push(p.repo,'jenkins-release');p.git(['switch','-q','develop']);
  const pre=p.cli(['release','preflight']);
  assert.deepEqual(pre.questions,[]);
  const backMerge=pre.autoActions.find(item=>item.action==='merge origin/jenkins-release into develop');
  assert.equal(backMerge.changed,1);assert.equal(backMerge.reason,'content already on jenkins-release');
  const plan=p.cli(['release','sync','plan']);assert.equal(plan.card,null);
  const applied=p.cli(['release','sync','apply','--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(await readFile(path.join(p.repo,'hotfix.js'),'utf8'),'prod\n');
});

test('release gather takes only the release own branch; other branches are ignored, not reported (4.9.9)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  await deliveredBranch(p,{session:'s1',slug:'someone-else',file:'a.js'});
  commitCarriedAudit(p);p.git(['switch','-q','-c','fix/by-hand','develop']);await writeFile(path.join(p.repo,'d.js'),'x\n');
  p.git(['add','--','d.js']);p.git(['commit','-q','-m','fix: แก้ด้วยมือ']);p.git(['push','-q','-u','origin','fix/by-hand']);
  p.git(['switch','-q','develop']);
  const mine=await deliveredBranch(p,{session:'s2',slug:'mine',file:'b.js'});
  const plan=p.cli(['integrate','gather','plan','--session','s2']);
  assert.equal(plan.scope,'release');assert.equal(plan.card,null);assert.deepEqual(plan.warnings,[]);
  assert.deepEqual(plan.selected.map(item=>item.name),['feature/mine']);assert.equal(plan.ignored,2);
  const applied=p.cli(['integrate','gather','apply','--session','s2','--plan-hash',plan.planHash]);
  assert.equal(applied.ok,true,JSON.stringify(applied));
  p.git(['merge-base','--is-ancestor',mine.commit,'develop']);
  assert.throws(()=>p.git(['merge-base','--is-ancestor','feature/someone-else','develop']),'another session branch stays out');
  const pre=p.cli(['release','preflight','--session','s2']);
  assert.deepEqual(pre.questions,[]);assert.deepEqual(pre.resolve,[]);assert.equal(pre.work.ignoredOtherBranches,2);
});

test('a conflict between the release own branch and develop is a resolve step for the agent, not a question (4.9.9)',async t=>{
  const h=await fixture(t);const p=await project(h,{method:'local-merge'});
  await deliveredBranch(p,{session:'s1',slug:'clash',file:'README.md',content:'# mine\n'});
  commitCarriedAudit(p);p.git(['switch','-q','develop']);await writeFile(path.join(p.repo,'README.md'),'# theirs\n');
  p.git(['add','--','README.md']);p.git(['commit','-q','-m','fix: ปรับ README']);p.git(['push','-q','origin','develop']);
  p.git(['switch','-q','feature/clash']);p.git(['fetch','-q','origin']);
  const plan=p.cli(['integrate','gather','plan','--session','s1']);
  assert.equal(plan.card,null);assert.equal(plan.next.action,'resolve');
  assert.equal(plan.resolve[0].branch,'feature/clash');assert.deepEqual(plan.resolve[0].paths,['README.md']);
  assert.ok(plan.resolve[0].steps.some(step=>/git merge (origin\/)?develop/.test(step)));
  assert.throws(()=>p.git(['merge','-q','origin/develop']));
  await writeFile(path.join(p.repo,'README.md'),'# mine and theirs\n');
  p.git(['add','--','README.md']);p.git(['commit','-q','--no-edit']);p.git(['push','-q','origin','feature/clash']);
  const again=p.cli(['integrate','gather','plan','--session','s1']);
  assert.deepEqual(again.resolve,[]);assert.deepEqual(again.selected.map(item=>item.name),['feature/clash']);
  assert.equal(p.cli(['integrate','gather','apply','--session','s1','--plan-hash',again.planHash]).ok,true);
});

test('a conflicting jenkins-release hotfix is a resolve step on develop, never a blocker (4.9.9)',async t=>{
  const h=await fixture(t);const {p,push}=await releaseRepo(h);
  p.git(['switch','-q','jenkins-release']);await writeFile(path.join(p.repo,'app.js'),'prod\n');
  p.git(['add','--','app.js']);p.git(['commit','-q','-m','fix: แก้ด่วนบน production']);push(p.repo,'jenkins-release');
  p.git(['switch','-q','develop']);await writeFile(path.join(p.repo,'app.js'),'v2\n');
  p.git(['add','--','app.js']);p.git(['commit','-q','-m','feature: ปรับหน้าแรก']);push(p.repo,'develop');p.git(['fetch','-q','origin']);
  const pre=p.cli(['release','preflight']);
  assert.equal(pre.ok,true);assert.deepEqual(pre.blockers,[]);assert.deepEqual(pre.questions,[]);
  assert.equal(pre.resolve[0].ref,'origin/jenkins-release');assert.deepEqual(pre.resolve[0].paths,['app.js']);assert.equal(pre.next.action,'resolve');
  assert.equal(p.cli(['release','sync','plan']).next.action,'resolve');
});
