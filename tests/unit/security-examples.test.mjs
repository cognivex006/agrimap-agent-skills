// 6.3.0: BAD/GOOD security examples that actually run. TypeScript runs through
// Node type stripping; C# runs with dotnet on a temp copy (skipped without an SDK).
// sec-coverage.json examplesTested must match what is tested here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {copyFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const examples=path.resolve('skills/agrimap-agent-skills/references/patterns/security/examples');
const TESTED={typescript:['SEC-04','SEC-08','SEC-15','SEC-21','SEC-23'],csharp:['SEC-01','SEC-03','SEC-04','SEC-15']};

test('TypeScript SEC-04/08/23: BAD fails the guard, GOOD keeps valid input',async()=>{
  const ex=await import(pathToFileURL(path.join(examples,'typescript/sec-examples.ts')).href);
  const root=path.join(os.tmpdir(),'agm-root');
  assert.ok(!path.resolve(ex.badResolve(root,'../secret')).startsWith(path.resolve(root)+path.sep),'SEC-04 bad escapes');
  assert.throws(()=>ex.goodResolve(root,'../secret'),/PATH_OUTSIDE_ROOT/);
  assert.equal(ex.goodResolve(root,'a/b.txt'),path.resolve(root,'a/b.txt'));
  assert.match(ex.goodToken(),/^[0-9a-f-]{36}$/);
  assert.ok(ex.badToken().length<36,'SEC-08 bad token is short and predictable');
  assert.equal(ex.goodTrimTrailingSlashes('a/b///'),'a/b');
  assert.equal(ex.goodTrimTrailingSlashes('///'),'');
  const long='/'.repeat(50_000)+'x';
  assert.equal(ex.goodTrimTrailingSlashes(long),long,'linear, keeps value without trailing slash');
  assert.equal('a/b///'.replace(ex.BAD_TRAILING_SLASHES,''),ex.goodTrimTrailingSlashes('a/b///'),'same result as the regex it replaces');
});

test('TypeScript SEC-15/21: BAD lets input escape, GOOD keeps valid input',async()=>{
  const ex=await import(pathToFileURL(path.join(examples,'typescript/sec-examples.ts')).href);
  assert.equal(ex.badRedirectTarget('//evil.example'),'//evil.example');
  for(const bad of ['//evil.example','/\\evil.example','https://evil.example/x','javascript:alert(1)']) assert.equal(ex.goodRedirectTarget(bad),'/',bad);
  assert.equal(ex.goodRedirectTarget('/farms/1?tab=a'),'/farms/1?tab=a');
  assert.equal(ex.goodRedirectTarget('https://login.agrimap.example/cb',['https://login.agrimap.example']),'https://login.agrimap.example/cb');
  const attack='<img src=x onerror=alert(1)>';
  assert.match(ex.badCardHtml(attack),/<img /);
  assert.equal(ex.goodCardHtml(attack),'<b>&#60;img src=x onerror=alert(1)&#62;</b>');
  assert.equal(ex.goodCardHtml('Farm A'),'<b>Farm A</b>');
});

function hasDotnet(){try{execFileSync('dotnet',['--version'],{stdio:'ignore'});return true;}catch{return false;}}

test('C# SEC-01/03/04/15: dotnet run of the examples passes every check',async t=>{
  if(!hasDotnet()){t.skip('dotnet SDK not installed');return;}
  const dir=await mkdtemp(path.join(os.tmpdir(),'agm-cs-examples-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await copyFile(path.join(examples,'csharp/SecExamples.cs'),path.join(dir,'SecExamples.cs'));
  await writeFile(path.join(dir,'SecExamples.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><NuGetAudit>false</NuGetAudit></PropertyGroup></Project>');
  let out;
  try{out=execFileSync('dotnet',['run','--nologo','-v','q'],{cwd:dir,encoding:'utf8',timeout:240_000,env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}});}
  catch(error){assert.fail(`dotnet run failed:\n${error.stdout||''}${error.stderr||''}`);}
  assert.doesNotMatch(out,/FAIL/);
  assert.equal((out.match(/^ok /gm)||[]).length,11);
});

test('sec-coverage examplesTested matches the tested examples',()=>{
  const map=JSON.parse(readFileSync('skills/agrimap-agent-skills/assets/sec-coverage.json','utf8'));
  const tested=new Set(Object.values(TESTED).flat());
  for(const c of map.classes) assert.equal(c.examplesTested,tested.has(c.id),`${c.id} examplesTested`);
});
