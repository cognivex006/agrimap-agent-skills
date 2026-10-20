#!/usr/bin/env node
// Maintainer-only local checks. This command never publishes.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function command(root, executable, args) {
  try {
    return execFileSync(executable, args, {cwd:root, encoding:'utf8', stdio:['ignore','pipe','pipe'], maxBuffer:64 * 1024 * 1024}).trim();
  } catch (error) {
    throw new Error(`${executable} failed (${error.status ?? 'launch'}):\n${error.stdout || ''}\n${error.stderr || error.message}`, {cause:error});
  }
}

export function verifyPackage(root, {base, head, run = command, npmCli = process.env.npm_execpath} = {}) {
  if (!npmCli) throw new Error('Run through npm run package:verify (npm_execpath required)');
  if (Boolean(base) !== Boolean(head)) throw new Error('Supply both --base and --head for PR route/commit checks');
  const node = (...args) => run(root, process.execPath, args);
  const git = (...args) => run(root, 'git', args);
  if (base) {
    node('tools/check-package-pr.mjs', base, head, 'true');
    node('tools/check-commit-style.mjs', `origin/${base}..HEAD`);
  }
  // Compare to the starting state so development edits are allowed, but newly
  // generated drift is rejected. Commit generated output before rerunning.
  const snapshot = () => JSON.stringify([
    git('diff', '--binary', 'HEAD'), git('status', '--porcelain', '--untracked-files=all'),
    git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean).sort().map(file=>[
      file, createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex'),
    ]),
  ]);
  const before = snapshot();
  node(npmCli, 'run', 'sync');
  if (snapshot() !== before) throw new Error('GENERATED_DRIFT: review generated changes and rerun verification');
  for (const args of [['test'], ['run','test:release'], ['run','audit:tokens:strict'], ['run','package:build']]) {
    process.stderr.write(`Local verification: npm ${args.join(' ')}\n`);
    node(npmCli, ...args);
  }
  return {ok:true, platform:process.platform, publication:false};
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 4 && args[0] === '--base' && args[2] === '--head')) throw new Error('Use [--base <branch> --head <branch>]');
    console.log(JSON.stringify(verifyPackage(process.cwd(), {base:args[1], head:args[3]}), null, 2));
  } catch (error) {
    console.error(error.stderr?.toString() || error.message); process.exitCode = 1;
  }
}
