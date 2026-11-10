// 6.3.0: the model matrix names tiers, not pinned model releases.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const text=readFileSync('skills/agrimap-agent-skills/references/model-capability-matrix.yaml','utf8');
const entries=[...text.matchAll(/^\s+- \{ tier: (\d), model: ([^,]+), effort: [^}]+\}$/gm)].map(m=>({tier:Number(m[1]),model:m[2].trim()}));

test('subagent tiers use family aliases or tier names, never versioned model IDs',()=>{
  assert.ok(entries.length>=5);
  const allowed=new Set(['haiku','sonnet','opus','economy','standard','frontier']);
  for(const e of entries){
    assert.ok(allowed.has(e.model),`pinned model name: ${e.model}`);
    assert.doesNotMatch(e.model,/\d/,`versioned model: ${e.model}`);
  }
});

test('runtime capability policy: unknown is not false, tier never changes authority',()=>{
  assert.match(text,/unknown_is_not_false: true/);
  assert.match(text,/tier_never_changes_authority: true/);
  assert.match(text,/execution_field_semantics: actual_host_reported_model_or_unknown/);
});
