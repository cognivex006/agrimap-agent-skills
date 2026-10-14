import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHarness} from '../helpers/harness.mjs';
import {initRepo,gitIn} from '../helpers/git-fixture.mjs';
import {parseLocalMemory,renderLocalMemory,upsertRow,setLocalPath,addWorkingNote,ensureStateIgnore,localPathsForLeakCheck,LOCAL_MEMORY_MARKER} from '../../skills/agrimap-agent-skills/scripts/local-memory.mjs';

async function fixture(t){const h=await createHarness('agm-local-');t.after(()=>h.cleanup());return h;}

test('parse/render round-trip keeps human lines; missing marker is a warning, not an error',()=>{
  let text=renderLocalMemory(null).replace('## Working notes\n','## Working notes\n\n- my own note\n');
  text=upsertRow(text,'spec',{id:'orders-spec',path:'D:\\Work\\orders-spec',version:'1.0.0',verified:'2026-09-18'});
  const parsed=parseLocalMemory(text);
  assert.deepEqual(parsed.specs,[{id:'orders-spec',path:'D:/Work/orders-spec',version:'1.0.0',verified:'2026-09-18'}]);
  assert.ok(text.includes('- my own note'));
  assert.deepEqual(parseLocalMemory('# notes only\n').warnings,['LOCAL_MEMORY_UNRECOGNIZED']);
  assert.deepEqual(localPathsForLeakCheck(parsed).sort(),['d:/work/orders-spec','d:\\work\\orders-spec']);
});

test('setLocalPath edits only its row and does not churn verified within a day',async t=>{
  const h=await fixture(t);
  await setLocalPath(h.temp,{kind:'spec',id:'a-spec',path:path.join(h.temp,'a'),date:'2026-09-18'});
  await setLocalPath(h.temp,{kind:'repo',id:'b-repo',path:path.join(h.temp,'b'),date:'2026-09-18'});
  const file=path.join(h.temp,'.agrimap-agent/local/memory.md');
  await writeFile(file,(await readFile(file,'utf8'))+'\n- human line\n');
  assert.equal((await setLocalPath(h.temp,{kind:'spec',id:'a-spec',path:path.join(h.temp,'a'),date:'2026-09-18'})).written,false);
  assert.equal((await setLocalPath(h.temp,{kind:'spec',id:'a-spec',path:path.join(h.temp,'a2'),date:'2026-09-18'})).written,true);
  const parsed=parseLocalMemory(await readFile(file,'utf8'));
  assert.equal(parsed.specs[0].path,path.join(h.temp,'a2').replaceAll('\\','/'));
  assert.equal(parsed.repos[0].id,'b-repo');
  assert.ok((await readFile(file,'utf8')).includes('- human line'));
});

test('agent working notes are capped at ten without touching human notes',async t=>{
  const h=await fixture(t);
  await addWorkingNote(h.temp,{text:'first',date:'2026-09-01'});
  const file=path.join(h.temp,'.agrimap-agent/local/memory.md');
  await writeFile(file,(await readFile(file,'utf8')).replace('- (agm 2026-09-01) first','- (agm 2026-09-01) first\n- keep me'));
  for(let i=2;i<=12;i+=1)await addWorkingNote(h.temp,{text:`note ${i}`,date:'2026-09-02'});
  const notes=parseLocalMemory(await readFile(file,'utf8')).notes;
  assert.equal(notes.filter(n=>n.agent).length,10);
  assert.ok(notes.some(n=>n.text==='- keep me'));
  assert.ok(!notes.some(n=>n.text.includes(') first')));
  assert.ok((await readFile(file,'utf8')).includes(LOCAL_MEMORY_MARKER));
});

test('ensureStateIgnore appends local/ once to an existing ignore file and Git ignores local memory',async t=>{
  const h=await fixture(t);await initRepo(h.temp);
  const state=path.join(h.temp,'.agrimap-agent');await mkdir(state,{recursive:true});
  await writeFile(path.join(state,'.gitignore'),'runtime/\ncache/\n');
  await ensureStateIgnore(state);await ensureStateIgnore(state);
  assert.equal(await readFile(path.join(state,'.gitignore'),'utf8'),'runtime/\ncache/\nlocal/\nprompts/\n');
  await setLocalPath(h.temp,{kind:'repo',id:'x-repo',path:h.temp,date:'2026-09-18'});
  gitIn(h.temp,['check-ignore','-q','.agrimap-agent/local/memory.md']);
  // Runtime layout writes (new projects) also ignore local/.
  const other=path.join(h.temp,'fresh');await initRepo(other);
  h.run(h.scripts.workspace,['init','--cwd',other]);
  assert.match(await readFile(path.join(other,'.agrimap-agent/.gitignore'),'utf8'),/^local\/$/m);
});
