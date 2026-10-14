import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readFile,writeFile,utimes} from 'node:fs/promises';
import path from 'node:path';
import {createHarness} from '../helpers/harness.mjs';
import {createGitFixture,gitIn} from '../helpers/git-fixture.mjs';
import {writeDecision} from '../../skills/agrimap-agent-skills/scripts/decision-records.mjs';
import {parseFrontmatter,loadDecisionIndex,recall,scoreEntry,promotable,calibration,preflightCard,recordSignal,readSignals,savePreferences,userKey} from '../../skills/agrimap-agent-skills/scripts/decision-memory.mjs';
import {storeCard,recordChoice} from '../../skills/agrimap-agent-skills/scripts/decision-card.mjs';

async function repo(t){
  const h=await createHarness('agm-memory-');t.after(()=>h.cleanup());
  const {repo}=await createGitFixture(h,{name:'agmws-orders-netcore',remote:false});
  return {h,repo,state:path.join(repo,'.agrimap-agent')};
}
const now=Date.parse('2026-09-19T00:00:00Z');
const card=(overrides={})=>({kind:'convention',topic:'sql/proc-naming',risk:'R1',confidence:'medium',question:'ตั้งชื่อ SP ใหม่แบบไหน',impact:'ชื่อ SP เป็น contract ที่ทีมใช้ค้นหา',checked:['db/procedures'],
  options:[{id:'1',label:'UM_<ENTITY>_Q',effect:'ตามแบบเดิม',value:'UM_<ENTITY>_Q'},{id:'2',label:'usp_<Entity>Get',effect:'แบบใหม่',value:'usp_<Entity>Get'}],
  recommended:'1',recommendedReason:'ตาม repo',blocking:true,default:null,recordAs:'decision',paths:['db/procedures/UM_ORDER_Q.sql'],...overrides});

test('frontmatter parser: trailing comments, arrays, null, quotes; round-trip with writeDecision',async t=>{
  const {repo:root}=await repo(t);
  const parsed=parseFrontmatter('---\nstatus: approved # proposed|approved\nscope_paths: ["src/**", db/*.sql]\nsupersedes: null\nsummary: "a # not comment"\nbad line\n---\n# Decision: X\n');
  assert.deepEqual(parsed.data,{status:'approved',scope_paths:['src/**','db/*.sql'],supersedes:null,summary:'a # not comment'});
  assert.equal(parsed.warnings.length,1);
  const ref=await writeDecision(root,{slug:'proc-naming',topic:'sql/proc-naming',kind:'convention',title:'Proc naming',summary:'SP names use UM_<ENTITY>_Q',requestedBy:'owner',problem:'p',options:'o',decision:'d',value:'UM_<ENTITY>_Q',scopePaths:['db/procedures/**'],now:new Date(now)});
  const {data}=parseFrontmatter(await readFile(path.join(root,'.agrimap-agent',ref),'utf8'));
  assert.equal(data.topic,'sql/proc-naming');assert.equal(data.kind,'convention');assert.equal(data.status,'approved');
  assert.equal(data.summary,'SP names use UM_<ENTITY>_Q');assert.deepEqual(data.scope_paths,['db/procedures/**']);
  assert.equal(data.value,'UM_<ENTITY>_Q');assert.equal(data.card_id,null);assert.equal(data.supersedes,null);
});

test('index rebuilds on count/mtime; old decisions get defaults; scoring, glob and threshold',async t=>{
  const {repo:root,state}=await repo(t);
  await mkdir(path.join(state,'decisions','2026-01'),{recursive:true});
  await writeFile(path.join(state,'decisions','2026-01','01000000-legacy.md'),'---\ntopic: api/error-shape\nstatus: approved\ndate: 2026-01-01\n---\n\n# Decision: Errors use problem+json\n');
  let index=await loadDecisionIndex(root);
  assert.equal(index.rebuilt,true);assert.equal(index.entries[0].kind,'convention');assert.equal(index.entries[0].summary,'Errors use problem+json');
  assert.equal((await loadDecisionIndex(root)).rebuilt,false);
  await writeDecision(root,{slug:'proc-naming',topic:'sql/proc-naming',kind:'convention',title:'t',summary:'SP naming',requestedBy:'o',problem:'p',options:'o',decision:'d',scopePaths:['db/procedures/**'],now:new Date(now)});
  index=await loadDecisionIndex(root);assert.equal(index.rebuilt,true);assert.equal(index.fileCount,2);
  const entry=index.entries.find(e=>e.topic==='sql/proc-naming');
  assert.equal(scoreEntry(entry,{topic:'sql/proc-naming',paths:['db/procedures/UM_X.sql'],kind:'convention',now}),10);
  assert.equal(scoreEntry(entry,{topic:'sql/other',now}),3);
  assert.equal(scoreEntry(entry,{topic:'api/x',now:now+400*86400000}),0);
  const found=await recall({root,topic:'sql/proc-naming',now});
  assert.deepEqual(found.matches.map(m=>m.topic),['sql/proc-naming']);
  assert.ok(JSON.stringify(found).length<=2000);
});

