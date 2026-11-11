// security-patch.mjs (6.4.0): plans only selected findings, never edits code,
// and treats a rescan as the only proof that a fix is verified.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {planPatch,verifyPatch,PATCH_TIERS} from '../../skills/agrimap-agent-skills/scripts/security-patch.mjs';
import {SECURITY_REPORT_SCHEMA,loadCoverage} from '../../skills/agrimap-agent-skills/scripts/security-scan.mjs';

const finding=(fingerprint,cls,file='services/a/Src/P.cs')=>({fingerprint,class:cls,file,line:3});
const report=(findings,outcome=findings.length?'findings':'no-findings')=>({schema:SECURITY_REPORT_SCHEMA,root:'/r',findings,outcome});
const base=report([finding('fp-log','SEC-07'),finding('fp-ovr','SEC-14'),finding('fp-cors','SEC-13'),finding('fp-other','SEC-19')]);

test('every class has a patch tier; contract-changing classes are MANUAL',()=>{
  const coverage=loadCoverage();
  for(const c of coverage.classes) assert.ok(PATCH_TIERS.includes(c.patchTier),c.id);
  const baseline=readFileSync('skills/agrimap-agent-skills/references/patterns/security-baseline.md','utf8');
  const contract=baseline.match(/changes a public contract \(([^)]+)\)/)[1].match(/SEC-\d\d/g);
  for(const id of contract) assert.equal(coverage.classes.find(c=>c.id===id).patchTier,'MANUAL',id);
});

test('plan covers only the selected fingerprints and requires a selection',()=>{
  assert.throws(()=>planPatch({report:base,select:''}),/PATCH_SELECTION_REQUIRED/);
  assert.throws(()=>planPatch({report:base,select:'nope'}),/PATCH_UNKNOWN_FINGERPRINT/);
  assert.throws(()=>planPatch({report:report([],'blocked'),select:'x'}),/PATCH_REPORT_BLOCKED/);
  const plan=planPatch({report:base,select:'fp-log,fp-ovr,fp-cors'});
  assert.deepEqual(plan.items.map(i=>[i.class,i.tier,i.editable]),[['SEC-07','AUTO_SAFE',true],['SEC-14','GUARDED',true],['SEC-13','MANUAL',false]]);
  assert.equal(plan.notSelected,1,'fp-other stays out of the plan');
});

test('verify: only a completed rescan verifies; claims alone stay unverified',()=>{
  const plan=planPatch({report:base,select:'fp-log,fp-ovr,fp-cors'});
  const blocked=verifyPatch({plan,rescan:report([],'blocked'),claimed:['fp-log']});
  assert.equal(blocked.outcome,'unverified');
  assert.equal(blocked.items[0].status,'fixed-unverified');
  const partial=verifyPatch({plan,rescan:report([finding('fp-ovr','SEC-14'),finding('fp-cors','SEC-13'),finding('fp-other','SEC-19')]),claimed:['fp-log','fp-ovr']});
  assert.deepEqual(partial.items.map(i=>i.status),['verified','still-present','manual-decision']);
  assert.equal(partial.outcome,'incomplete');
  const good=verifyPatch({plan,rescan:report([finding('fp-cors','SEC-13'),finding('fp-other','SEC-19')]),claimed:['fp-log','fp-ovr']});
  assert.equal(good.outcome,'verified');
});

test('verify flags a new finding introduced in a patched file',()=>{
  const plan=planPatch({report:base,select:'fp-log'});
  const result=verifyPatch({plan,rescan:report([finding('fp-new','SEC-06')]),claimed:['fp-log']});
  assert.equal(result.introduced.length,1);
  assert.equal(result.outcome,'incomplete');
});
