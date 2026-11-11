import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeGoals,goalId} from '../../skills/agrimap-agent-skills/scripts/goal-graph.mjs';

// A/B goal planning (owner decision 2026-10-16, 5.0.1): the four owner examples.
const goal=(report,given)=>report.goals.find(item=>item.given===given);

test('a downstream entry that uses only part of a goal is A and ready before that goal ends',()=>{
  const report=analyzeGoals({
    goals:[{id:'G001',tasks:['T001','T002']},{id:'G002',tasks:['T003']}],
    tasks:[{id:'T001'},{id:'T002'},{id:'T003',depends_on:['T001']}],
  },{accepted:['T001']});
  assert.equal(goal(report,'G002').class,'A');
  assert.equal(goal(report,'G002').id,'GA002');
  assert.deepEqual(report.ready.map(item=>item.task).sort(),['T002','T003']);
});

test('an entry that uses every task of a goal is B',()=>{
  const report=analyzeGoals({
    goals:[{id:'G001',tasks:['T001','T002']},{id:'G002',tasks:['T003']}],
    tasks:[{id:'T001'},{id:'T002'},{id:'T003',depends_on:['T001','T002']}],
  },{accepted:['T001']});
  assert.equal(goal(report,'G002').id,'GB002');
  assert.deepEqual(goal(report,'G002').entries[0].gates,['GA001']);
  assert.deepEqual(report.ready.map(item=>item.task),['T002']);
  assert.deepEqual(report.groups,{A:['GA001'],B:['GB002']});
});

test('entries gated by different goals stay B and each starts with its own gate',()=>{
  const report=analyzeGoals({
    goals:[{id:'G001',tasks:['P1']},{id:'G002',tasks:['Q1']},{id:'G003',tasks:['X1','X2']}],
    tasks:[{id:'P1'},{id:'Q1'},{id:'X1',depends_on:['P1']},{id:'X2',depends_on:['Q1']}],
  },{accepted:['P1']});
  const x=goal(report,'G003');
  assert.equal(x.class,'B');
  assert.deepEqual(x.entries.map(entry=>[entry.task,entry.gates]),[['X1',['GA001']],['X2',['GA002']]]);
  assert.ok(report.ready.some(item=>item.task==='X1'));
  assert.ok(!report.ready.some(item=>item.task==='X2'));
});

test('one partial entry makes the goal A while the gated entry still waits',()=>{
  const report=analyzeGoals({
    goals:[{id:'G001',tasks:['T001','T002']},{id:'G002',tasks:['Q1']},{id:'G003',tasks:['X1','X2']}],
    tasks:[{id:'T001'},{id:'T002'},{id:'Q1'},{id:'X1',depends_on:['T001']},{id:'X2',depends_on:['Q1']}],
  });
  const x=goal(report,'G003');
  assert.equal(x.id,'GA003');
  assert.deepEqual(x.entries.find(entry=>entry.task==='X2').gates,['GA002']);
});

test('goal numbers create no dependency and a later task inside the goal is not an entry',()=>{
  const report=analyzeGoals({
    goals:[{id:'G001',tasks:['T001']},{id:'G002',tasks:['T002','T003']}],
    tasks:[{id:'T001'},{id:'T002'},{id:'T003',depends_on:['T002','T001']}],
  });
  assert.equal(goal(report,'G002').class,'A');
  assert.deepEqual(goal(report,'G002').entries.map(entry=>entry.task),['T002']);
});

test('a reclassified goal keeps its number and reports the rename',()=>{
  const report=analyzeGoals({
    goals:[{id:'GA001',tasks:['T001']},{id:'GA002',tasks:['T002']}],
    tasks:[{id:'T001'},{id:'T002',depends_on:['T001']}],
  });
  assert.deepEqual(report.renames,[{from:'GA002',to:'GB002'}]);
  assert.equal(goalId('G007','A'),'GA007');
});