test('recall output stays within 2,000 characters',async t=>{
  const {repo:root}=await repo(t);
  for(let i=0;i<8;i+=1)await writeDecision(root,{slug:`d${i}`,topic:'git/hotfix-base',kind:'workflow',title:'t',summary:'x'.repeat(140),requestedBy:'o',problem:'p',options:'o',decision:'d',now:new Date(now)});
  const found=await recall({root,topic:'git/hotfix-base',limit:8,now});
  assert.ok(JSON.stringify(found).length<=2000,String(JSON.stringify(found).length));
});

test('an approved precedent suppresses the card and is counted as a question avoided (AC10, AC27)',async t=>{
  const {h,repo:root,state}=await repo(t);
  await writeDecision(root,{slug:'proc-naming',topic:'sql/proc-naming',kind:'convention',title:'t',summary:'SP naming',requestedBy:'o',problem:'p',options:'o',decision:'d',value:'UM_<ENTITY>_Q',scopePaths:['db/procedures/**']});
  const stored=await storeCard(state,'s1',card(),{executionId:'e1',memory:true});
  assert.equal(stored.ok,true);assert.equal(stored.suppressed.option.value,'UM_<ENTITY>_Q');assert.match(stored.suppressed.precedent,/proc-naming/);
  const session=JSON.parse(await readFile(path.join(state,'runtime','sessions','s1.json'),'utf8'));
  assert.equal(session.questionsAvoided.length,1);assert.equal(session.lastCard,undefined);
  const off=await storeCard(state,'s1',card(),{executionId:'e1',memory:false});
  assert.ok(off.cardId,'decisionMemory false keeps 4.7.0 behaviour');
  // Audit: complete writes precedents and questionsAvoided.
  const cli=args=>JSON.parse(h.spawn(h.scripts.workspace,[...args,'--cwd',root]).stdout);
  const started=cli(['start','--operation','execute','--session','s2','--requested-by','Tester','--title','Add proc']);
  const executionId=started.activeTask.executionId;
  const sessionFile=path.join(state,'runtime','sessions','s2.json');
  const current=JSON.parse(await readFile(sessionFile,'utf8').catch(()=>'{}'));
  await writeFile(sessionFile,JSON.stringify({...current,questionsAvoided:[{executionId,topic:'sql/proc-naming',precedent:stored.suppressed.precedent}]}));
  await writeFile(path.join(root,'x.sql'),'select 1\n');
  cli(['checkpoint','--session','s2','--execution',executionId,'--event','changed','--milestone','acceptance-slice','--summary','proc','--files','x.sql']);
  cli(['checkpoint','--session','s2','--execution',executionId,'--event','verified','--summary','ok','--status','passed']);
  const done=cli(['complete','--session','s2','--execution',executionId]);
  assert.equal(done.ok,true,JSON.stringify(done));
  const log=gitIn(root,['ls-files','--others','--exclude-standard','.agrimap-agent/logs']).split('\n').find(f=>f.includes(executionId));
  const events=(await readFile(path.join(root,log),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const completed=events.find(e=>e.event==='completed');
  assert.deepEqual(completed.precedents,[stored.suppressed.precedent]);assert.equal(completed.questions_avoided,1);
});

test('same value twice promotes once; decline stops it (AC12)',async t=>{
  const {repo:root,state}=await repo(t);
  const key=userKey();
  for(const chosenValue of ['A','UM_<ENTITY>_Q','UM_<ENTITY>_Q'])await recordSignal(root,{topic:'sql/proc-naming',kind:'convention',risk:'R1',chosenValue,recommendedChosen:true},key);
  assert.deepEqual(promotable(await readSignals(root,key)),[{topic:'sql/proc-naming',value:'UM_<ENTITY>_Q',count:2}]);
  assert.equal((await recall({root,topic:'sql/proc-naming'})).promotable.length,1);
  const {promotionCard}=await import('../../skills/agrimap-agent-skills/scripts/decision-memory.mjs');
  const stored=await storeCard(state,'s1',promotionCard({topic:'sql/proc-naming',value:'UM_<ENTITY>_Q',count:2}),{});
  assert.equal(stored.ok,true,JSON.stringify(stored));
  const declined=await recordChoice(state,{session:'s1',cardId:stored.cardId,choice:'3',requestedBy:'o'});
  assert.equal(declined.ok,true,JSON.stringify(declined));
  assert.deepEqual((await recall({root,topic:'sql/proc-naming'})).promotable,[]);
});

test('promotion "team" writes a decision that later suppresses the card',async t=>{
  const {repo:root,state}=await repo(t);
  const {promotionCard}=await import('../../skills/agrimap-agent-skills/scripts/decision-memory.mjs');
  const stored=await storeCard(state,'s1',promotionCard({topic:'sql/proc-naming',value:'UM_<ENTITY>_Q',count:2}),{});
  const team=await recordChoice(state,{session:'s1',cardId:stored.cardId,choice:'1',requestedBy:'owner'});
  assert.ok(team.written[0].includes('decisions/'));
  const again=await storeCard(state,'s1',card({paths:[]}),{memory:true});
  assert.equal(again.suppressed?.option.value,'UM_<ENTITY>_Q');
});

test('calibration thresholds; autonomy weight auto-decides R0/R1 and reversible R2; ask and alwaysAsk win (AC29, 5.0.1)',async t=>{
  const {repo:root,state}=await repo(t);
  const key=userKey();
  const sig=accepted=>({kind:'convention',topic:`t/${Math.random()}`,risk:'R1',recommendedChosen:accepted});
  assert.equal(calibration([sig(true),sig(true),sig(true),sig(true)]).convention.mode,'default');
  assert.equal(calibration([sig(true),sig(true),sig(true),sig(true),sig(false)]).convention.mode,'decide-and-report');
  assert.equal(calibration([sig(false),sig(false),sig(false),sig(true),sig(true)]).convention.mode,'ask');
  assert.equal(calibration([...Array(10)].map(()=>sig(false)).concat([...Array(10)].map(()=>sig(true)))).convention.acceptRate,1);
  const r1=card({topic:'fe/new-topic',paths:[]});
  // No history yet: the owner's trust is the default, not a calibration result.
  assert.match((await preflightCard(root,r1,{key})).autoDecided.reason,/^autonomy R1 medium/);
  assert.equal((await preflightCard(root,{...r1,confidence:'high'},{key})).autoDecided.option.id,'1');
  assert.equal((await preflightCard(root,{...r1,confidence:'low'},{key})).autoDecided,undefined);
  assert.equal((await preflightCard(root,{...r1,risk:'R2'},{key})).autoDecided,undefined);
  assert.match((await preflightCard(root,{...r1,risk:'R2',reversible:true},{key})).autoDecided.reason,/reversible/);
  for(let i=0;i<6;i+=1)await recordSignal(root,sig(true),key);
  assert.match((await preflightCard(root,r1,{key})).autoDecided.reason,/^calibration convention/);
  for(let i=0;i<10;i+=1)await recordSignal(root,sig(false),key);
  assert.equal((await preflightCard(root,r1,{key})).calibrationMode,'ask');
  for(let i=0;i<10;i+=1)await recordSignal(root,sig(true),key);
  await savePreferences(root,{alwaysAsk:['convention']},key);
  const asked=await preflightCard(root,r1,{key});
  assert.equal(asked.autoDecided,undefined);assert.equal(asked.alwaysAsk,true);
  const stored=await storeCard(state,'s1',r1,{memory:true});assert.ok(stored.cardId);
});

test('decide record writes a signal; recall/list/correction commands; decisionMemory:false skips recall',async t=>{
  const {h,repo:root,state}=await repo(t);
  const cli=args=>JSON.parse(h.spawn(h.scripts.workspace,[...args,'--cwd',root]).stdout);
  // R2 without "reversible" still asks; an R1 medium card would be auto-decided (5.0.1).
  const input=path.join(h.temp,'card.json');await writeFile(input,JSON.stringify(card({topic:'sql/new-thing',paths:[],risk:'R2'})));
  const stored=cli(['decide','card','--session','s1','--input',input]);
  assert.ok(stored.cardId,JSON.stringify(stored));
  assert.equal(cli(['decide','record','--session','s1','--card',stored.cardId,'--choice','2','--requested-by','owner']).ok,true);
  const signals=await readSignals(root);
  assert.equal(signals.at(-1).chosenValue,'usp_<Entity>Get');assert.equal(signals.at(-1).recommendedChosen,false);
  assert.equal(cli(['recall','--topic','sql/new-thing']).matches[0].topic,'sql/new-thing');
  assert.equal(cli(['decide','list','--status','approved']).decisions.length,1);
  assert.equal(cli(['decide','correction','--topic','sql/new-thing','--from','usp_<Entity>Get','--to','UM_X_Q']).signal.source,'correction');
  await mkdir(state,{recursive:true});
  await writeFile(path.join(state,'config.json'),JSON.stringify({governance:{decisionMemory:false}}));
  assert.equal(cli(['recall','--topic','sql/new-thing']).skipped,true);
});

test('hook digest: first prompt ≤ 600 chars, next prompt none, new branch again (AC11)',async t=>{
  const {h,repo:root}=await repo(t);
  await writeDecision(root,{slug:'hotfix-base',topic:'git/hotfix-base',kind:'workflow',title:'t',summary:'s',requestedBy:'o',problem:'p',options:'o',decision:'d'});
  await loadDecisionIndex(root);
  await mkdir(path.join(root,'.agrimap-agent'),{recursive:true});
  await writeFile(path.join(root,'.agrimap-agent','config.json'),JSON.stringify({activation:{auto:true}}));
  const hook=()=>h.run(h.scripts.hook,['--provider','claude'],{cwd:root,session_id:'d1',hook_event_name:'UserPromptSubmit',prompt:'/agrimap-agent-skills:agm-exec แก้ export ให้รองรับ CSV'},root);
  const digestOf=out=>(out.hookSpecificOutput?.additionalContext||'').split('\n').filter(line=>/^AGM digest:|^Decisions:|^Open execution:/.test(line)).join('\n');
  const first=digestOf(hook());
  assert.match(first,/^AGM digest: target agmws-orders-netcore · branch main/);assert.match(first,/Decisions: 1 approved; recent topics: git\/hotfix-base/);
  assert.ok(first.length<=600);
  assert.equal(digestOf(hook()),'');
  gitIn(root,['switch','-q','-c','feature/csv']);
  assert.match(digestOf(hook()),/branch feature\/csv/);
});

test('hook shows pending work first and answers งานค้าง / ทำต่อ / savepoint without a lifecycle (5.0.1)',async t=>{
  const {h,repo:root}=await repo(t);
  await mkdir(path.join(root,'.agrimap-agent'),{recursive:true});
  await writeFile(path.join(root,'.agrimap-agent','config.json'),JSON.stringify({activation:{auto:true}}));
  const ws=args=>JSON.parse(h.spawn(h.scripts.workspace,[...args,'--cwd',root]).stdout);
  ws(['identify','--session','s1','--owner','006006']);
  const id=ws(['start','--session','s1','--operation','execute','--persist','--title','Add CSV export']).activeTask.executionId;
  assert.equal(ws(['savepoint','--session','s1','--execution',id,'--remaining','writer;tests','--next','write the CSV writer']).ok,true);
  const hook=(session,prompt)=>h.run(h.scripts.hook,['--provider','claude'],{cwd:root,session_id:session,hook_event_name:'UserPromptSubmit',prompt},root).hookSpecificOutput?.additionalContext||'';
  const lines=hook('d2','/agrimap-agent-skills:agm-exec แก้ export ให้รองรับ CSV').split('\n');
  const digestStart=lines.findIndex(line=>line.startsWith('AGM digest:'));
  assert.equal(lines[digestStart+1],`⏸ Pending work 1: ${id} "Add CSV export" next: write the CSV writer. Tell the requester once; ทำต่อ resumes it.`);
  assert.match(hook('d2','งานค้าง'),/^Unfinished work \(1\): run agm-workspace\.mjs pending/);
  assert.match(hook('d2','ทำต่อครับ'),new RegExp(`^Resume ${id} "Add CSV export": run agm-workspace\\.mjs resume --execution ${id} --session d2`));
  assert.match(hook('s1','savepoint'),new RegExp(`^Write a savepoint for ${id}`));
  assert.match(hook('s1','แก้ validation ในโค้ด service นี้'),new RegExp(`Open execution ${id} "Add CSV export" next: write the CSV writer`));
  assert.equal(hook('d2','ตัวอย่างคำสั่ง "งานค้าง"'),'');
});

test('decide promote requires --topic and --value',async t=>{
  const {h,repo:root}=await repo(t);
  const cli=args=>JSON.parse(h.spawn(h.scripts.workspace,[...args,'--cwd',root]).stdout);
  assert.equal(cli(['decide','promote','--session','s1']).code,'PROMOTION_INVALID');
  assert.equal(cli(['decide','promote','--session','s1','--topic','sql/x']).code,'PROMOTION_INVALID');
});
