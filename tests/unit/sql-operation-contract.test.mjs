// SQL operation safety rules that were only checked by the retired v2 suite
// (tests/unit/operation-contracts.test.mjs under test:legacy-v2). These are
// current rules in the current wording, now part of npm test.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read=f=>readFileSync(`skills/agrimap-agent-skills/references/${f}`,'utf8');

test('SQL analyze/design/explain never execute or edit, and explain labels evidence',()=>{
  const op=read('operations/sql.md');
  assert.match(op,/For analyze\/design\/explain, use local evidence or managed read-only SQL context; never execute DDL\/DML\/EXEC or edit product files/);
  assert.match(op,/Explain uses FACT, INFERENCE, and UNKNOWN and routes requested modifications to edit/);
});

test('created or edited procedures always declare CREATE OR ALTER PROCEDURE',()=>{
  assert.match(read('operations/sql.md'),/Every created or edited procedure uses CREATE OR ALTER PROCEDURE, never standalone CREATE\/ALTER PROC\(EDURE\)/);
});

test('SQL design does not infer schema semantics without evidence',()=>{
  assert.match(read('patterns/sql.md'),/Do not infer foreign keys, cascade actions, uniqueness, indexes, seed values, delete\/replace\/upsert semantics, permissions, paging\/sorting rules, or message behavior without evidence/);
});
