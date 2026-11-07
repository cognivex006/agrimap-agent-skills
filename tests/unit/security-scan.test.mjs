// security-scan.mjs (6.3.0): read-only wrapper over Golden Lint. Unit tests use a
// synthetic Golden Lint report; the end-to-end test runs only where Golden Lint
// is installed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildReport,fingerprint,findGoldenLint,loadCoverage,renderMarkdown,SECURITY_REPORT_SCHEMA} from '../../skills/agrimap-agent-skills/scripts/security-scan.mjs';

const coverage=loadCoverage();
const lintFinding=(over={})=>({detectorId:'be-sec-method-override',path:'services/agmws-a/Src/Program.cs',line:3,severity:'medium',disposition:'review-candidate',evidenceFingerprint:'abc',authority:{securityStandard:{class:'SEC-14',category:'A05:2021',cwe:['CWE-650']}},...over});

test('fingerprint ignores line moves and changes with class, file or symbol',()=>{
  const base={classId:'SEC-14',file:'a.cs',symbol:'Configure',evidence:'x'};
  assert.equal(fingerprint(base),fingerprint({...base}));
  assert.notEqual(fingerprint(base),fingerprint({...base,file:'b.cs'}));
  assert.notEqual(fingerprint(base),fingerprint({...base,classId:'SEC-19'}));
  const a=buildReport({root:'/r',coverage,lint:{findings:[lintFinding()],files:[],limitations:[]},goldenLintDir:'/gl'});
  const b=buildReport({root:'/r',coverage,lint:{findings:[lintFinding({line:40})],files:[],limitations:[]},goldenLintDir:'/gl'});
  assert.equal(a.findings[0].fingerprint,b.findings[0].fingerprint);
});

test('report keeps only security findings and lists manual-review classes',()=>{
  const lint={findings:[lintFinding(),{detectorId:'fe-explicit-any',path:'x.ts',line:1}],files:[],limitations:[],coverage:{selected:1}};
  const report=buildReport({root:'/r',coverage,lint,goldenLintDir:'/gl',goldenLintVersion:'0.1.23'});
  assert.equal(report.schema,SECURITY_REPORT_SCHEMA);
  assert.equal(report.findings.length,1);
  assert.equal(report.findings[0].class,'SEC-14');
  assert.equal(report.outcome,'findings');
  assert.deepEqual(report.manualReview.map(c=>c.class),coverage.classes.filter(c=>c.scanner.status==='not-implemented').map(c=>c.id));
  assert.match(renderMarkdown(report),/## Manual review \(no detector\)/);
});

test('no Golden Lint or a failed run is blocked, never a pass',()=>{
  const missing=buildReport({root:'/r',coverage,lint:null,goldenLintDir:null});
  assert.equal(missing.outcome,'blocked');
  assert.match(missing.blocked[0].reason,/not installed/);
  const failed=buildReport({root:'/r',coverage,lint:null,goldenLintDir:'/gl',error:'exit 2'});
  assert.equal(failed.outcome,'blocked');
  const clean=buildReport({root:'/r',coverage,lint:{findings:[],files:[],limitations:[]},goldenLintDir:'/gl'});
  assert.equal(clean.outcome,'no-findings');
  assert.match(renderMarkdown(clean),/not a pass for the manual-review classes/);
});

test('end to end against the installed Golden Lint, read-only unless --write',async t=>{
  if(!findGoldenLint()){t.skip('Golden Lint not installed');return;}
  const dir=await mkdtemp(path.join(os.tmpdir(),'agm-secscan-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const svc=path.join(dir,'services/agmws-demo/Src/Demo.Api');
  await mkdir(svc,{recursive:true});
  await writeFile(path.join(svc,'Program.cs'),'var builder = WebApplication.CreateBuilder(args);\nvar app = builder.Build();\napp.UseHttpMethodOverride();\napp.Run();\n');
  await writeFile(path.join(svc,'Demo.Api.csproj'),'<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
  const script=path.resolve('skills/agrimap-agent-skills/scripts/security-scan.mjs');
  const report=JSON.parse(execFileSync(process.execPath,[script,'scan','--root',dir],{encoding:'utf8',maxBuffer:64*1024*1024}));
  assert.equal(report.scanner.status,'completed');
  assert.ok(report.findings.some(f=>f.class==='SEC-14'),'SEC-14 found');
  assert.ok(!(await readdir(dir)).includes('.agrimap-agent'),'no files written without --write');
});
