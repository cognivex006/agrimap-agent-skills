// sec-coverage.json (6.3.0): one map of SEC-01..31 across authoring files and the
// Golden Lint scanner. Golden Lint is read, never edited (decision 0001); its
// drift check runs only where Golden Lint is installed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const skill=path.resolve('skills/agrimap-agent-skills');
const patterns=path.join(skill,'references/patterns');
const map=JSON.parse(readFileSync(path.join(skill,'assets/sec-coverage.json'),'utf8'));
const read=f=>readFileSync(path.join(patterns,f),'utf8');
const STATUSES=['automated','heuristic','manual-review','not-implemented','mixed'];
const SURFACES={csharp:'C#',typescript:'TS',angular:'Angular',javascript:'JS',html:'HTML',sql:'SQL',nginx:'nginx',docker:'Docker/CI'};

test('sec-coverage lists SEC-01..31 once, in order, with valid fields',()=>{
  const ids=map.classes.map(c=>c.id);
  assert.deepEqual(ids,Array.from({length:31},(_,i)=>`SEC-${String(i+1).padStart(2,'0')}`));
  for(const c of map.classes){
    assert.ok(STATUSES.includes(c.scanner.status),`${c.id} status`);
    assert.equal(c.scanner.status==='not-implemented',c.scanner.detectors.length===0,`${c.id} status vs detectors`);
    assert.equal(typeof c.examplesTested,'boolean');
    for(const s of c.authoring.surfaces) assert.ok(SURFACES[s],`${c.id} unknown surface ${s}`);
  }
});

test('every class is defined in security-baseline.md with the same title',()=>{
  const baseline=read('security-baseline.md');
  for(const c of map.classes) assert.ok(baseline.includes(`| ${c.id} ${c.title} (${c.mapping})`),`${c.id} missing or renamed in baseline`);
});

test('security-matrix.md has a row per class with the same surfaces',()=>{
  const matrix=read('security-matrix.md');
  const header=matrix.match(/^\| Class \|(.+)\|$/m)[1].split('|').map(s=>s.trim());
  const rows=new Map();
  for(const m of matrix.matchAll(/^\| (SEC-[\d/]+) [^|]*\|(.+)\|$/gm)){
    const cells=m[2].split('|').map(s=>s.trim());
    for(const n of m[1].replace('SEC-','').split('/')) rows.set(`SEC-${n}`,header.filter((_,i)=>cells[i]==='●'));
  }
  for(const c of map.classes){
    assert.ok(rows.has(c.id),`${c.id} has no row in security-matrix.md`);
    assert.deepEqual(rows.get(c.id),c.authoring.surfaces.map(s=>SURFACES[s]),`${c.id} surfaces differ from the matrix`);
  }
});

test('each marked surface file has a row for the class',()=>{
  // First cell may name several classes: "SEC-30/SEC-04", "SEC-07, SEC-28".
  const rowIds=text=>new Set([...text.matchAll(/^\| (SEC-\d\d(?:\s*[,/]\s*SEC-\d\d)*) \|/gm)].flatMap(m=>m[1].match(/SEC-\d\d/g)));
  const missing=[];
  for(const c of map.classes) for(const s of c.authoring.surfaces){
    const file=path.join(patterns,'security',`${s}.md`);
    if(!existsSync(file)||!rowIds(readFileSync(file,'utf8')).has(c.id)) missing.push(`${c.id} → security/${s}.md`);
  }
  assert.deepEqual(missing,[]);
});

function goldenLintDir(){
  if(process.env.AGM_GOLDEN_LINT_DIR) return process.env.AGM_GOLDEN_LINT_DIR;
  try{
    const installed=JSON.parse(readFileSync(path.join(os.homedir(),'.claude/plugins/installed_plugins.json'),'utf8'));
    const entry=Object.entries(installed.plugins||{}).find(([k])=>k.startsWith('agrimap-golden-lint-skills@'))?.[1];
    const record=Array.isArray(entry)?entry[0]:entry;
    const dir=record&&path.join(record.installPath,'skills/agrimap-golden-lint-skills');
    return dir&&existsSync(path.join(dir,'assets/security-classes.json'))?dir:null;
  }catch{return null;}
}

test('scanner fields match the installed Golden Lint (read-only)',t=>{
  const dir=goldenLintDir();
  if(!dir){t.skip('Golden Lint not installed; set AGM_GOLDEN_LINT_DIR to check drift');return;}
  const classes=JSON.parse(readFileSync(path.join(dir,'assets/security-classes.json'),'utf8')).classes;
  const coverage=readFileSync(path.join(dir,'references/COVERAGE.md'),'utf8');
  const drift=[];
  for(const c of map.classes){
    const gl=classes.find(x=>x.class===c.id);
    const detectors=gl?[...coverage.matchAll(new RegExp(`^\\| ([a-z-]+-sec-${gl.slug}) \\|`,'gm'))].map(m=>m[1]):[];
    if((gl?.slug||null)!==c.scanner.slug) drift.push(`${c.id} slug ${c.scanner.slug} vs ${gl?.slug}`);
    if(detectors.join()!==c.scanner.detectors.join()) drift.push(`${c.id} detectors differ`);
  }
  for(const x of classes) if(!map.classes.some(c=>c.id===x.class)) drift.push(`${x.class} only in Golden Lint`);
  assert.deepEqual(drift,[],`Golden Lint drift; recorded ${map.goldenLint.version}, installed at ${dir}`);
});
