import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHarness} from '../helpers/harness.mjs';
import {createGitFixture,initRepo} from '../helpers/git-fixture.mjs';
import {PROFILES,validatePolicy,inferPolicy,initPolicy,setPolicyValue,loadPolicy,isProtected,POLICY_PATH} from '../../skills/agrimap-agent-skills/scripts/workflow-policy.mjs';

async function fixture(t){const h=await createHarness('agm-policy-');t.after(()=>h.cleanup());return h;}
const confirmed=p=>({...structuredClone(p),status:'confirmed',confirmedBy:'t',confirmedAt:'2026-09-18'});

test('all three profiles validate; ff-only promotion and push-without-commit are rejected',()=>{
  for(const profile of Object.values(PROFILES))assert.deepEqual(validatePolicy(confirmed(profile)).details,[]);
  const bad=confirmed(PROFILES['agrimap-jenkins']);bad.branching.workTypes.hotfix.base='jenkins-release';
  assert.ok(validatePolicy(bad).details.some(d=>d.code==='POLICY_HOTFIX_BASE_BREAKS_FF_PROMOTION'));
  const v5=confirmed(PROFILES.gitflow);v5.delivery.commitOnComplete=false;
  assert.equal(validatePolicy(v5).ok,false);
  assert.equal(isProtected(PROFILES.gitflow,'release/4.6.0'),true);
  assert.equal(isProtected(PROFILES.gitflow,'feature/x'),false);
});

test('inference: jenkins high, develop+main gitflow, main-only trunk, no remote low; prefixes counted',async t=>{
  const h=await fixture(t);
  const jenkins=await createGitFixture(h,{name:'jk',branches:['develop','jenkins','jenkins-release','feature/a','feature/b','feature/c'],jenkins:true});
  const j=await inferPolicy(jenkins.repo);
  assert.equal(j.proposal.profile,'agrimap-jenkins');assert.equal(j.confidence,'high');
  assert.ok(j.evidence.some(e=>/^feature\/\* \d+ branches$/.test(e)));
  assert.equal(j.card.recordAs,'policy:init');
  assert.equal((await inferPolicy((await createGitFixture(h,{name:'gf'})).repo)).proposal.profile,'gitflow');
  assert.equal((await inferPolicy((await createGitFixture(h,{name:'tr',branches:[]})).repo)).proposal.profile,'trunk');
  const none=await inferPolicy(await initRepo(path.join(h.temp,'solo')));
  assert.equal(none.confidence,'low');assert.equal(none.proposal.delivery.pushOnComplete,false);
});

test('init writes policy, decision and project fact; set keeps unknown keys and refuses invalid values without writing',async t=>{
  const h=await fixture(t);const {repo}=await createGitFixture(h,{name:'r'});
  const init=await initPolicy(repo,'gitflow',{custom:{keep:true}},'owner');
  assert.equal(init.ok,true);
  const policy=JSON.parse(await readFile(path.join(repo,POLICY_PATH),'utf8'));
  assert.equal(policy.status,'confirmed');assert.equal(policy.confirmedBy,'owner');assert.deepEqual(policy.custom,{keep:true});
  assert.match(await readFile(path.join(repo,'.agrimap-agent/memory/project.md'),'utf8'),/## Facts\n- Workflow policy:/);
  const before=await readFile(path.join(repo,POLICY_PATH),'utf8');
  const bad=await setPolicyValue(repo,'integration.method','teleport','owner');
  assert.equal(bad.code,'POLICY_INVALID');
  assert.equal(await readFile(path.join(repo,POLICY_PATH),'utf8'),before);
  const good=await setPolicyValue(repo,'integration.method','local-merge','owner');
  assert.equal(good.ok,true);assert.deepEqual(good.policy.custom,{keep:true});
  const decisions=await readdir(path.join(repo,'.agrimap-agent/decisions',(await readdir(path.join(repo,'.agrimap-agent/decisions')))[0]));
  assert.equal(decisions.length,2);
  assert.match((await loadPolicy(repo)).policy.decisionRef,/^decisions\/\d{4}-\d{2}\/\d{8}-git-workflow-policy(-2)?\.md$/);
});

test('work branches are feature/ or hotfix/ only; older policies are normalized on load (5.0.1)',async t=>{
  for(const profile of Object.values(PROFILES))assert.deepEqual(Object.keys(profile.branching.workTypes),['feature','hotfix']);
  const {branchTypeOf}=await import('../../skills/agrimap-agent-skills/scripts/workflow-policy.mjs');
  assert.deepEqual(['feature','hotfix','fix','chore','docs','refactor','release'].map(branchTypeOf),['feature','hotfix','feature','feature','feature','feature',null]);
  const custom=confirmed(PROFILES['agrimap-jenkins']);custom.branching.workTypes.fix={prefix:'fix/',base:'develop',target:'develop',backMerge:[]};
  assert.equal(validatePolicy(custom).ok,false,'a new fix/ work type is refused');
  const h=await fixture(t);const {repo}=await createGitFixture(h,{name:'svc',remote:false});
  const {mkdir,writeFile}=await import('node:fs/promises');
  const legacy=confirmed(PROFILES['agrimap-jenkins']);
  for(const type of ['fix','refactor','docs','chore'])legacy.branching.workTypes[type]={prefix:`${type}/`,base:'develop',target:'develop',backMerge:[]};
  legacy.branching.workTypes.feature.prefix='feat/';
  await mkdir(path.join(repo,'.agrimap-agent','policy'),{recursive:true});
  await writeFile(path.join(repo,POLICY_PATH),JSON.stringify(legacy));
  const loaded=await loadPolicy(repo);
  assert.equal(loaded.validation.ok,true,JSON.stringify(loaded.validation.details));
  assert.deepEqual(Object.keys(loaded.policy.branching.workTypes),['feature','hotfix']);
  assert.equal(loaded.policy.branching.workTypes.feature.prefix,'feature/');
  assert.ok(loaded.validation.warnings.some(w=>w.startsWith('WORK_TYPE_RETIRED:fix,refactor,docs,chore')));
});
