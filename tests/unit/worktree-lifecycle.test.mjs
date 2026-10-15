import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readFile,stat,utimes,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHarness} from '../helpers/harness.mjs';
import {createGitFixture,gitIn} from '../helpers/git-fixture.mjs';
import {PROFILES} from '../../skills/agrimap-agent-skills/scripts/workflow-policy.mjs';
import {cleanupJob,integrateJob,integrationState,listJobs,readJob,resumeCleanups,startJob,worktreeEntries} from '../../skills/agrimap-agent-skills/scripts/worktree-lifecycle.mjs';
import {defaultRun} from '../../skills/agrimap-agent-skills/scripts/run-command.mjs';

// Ephemeral worktree, durable job context (owner decision 2026-10-14, 5.0.1).
const present=p=>stat(p).then(()=>true,()=>false);
const persist=async()=>{};
async function leader(t){
  const h=await createHarness('agm-jobs-');t.after(()=>h.cleanup());
  const {repo}=await createGitFixture(h,{name:'svc',remote:false});
  gitIn(repo,['switch','-q','-c','feature/leader','develop']);
  return {h,repo,state:path.join(repo,'.agrimap-agent'),policy:PROFILES['agrimap-jenkins']};
}
async function commitIn(dir,file,text,message){
  await writeFile(path.join(dir,file),text);
  gitIn(dir,['add','--',file]);gitIn(dir,['commit','-q','-m',message]);
}
const branchExists=(repo,branch)=>gitIn(repo,['branch','--list',branch])!=='';

test('successful integration removes the worktree and branch; history and job context remain',async t=>{
  const {repo,state,policy}=await leader(t);
  const started=await startJob({root:repo,state,policy,slug:'export-api',session:'lead',executionId:'14100000'});
  assert.equal(started.ok,true,JSON.stringify(started));
  const job=started.job;
  assert.match(job.branch,/^feature\/export-api-/);assert.equal(job.into,'feature/leader');
  assert.equal(path.basename(path.dirname(job.directory)),'svc.worktrees');
  await commitIn(job.directory,'api.js','x\n','feature: เพิ่ม export API');
  const result=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed',evidence:'node --test api',persist});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.cleanup.ok,true,JSON.stringify(result.cleanup));
  assert.equal(await present(job.directory),false);
  assert.ok(!worktreeEntries(defaultRun,repo).some(entry=>entry.path.includes(job.jobId)));
  assert.equal(branchExists(repo,job.branch),false);
  assert.match(gitIn(repo,['log','--format=%s','feature/leader']),/feature: เพิ่ม export API/);
  const record=await readJob(state,job.jobId);
  assert.equal(record.status,'cleaned');assert.equal(record.method,'merge');assert.equal(record.verification.evidence,'node --test api');
  assert.equal(record.integratedSha,result.mergeSha);
  const again=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed',persist});
  assert.equal(again.alreadyIntegrated,true,'idempotent');
});

test('failed gate, dirty worktree and conflict block destructive cleanup',async t=>{
  const {repo,state,policy}=await leader(t);
  const {job}=await startJob({root:repo,state,policy,slug:'form',session:'lead'});
  await commitIn(job.directory,'README.md','job side\n','feature: แก้ README ฝั่งงานย่อย');
  const failed=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'failed'});
  assert.equal(failed.code,'QUALITY_GATE_NOT_PASSED');assert.equal(failed.cleanup,'blocked');assert.equal(await present(job.directory),true);
  assert.equal((await cleanupJob({root:repo,state,jobId:job.jobId,session:'lead'})).code,'QUALITY_GATE_NOT_PASSED');
  await writeFile(path.join(job.directory,'scratch.txt'),'untracked\n');
  assert.equal((await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed',persist})).code,'JOB_WORKTREE_DIRTY');
  gitIn(job.directory,['clean','-q','-f','--','scratch.txt']);
  await commitIn(repo,'README.md','leader side\n','feature: แก้ README ฝั่ง Leader');
  const conflict=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed',persist});
  assert.equal(conflict.code,'JOB_MERGE_CONFLICT');assert.deepEqual(conflict.conflicts,['README.md']);
  assert.equal(gitIn(repo,['status','--porcelain','--',':!.agrimap-agent']),'','merge aborted cleanly');
  assert.equal(await present(job.directory),true);assert.equal(branchExists(repo,job.branch),true);
});

