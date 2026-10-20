#!/usr/bin/env node
// Local package verification: every non-merge commit a PR adds uses the team header
// "<feature|fix|comment|bump|audit|ci>: <plain description>" (DEVELOPMENT.md).
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {checkCommitHeader} from '../skills/agrimap-agent-skills/scripts/git-flow.mjs';

export function commitStyleFailures(commits) {
  return commits.map(({sha, subject}) => ({sha, subject, ...checkCommitHeader(subject)})).filter(item => !item.ok);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const range = process.argv[2];
  if (!range) { console.error('usage: check-commit-style.mjs <base>..<head>'); process.exit(2); }
  const log = execFileSync('git', ['log', '--no-merges', '--format=%H%x09%s', range], {encoding: 'utf8'});
  const commits = log.split('\n').filter(Boolean).map(line => ({sha: line.slice(0, 40), subject: line.slice(41)}));
  const failures = commitStyleFailures(commits);
  for (const item of failures) console.error(`COMMIT_STYLE_INVALID ${item.sha.slice(0, 7)} "${item.subject}"${item.suggestion ? ` -> "${item.suggestion}"` : ''}`);
  if (failures.length) process.exitCode = 1;
  else console.log(`commit style ok (${commits.length} commits in ${range})`);
}
