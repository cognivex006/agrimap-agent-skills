import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseBranchPlace,reconcileSavepoint,RECONCILE_STATES} from '../../skills/agrimap-agent-skills/scripts/savepoint.mjs';

test('parseBranchPlace reads "branch @ sha" and rejects placeholders',()=>{
  assert.deepEqual(parseBranchPlace('feature/x @ abc1234'),{branch:'feature/x',sha:'abc1234'});
  assert.deepEqual(parseBranchPlace('develop'),{branch:'develop',sha:null});
  assert.deepEqual(parseBranchPlace('unknown'),{branch:null,sha:null});
  assert.deepEqual(parseBranchPlace('not-a-git-repository'),{branch:null,sha:null});
});

test('terminal status and missing git never report pending',()=>{
  assert.equal(reconcileSavepoint('/x',{status:'completed',branch:'a @ abc1234'}).state,'ALREADY_COMPLETED');
  const none=reconcileSavepoint('/x',{status:'in-progress',branch:'a'},{git:()=>({ok:false,out:''})});
  assert.equal(none.state,'UNVERIFIED');
  assert.ok(RECONCILE_STATES.includes(none.state));
});

function git(cwd,...args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}

test('real repository: confirmed, moved, merged and deleted branches',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'agm-reconcile-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  git(dir,'init','-q','-b','develop');
  git(dir,'config','user.email','t@example.test');git(dir,'config','user.name','t');git(dir,'config','commit.gpgsign','false');
  const commit=async(name)=>{await writeFile(path.join(dir,name),name);git(dir,'add',name);git(dir,'commit','-q','-m',name);return git(dir,'rev-parse','--short','HEAD');};
  await commit('base');
  git(dir,'checkout','-q','-b','feature/a');
  const saved=await commit('a1');
  const sp={status:'in-progress',branch:`feature/a @ ${saved}`};
  assert.equal(reconcileSavepoint(dir,sp).state,'PENDING_CONFIRMED');

  await commit('a2');
  const ahead=reconcileSavepoint(dir,sp);
  assert.equal(ahead.state,'PENDING_CONFIRMED');
  assert.ok(ahead.evidence.some(e=>/1 commit\(s\) since/.test(e)));

  git(dir,'checkout','-q','develop');
  await commit('d1');
  git(dir,'merge','-q','--no-ff','-m','merge','feature/a');
  const merged=reconcileSavepoint(dir,sp);
  assert.equal(merged.state,'STALE');
  assert.match(merged.reason,/integrated into develop/);

  git(dir,'branch','-q','-D','feature/a');
  assert.equal(reconcileSavepoint(dir,sp).state,'STALE');
  assert.equal(reconcileSavepoint(dir,{status:'in-progress',branch:'develop @ 0000000'}).state,'STALE');
});