test('missing references, cycles and duplicate goal numbers block classification',()=>{
  const missing=analyzeGoals({goals:[{id:'G001',tasks:['T001']}],tasks:[{id:'T001',depends_on:['T404']}]});
  assert.equal(missing.ok,false);
  assert.equal(missing.errors[0].code,'MISSING_DEPENDENCY');
  const cycle=analyzeGoals({goals:[{id:'G001',tasks:['T1','T2']}],tasks:[{id:'T1',depends_on:['T2']},{id:'T2',depends_on:['T1']}]});
  assert.equal(cycle.errors[0].code,'DEPENDENCY_CYCLE');
  const dup=analyzeGoals({goals:[{id:'GA001',tasks:['T1']},{id:'GB001',tasks:['T2']}],tasks:[{id:'T1'},{id:'T2'}]});
  assert.equal(dup.errors[0].code,'GOAL_NUMBER_DUPLICATE');
});

test('a single goal is A with an empty B group and sizing is warned only above 3.5 hours',()=>{
  const report=analyzeGoals({goals:[{id:'G001',tasks:['T1','T2']}],tasks:[{id:'T1',hours:2},{id:'T2',hours:2}]});
  assert.deepEqual(report.groups,{A:['GA001'],B:[]});
  assert.equal(report.warnings[0].code,'GOAL_TOO_LARGE');
  const ok=analyzeGoals({goals:[{id:'G001',tasks:['T1']},{id:'G002',tasks:['T2']}],tasks:[{id:'T1',hours:3.2},{id:'T2',hours:0.5}]});
  assert.deepEqual(ok.warnings,[]);
});

test('delegation by DAG: three independent ready units delegate; otherwise a measured reason (6.4.0)',async()=>{
  const {delegationPlan,DELEGATION_SKIP_REASONS}=await import('../../skills/agrimap-agent-skills/scripts/goal-graph.mjs');
  const task=(id,extra={})=>({id,hours:1,files:[`${id}.cs`],...extra});
  const run=(tasks,opts)=>delegationPlan(analyzeGoals({goals:[{id:'G1',tasks:tasks.map(t=>t.id)}],tasks}),tasks,opts);
  const three=[task('T1'),task('T2'),task('T3')];
  const go=run(three,{hostDelegation:'yes'});
  assert.equal(go.mode,'delegate');assert.equal(go.agents,3);assert.deepEqual(go.units,['T1','T2','T3']);
  assert.equal(run(three,{hostDelegation:'unknown'}).mode,'delegate','unknown is not false');
  const noHost=run(three,{hostDelegation:'no'});
  assert.equal(noHost.delegationSkippedReason,'HOST_NO_DELEGATION');assert.equal(noHost.independent,3);
  const overlap=run([task('T1'),task('T2',{files:['T1.cs']}),task('T3')],{hostDelegation:'yes'});
  assert.equal(overlap.delegationSkippedReason,'FEWER_THAN_THREE_INDEPENDENT');
  assert.deepEqual(overlap.held,[{task:'T2',reason:'FILE_OVERLAP',files:['T1.cs']}]);
  const contract=run([task('T1',{produces:['sp:ORDER_Q']}),task('T2',{consumes:['sp:ORDER_Q']}),task('T3'),task('T4')],{hostDelegation:'yes'});
  assert.equal(contract.mode,'delegate');assert.deepEqual(contract.units,['T1','T3','T4']);
  assert.equal(contract.held[0].reason,'CONTRACT_PENDING');
  const tiny=run(three.map(t=>({...t,hours:0.05})),{hostDelegation:'yes'});
  assert.equal(tiny.delegationSkippedReason,'UNITS_TOO_SMALL');
  const six=run(['T1','T2','T3','T4','T5','T6'].map(id=>task(id)),{hostDelegation:'yes'});
  assert.equal(six.agents,5,'at most five agents');
  for(const r of [noHost,overlap,tiny]) assert.ok(DELEGATION_SKIP_REASONS.includes(r.delegationSkippedReason));
});
