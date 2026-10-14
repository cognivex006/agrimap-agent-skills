import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHarness,projectRoot} from '../helpers/harness.mjs';
import {createGitFixture} from '../helpers/git-fixture.mjs';
import {splitCommands,gitInvocation,evaluate,guardCommand,sqlctxRevealInvocation} from '../../skills/agrimap-agent-skills/scripts/git-guard.mjs';

const GUARD=path.join(projectRoot,'skills/agrimap-agent-skills/scripts/git-guard.mjs');
const ctx={protectedList:['main','develop','jenkins','jenkins-release','release/*'],currentBranch:'feature/x',release:false};
const verdict=(command,context=ctx)=>{
  let result=null;
  for(const segment of splitCommands(command)){const inv=gitInvocation(segment);if(!inv)continue;const v=evaluate(inv,context);if(v?.decision==='deny')return v;result||=v;}
  return result;
};
const rule=(command,context)=>verdict(command,context)?.rule||null;

test('G1 force and mirror pushes are denied in Bash and PowerShell forms',()=>{
  for(const command of ['git push --force origin feature/x','git push -f','git push -uf origin feature/x','git push --force-with-lease','git push --mirror','git push origin +feature/x','cd repo && git push -f','& git push --force origin feature/x','git -C D:/repo push --force']) assert.equal(rule(command),'G1',command);
  assert.equal(verdict('git push -u origin feature/x'),null);
});

test('G2 pushes to protected branches are denied outside a release execution',()=>{
  for(const command of ['git push origin develop','git push origin HEAD:develop','git push origin feature/x:refs/heads/main','git push origin release/4.9.0','echo ok; git push origin jenkins']) assert.equal(rule(command),'G2',command);
  assert.equal(rule('git push',{...ctx,currentBranch:'develop'}),'G2');
  assert.equal(rule('git push'),null);
  assert.equal(verdict('git push origin develop',{...ctx,release:true}),null,'release exception');
  assert.equal(rule('git push --force origin develop',{...ctx,release:true}),'G1','release never allows force');
});

test('G3 add-everything and .agrimap-agent/local are denied',()=>{
  for(const command of ['git add -A','git add --all','git add .','git add -- .','git add -- .agrimap-agent','git add -f .agrimap-agent/local/memory.md','git add .agrimap-agent/local']) assert.equal(rule(command),'G3',command);
  assert.equal(verdict('git add -- src/a.js .agrimap-agent/logs/2026-09/2026-09-19/1.jsonl'),null);
});

test('G4 and G6 ask; G5 deletes of protected branches and tags are denied',()=>{
  for(const command of ['git reset --hard','git clean -fd','git checkout -- .','git restore .']) assert.deepEqual([rule(command),verdict(command).decision],['G4','ask'],command);
  for(const command of ['git stash','git stash push -m x','git stash pop']) assert.deepEqual([rule(command),verdict(command).decision],['G6','ask'],command);
  for(const command of ['git stash list','git stash show']) assert.equal(verdict(command),null,command);
  for(const command of ['git branch -D develop','git push origin --delete main','git push origin :jenkins','git tag -d v1.0.0','git push origin --delete v4.9.0','git push origin :refs/tags/v1.0.0']) assert.deepEqual([rule(command),verdict(command).decision],['G5','deny'],command);
  assert.equal(verdict('git branch -D feature/old'),null);
  assert.equal(verdict('git push origin --delete feature/old'),null);
});

test('deny wins over ask in a chained command; quotes and redirections are parsed',()=>{
  assert.equal(rule('git stash; git push --force'),'G1');
  assert.equal(verdict('git commit -m "a; git push --force"'),null);
  assert.equal(verdict('git status 2>&1 | Select-String x'),null);
  assert.deepEqual(splitCommands('git add a.js `\n  b.js && git commit -m x'),['git add a.js    b.js','git commit -m x']);
});

test('hook: deny output for Claude, empty output on allow, fail-open on parse errors, guards:false is a no-op (AC13, AC30)',async t=>{
  const h=await createHarness('agm-guard-');t.after(()=>h.cleanup());
  const {repo}=await createGitFixture(h,{name:'svc'});
  const run=(command,extra={})=>spawnSync(process.execPath,[GUARD,'--provider','claude'],{input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command},cwd:repo,session_id:'s1',...extra}),encoding:'utf8'});
  const denied=run('git push origin develop');
  const output=JSON.parse(denied.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName,'PreToolUse');assert.equal(output.hookSpecificOutput.permissionDecision,'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason,/^AGM guard G2: push to protected branch develop/);
  assert.equal(run('git push -u origin feature/x').stdout,'');
  const broken=run('git push "unterminated');
  assert.equal(broken.stdout,'');assert.match(broken.stderr,/fail-open/);assert.equal(broken.status,0);
  await mkdir(path.join(repo,'.agrimap-agent','runtime','active'),{recursive:true});
  await writeFile(path.join(repo,'.agrimap-agent','runtime','active','s1.json'),JSON.stringify({executionId:'1',operation:'release'}));
  assert.equal(run('git push origin develop').stdout,'','release execution may push develop');
  await writeFile(path.join(repo,'.agrimap-agent','config.json'),JSON.stringify({governance:{guards:false}}));
  for(const command of ['git push --force origin develop','git add -A','git stash']) assert.equal(run(command).stdout,'',command);
  assert.equal(await guardCommand('git push --force',{cwd:repo}),null);
});