test('rework is a new job from the latest integrated tip; the old worktree is never reused',async t=>{
  const {repo,state,policy}=await leader(t);
  const first=(await startJob({root:repo,state,policy,slug:'report',session:'lead'})).job;
  await commitIn(first.directory,'report.js','v1\n','feature: รายงาน v1');
  assert.equal((await integrateJob({root:repo,state,jobId:first.jobId,session:'lead',verification:'passed',persist})).ok,true);
  const rework=await startJob({root:repo,state,policy,slug:'report',session:'lead',parentJob:first.jobId});
  assert.equal(rework.ok,true,JSON.stringify(rework));assert.equal(rework.reworkOf,first.jobId);
  assert.equal(rework.job.parentJob,first.jobId);assert.notEqual(rework.job.jobId,first.jobId);
  assert.notEqual(rework.job.directory,first.directory);assert.notEqual(rework.job.branch,first.branch);
  assert.equal(rework.job.baseSha,gitIn(repo,['rev-parse','feature/leader']),'starts from the integrated tip');
  assert.equal((await startJob({root:repo,state,policy,slug:'report',session:'lead',parentJob:'job-missing00'})).code,'PARENT_JOB_NOT_FOUND');
});

test('concurrent jobs: one Leader never removes another job, and locks serialize cleanup',async t=>{
  const {repo,state,policy}=await leader(t);
  const mine=(await startJob({root:repo,state,policy,slug:'mine',session:'lead'})).job;
  const theirs=(await startJob({root:repo,state,policy,slug:'theirs',session:'other'})).job;
  await commitIn(mine.directory,'a.js','a\n','feature: งาน A');
  assert.equal((await cleanupJob({root:repo,state,jobId:theirs.jobId,session:'lead',gatesPassed:true})).code,'JOB_NOT_OWNED');
  assert.equal((await integrateJob({root:repo,state,jobId:theirs.jobId,session:'lead',verification:'passed',persist})).code,'JOB_NOT_OWNED');
  await writeFile(path.join(state,'runtime','jobs',`${mine.jobId}.lock`),'1');
  const locked=await integrateJob({root:repo,state,jobId:mine.jobId,session:'lead',verification:'passed',persist});
  assert.equal(locked.ok,true);assert.equal(locked.cleanup.code,'JOB_CLEANUP_IN_PROGRESS');
  assert.equal(await present(mine.directory),true);
  assert.equal(await present(theirs.directory),true,'the other job is untouched');
  assert.deepEqual((await listJobs(state,{session:'other'})).map(job=>job.status),['active']);
});

test('an interrupted cleanup is finished by the next call and stays idempotent',async t=>{
  const {repo,state,policy}=await leader(t);
  const {job}=await startJob({root:repo,state,policy,slug:'slow',session:'lead'});
  await commitIn(job.directory,'s.js','s\n','feature: งานช้า');
  const lock=path.join(state,'runtime','jobs',`${job.jobId}.lock`);
  await mkdir(path.dirname(lock),{recursive:true});await writeFile(lock,'1');
  const first=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed',persist});
  assert.equal(first.cleanup.code,'JOB_CLEANUP_IN_PROGRESS');assert.equal((await readJob(state,job.jobId)).status,'integrated');
  // The lock outlived its process (older than ten minutes): it is taken over.
  const old=new Date(Date.now()-11*60_000);await utimes(lock,old,old);
  // The worktree was already removed before the interruption; only the branch is left.
  gitIn(repo,['worktree','remove',job.directory]);
  const finished=await resumeCleanups({root:repo,state,session:'lead'});
  assert.equal(finished.length,1);assert.equal(finished[0].ok,true,JSON.stringify(finished[0]));
  assert.equal(branchExists(repo,job.branch),false);
  assert.equal((await cleanupJob({root:repo,state,jobId:job.jobId,session:'lead'})).alreadyClean,true);
  assert.equal(await present(lock),false);
});

