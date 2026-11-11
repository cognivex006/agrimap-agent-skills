// Agent profile registry (6.4.0): valid, every role covered, no authority fields,
// hash changes when a rule pack changes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {cp,mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadProfiles,validateProfiles,profileHash,resolveProfile,ROLES} from '../../skills/agrimap-agent-skills/scripts/agent-profiles.mjs';

const registry=loadProfiles();

test('shipped registry is valid and covers every subagent role',()=>{
  assert.deepEqual(validateProfiles(registry),[]);
  for(const role of ROLES) assert.ok(registry.profiles.some(p=>p.role===role),role);
  const doc=registry.profiles.length;
  assert.ok(doc>=ROLES.length);
});

test('profiles cannot grant permission',()=>{
  for(const key of ['permissions','tools','writes','depth','publish','merge','model']){
    const bad={profiles:[{id:'x-bad',role:'Worker',lanes:['sql'],rulePacks:['goal-rules.md'],[key]:true}]};
    assert.ok(validateProfiles(bad).some(e=>e.includes('cannot grant permission')),key);
  }
  assert.ok(validateProfiles({profiles:[{id:'leader',role:'Leader',lanes:['*'],rulePacks:['goal-rules.md']}]}).some(e=>/unknown role/.test(e)),'the Leader is not a profile');
});

test('resolve picks the lane profile, falls back to a wildcard profile, and hashes rule packs',async t=>{
  assert.equal(resolveProfile(registry,{role:'Worker',lane:'be-main'}).id,'worker-be');
  assert.equal(resolveProfile(registry,{role:'Explorer',lane:'sql'}).id,'explorer');
  assert.equal(resolveProfile(registry,{role:'Worker',lane:'go'}),null);
  const skill=path.resolve('skills/agrimap-agent-skills');
  const dir=await mkdtemp(path.join(os.tmpdir(),'agm-profiles-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(path.join(skill,'references','goal-rules.md'),path.join(dir,'references','goal-rules.md'),{recursive:true});
  const profile={id:'explorer',role:'Explorer',lanes:['*'],rulePacks:['goal-rules.md']};
  const before=profileHash(profile,dir);
  assert.equal(before,profileHash(profile,skill),'same content, same hash');
  const file=path.join(dir,'references','goal-rules.md');
  await writeFile(file,(await readFile(file,'utf8'))+'\nchanged\n');
  assert.notEqual(profileHash(profile,dir),before,'rule-pack change changes the hash');
});
