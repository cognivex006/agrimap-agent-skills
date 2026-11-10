// 6.3.0: quality/security index is generated, its links resolve, and rule IDs
// are defined once and never doubled.
import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {renderQualitySecurityIndex} from '../../skills/agrimap-agent-skills/scripts/quality-index.mjs';
import {checkQualityIds} from '../../tools/quality-ids.mjs';
import {checkLinks,markdownFiles} from '../../tools/validate-docs.mjs';

const root=path.resolve('.');
const skill=path.join(root,'skills/agrimap-agent-skills');
const asset=n=>JSON.parse(readFileSync(path.join(skill,'assets',n),'utf8'));

test('quality-security-index.md matches its generator and every owner exists',()=>{
  const index=asset('quality-security-index.json');
  const text=readFileSync(path.join(skill,'references/quality-security-index.md'),'utf8').replaceAll('\r\n','\n');
  assert.equal(text,renderQualitySecurityIndex(index,asset('sec-coverage.json')),'run npm run sync');
  for(const c of index.concerns) assert.ok(existsSync(path.join(skill,'references',c.owner)),`missing owner ${c.owner}`);
  assert.equal(new Set(index.concerns.map(c=>c.concern)).size,index.concerns.length,'one row per concern');
});

test('quality and security references have no broken links or anchors',async()=>{
  const refs=path.join(skill,'references');
  const files=[...await markdownFiles(path.join(refs,'patterns')),path.join(refs,'sonarqube-remediation.md'),path.join(refs,'quality-security-index.md')];
  assert.deepEqual(await checkLinks(root,files),[]);
});

test('ADV and SEC IDs are defined once and every used ID is defined',()=>{
  const result=checkQualityIds(skill);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.defined.SEC,31);
  assert.ok(result.defined.ADV>=53);
});