test('squash and rebase integration are proven before the branch is force-deleted',async t=>{
  const {repo,state,policy}=await leader(t);
  const squash=(await startJob({root:repo,state,policy,slug:'squash',session:'lead'})).job;
  await commitIn(squash.directory,'q1.js','1\n','feature: q1');await commitIn(squash.directory,'q2.js','2\n','feature: q2');
  gitIn(repo,['merge','--squash',squash.branch]);gitIn(repo,['commit','-q','-m','feature: squash งาน q']);
  assert.equal(integrationState({root:repo,branch:squash.branch,target:'feature/leader'}).method,'squash');
  const cleaned=await cleanupJob({root:repo,state,jobId:squash.jobId,session:'lead',gatesPassed:true,persist});
  assert.equal(cleaned.ok,true,JSON.stringify(cleaned));assert.match(cleaned.steps.at(-1).step,/-D, squash/);
  const rebase=(await startJob({root:repo,state,policy,slug:'rebase',session:'lead'})).job;
  await commitIn(rebase.directory,'r.js','r\n','feature: r');
  await commitIn(repo,'other.js','o\n','feature: งาน Leader อื่น');
  gitIn(repo,['cherry-pick',gitIn(repo,['rev-parse',rebase.branch])]);
  assert.equal(integrationState({root:repo,branch:rebase.branch,target:'feature/leader'}).method,'rebase');
  assert.equal((await cleanupJob({root:repo,state,jobId:rebase.jobId,session:'lead',gatesPassed:true,persist})).ok,true);
  const pending=(await startJob({root:repo,state,policy,slug:'pending',session:'lead'})).job;
  await commitIn(pending.directory,'p.js','p\n','feature: ยังไม่รวม');
  const refused=await cleanupJob({root:repo,state,jobId:pending.jobId,session:'lead',gatesPassed:true,persist});
  assert.equal(refused.code,'JOB_NOT_INTEGRATED');assert.equal(branchExists(repo,pending.branch),true);
  assert.match(await readFile(path.join(pending.directory,'p.js'),'utf8'),/p/);
});

test('CLI: branch apply --worktree and integrate apply --job record durable job context in the audit log',async t=>{
  const {h,repo}=await leader(t);
  const ws=args=>JSON.parse(h.spawn(h.scripts.workspace,[...args,'--cwd',repo]).stdout);
  ws(['identify','--session','lead','--owner','006006']);
  const execution=ws(['start','--session','lead','--operation','execute','--persist','--title','Export feature']).activeTask.executionId;
  const plan=ws(['branch','plan','--worktree','--session','lead','--slug','export-api','--type','fix']);
  assert.equal(plan.ok,true,JSON.stringify(plan));assert.match(plan.job.branch,/^feature\/export-api-/,'a fix job still branches as feature/');
  const job=ws(['branch','apply','--worktree','--session','lead','--slug','export-api']).job;
  assert.ok(job?.jobId);
  await commitIn(job.directory,'api.js','x\n','feature: เพิ่ม API');
  assert.equal(ws(['integrate','apply','--session','lead','--job',job.jobId,'--verification','failed']).code,'QUALITY_GATE_NOT_PASSED');
  const done=ws(['integrate','apply','--session','lead','--job',job.jobId,'--verification','passed','--evidence','node --test api 3/3']);
  assert.equal(done.ok,true,JSON.stringify(done));assert.equal(done.cleanup.ok,true);
  assert.equal(await present(job.directory),false);
  const {readdir}=await import('node:fs/promises');
  const logDir=path.join(repo,'.agrimap-agent','logs');
  const files=[];for(const month of await readdir(logDir))for(const day of await readdir(path.join(logDir,month)))for(const file of await readdir(path.join(logDir,month,day)))files.push(path.join(logDir,month,day,file));
  const events=(await Promise.all(files.map(file=>readFile(file,'utf8')))).join('\n').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  assert.ok(events.some(event=>event.execution_id===execution&&event.event==='changed'&&event.message.includes(job.jobId)));
  const integrated=events.find(event=>event.execution_id===execution&&event.event==='integrated'&&event.message.includes(job.jobId));
  assert.ok(integrated,'integration is in the durable log');assert.ok(integrated.reason.includes(`job=${job.jobId}`));
  assert.equal(done.cleanup.method,'merge');
});

test('nothing is removed until the job context is persisted',async t=>{
  const {repo,state,policy}=await leader(t);
  const {job}=await startJob({root:repo,state,policy,slug:'ctx',session:'lead'});
  await commitIn(job.directory,'c.js','c\n','feature: ctx');
  const unrecorded=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed'});
  assert.equal(unrecorded.ok,true);assert.equal(unrecorded.cleanup.code,'JOB_CONTEXT_NOT_PERSISTED');
  assert.equal(await present(job.directory),true);
  assert.deepEqual(await resumeCleanups({root:repo,state,session:'lead'}),[],'resume never cleans an unrecorded job');
  const failing=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed',persist:async()=>{throw new Error('log unavailable');}});
  assert.equal(failing.cleanup.code,'JOB_CONTEXT_NOT_PERSISTED');assert.equal(await present(job.directory),true);
  const recorded=await integrateJob({root:repo,state,jobId:job.jobId,session:'lead',verification:'passed',persist});
  assert.equal(recorded.cleanup.ok,true);assert.equal(await present(job.directory),false);
});