test('G7 denies commit headers outside the team style in AgriMap repositories (4.9.6)',async t=>{
  const g7={...ctx,commitConvention:'agrimap'};
  for(const command of ['git commit -m "feat(x): add y"','git commit -am "docs: z"',"git commit -m \"$(cat <<'EOF'\nchore: bump\n\nbody\nEOF\n)\"","git commit -m @'\nrefactor: tidy\n'@",'git commit -m "wip"']) assert.deepEqual([rule(command,g7),verdict(command,g7).decision],['G7','deny'],command);
  assert.match(verdict('git commit -m "feat(x): เพิ่มปุ่มส่งออก"',g7).reason,/use "feature: เพิ่มปุ่มส่งออก"/);
  for(const command of ['git commit -m "feature: เพิ่มรับ User หลายช่องทาง"','git commit -m "bump: ขึ้นเวอร์ชัน Production 1.4.2" -m "body"',"git commit -m \"$(cat <<'EOF'\nfix: แก้\nEOF\n)\"",'git commit --amend --no-edit','git commit','git commit -m "$MSG"','git commit -F -',"git commit -m \"Merge branch 'feature/x' into develop\""]) assert.equal(verdict(command,g7),null,command);
  assert.equal(verdict('git commit -m "feat(x): y"',{...g7,commitConvention:'conventional'}),null,'policy opt-out');
  assert.equal(verdict('git commit -m "wip"'),null,'not an AgriMap repository');
  for(const command of ['git commit -m "fix: resolve Windows short paths"','git commit -m "bump: 4.9.8"'])assert.match(verdict(command,g7).reason,/Thai description/,command);
  assert.equal(verdict('git commit -m "fix: resolve paths"',{...g7,commitLanguage:'en'}),null,'policy commitLanguage en');
  const h=await createHarness('agm-guard7-');t.after(()=>h.cleanup());
  const {repo}=await createGitFixture(h,{name:'svc'});
  assert.equal(await guardCommand('git commit -m "wip"',{cwd:repo}),null,'plain repository');
  await mkdir(path.join(repo,'.agrimap-agent'),{recursive:true});
  await writeFile(path.join(repo,'msg.txt'),'docs: x\n\nbody\n');
  assert.equal((await guardCommand('git commit -F msg.txt',{cwd:repo}))?.rule,'G7');
  await writeFile(path.join(repo,'msg.txt'),'comment: ปรับข้อความ\n');
  assert.equal(await guardCommand('git commit -F msg.txt',{cwd:repo}),null);
});

test('G8 the agent never runs sqlctx query --reveal (4.11.0)',async()=>{
  for(const command of ['sqlctx query --reveal --profile demo "SELECT 1"','sqlctx query --sql-file q.sql --reveal','C:/Users/x/Scripts/sqlctx.exe query --reveal q','python -m sqlctx query --reveal q','cd repo && sqlctx query --reveal q']) assert.equal(sqlctxRevealInvocation(splitCommands(command).at(-1)),true,command);
  for(const command of ['sqlctx query "SELECT 1"','sqlctx doctor check --host claude','echo sqlctx query --reveal','grep -- --reveal README.md']) assert.equal(sqlctxRevealInvocation(command),false,command);
  const denied=await guardCommand('sqlctx query --reveal --profile demo q',{cwd:projectRoot});
  assert.equal(denied?.rule,'G8');
  assert.equal(denied?.decision,'deny');
});

test('G9 work branches are feature/ or hotfix/ only in product repositories (5.0.1)',async t=>{
  const g9={...ctx,workBranchRule:true};
  for(const command of ['git switch -c fix/login-error','git checkout -b chore/bump','git branch refactor/tidy develop','git switch --create=docs/readme','git worktree add -b fix/x ../wt develop','git branch -m bugfix/y','git checkout -b login-error']){
    assert.deepEqual([rule(command,g9),verdict(command,g9).decision],['G9','deny'],command);
  }
  assert.match(verdict('git switch -c fix/login-error',g9).reason,/use "feature\/login-error"/);
  for(const command of ['git switch -c feature/login-error','git checkout -b hotfix/prod-crash origin/develop','git worktree add -b feature/x ../wt develop','git switch -c fix/old-work origin/fix/old-work','git checkout -b develop origin/develop','git switch -c claude/agent-work','git branch','git branch --list','git branch -d fix/old','git switch develop','git checkout -- file.txt','git branch -c x y']){
    assert.equal(verdict(command,g9),null,command);
  }
  assert.equal(verdict('git switch -c fix/x',ctx),null,'rule off outside product repositories');
  const h=await createHarness('agm-guard9-');t.after(()=>h.cleanup());
  const {repo}=await createGitFixture(h,{name:'agmws-orders-netcore'});
  assert.equal(await guardCommand('git switch -c fix/x',{cwd:repo}),null,'plain repository');
  await mkdir(path.join(repo,'.agrimap-agent'),{recursive:true});
  assert.equal((await guardCommand('git switch -c fix/x',{cwd:repo}))?.rule,'G9');
  await writeFile(path.join(repo,'package.json'),JSON.stringify({name:'agrimap-agent-skills'}));
  assert.equal(await guardCommand('git switch -c fix/x',{cwd:repo}),null,'the skill package itself develops on fix/*');
});
