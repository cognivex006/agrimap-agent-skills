import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHarness,projectRoot} from '../helpers/harness.mjs';
import {scanCode,scanSql,scanRepository} from '../../skills/agrimap-agent-skills/scripts/sql-context-scan.mjs';

// agm-sql context check (owner decision 2026-10-14, 5.0.1).
const repository=`public class RoleRepository {
  public async Task Search() {
    var result = await _dataAccessConfiguration.CallProcedureAsync(
        _db.DefaultDataSource,
        "um_role_user_search_q",
        parameters);
    if (!result.Success) throw result.Message.ToProcedureException(result.GetOutputParameter<string>("error_detail"));
    var p = new Dictionary<string, object> { { "PI_USER_ID", 1 } };
    command.CommandType = CommandType.StoredProcedure;
    command.CommandText = "UM_ROLE_I";
    var raw = "[agrimap_app].[LUT_TITLE_Q]";
    var column = "FORM_TEMPLATE_ID";
  }
}`;
const procedure=`CREATE OR ALTER PROCEDURE [agrimap_app].[UM_ROLE_USER_SEARCH_Q]
  @PI_KEYWORD NVARCHAR(100)
AS
BEGIN
  -- FROM COMMENTED_OUT_TABLE is not a use
  WITH ACTIVE_ROLE AS (SELECT ID FROM [agrimap_app].[UM_ROLE] WHERE DEL_FLAG = 0)
  SELECT u.ID FROM [agrimap_app].[UM_USER] u
  JOIN ACTIVE_ROLE r ON r.ID = u.ROLE_ID
  JOIN agrimap_app.UM_USER_ROLE ur ON ur.USER_ID = u.ID
  CROSS APPLY (SELECT value FROM STRING_SPLIT(@PI_KEYWORD, '^')) k
  INSERT INTO #TEMP_RESULT SELECT 1;
  EXEC [agrimap_app].[APP_USER_LOG_I] @PI_ACTION = 1;
END`;

test('code: procedure-call arguments in any case, schema-qualified and CommandType literals; never parameters or columns',()=>{
  const names=scanCode(repository).map(hit=>hit.name).sort();
  assert.deepEqual(names,['LUT_TITLE_Q','UM_ROLE_I','UM_ROLE_USER_SEARCH_Q']);
});

test('sql: definitions, one-hop tables without CTEs, functions, temp tables or comments, and nested EXEC',()=>{
  const scanned=scanSql(procedure);
  assert.deepEqual(scanned.defined,[{name:'UM_ROLE_USER_SEARCH_Q',schema:'agrimap_app',type:'procedure'}]);
  assert.deepEqual(scanned.tables.sort(),['UM_ROLE','UM_USER','UM_USER_ROLE']);
  assert.deepEqual(scanned.procedures,['APP_USER_LOG_I']);
});

test('repository: used objects, local DDL from repo SQL and db-schema references, missing list and include patterns',async t=>{
  const h=await createHarness('agm-sqlscan-');t.after(()=>h.cleanup());
  const root=path.join(h.temp,'agmws-roles-netcore');
  await mkdir(path.join(root,'Src','Repositories'),{recursive:true});
  await writeFile(path.join(root,'Src','Repositories','RoleRepository.cs'),repository);
  await mkdir(path.join(root,'sql','UM','procedure'),{recursive:true});
  await writeFile(path.join(root,'sql','UM','procedure','UM_ROLE_USER_SEARCH_Q.sql'),procedure);
  const references=path.join(root,'.agrimap-agent','knowledge','references','db-schema','um','tables');
  await mkdir(references,{recursive:true});
  await writeFile(path.join(references,'UM_USER.sql'),'-- sqlctx-context: {}\nCREATE TABLE [agrimap_app].[UM_USER] (\n  [ID] NUMERIC(38, 0) NOT NULL\n);\n');
  await mkdir(path.join(root,'bin'),{recursive:true});
  await writeFile(path.join(root,'bin','Generated.cs'),'CallProcedureAsync(x, "SHOULD_NOT_APPEAR_Q")');
  const result=await scanRepository(root);
  assert.equal(result.ok,true);
  const byName=Object.fromEntries(result.objects.map(item=>[item.name,item]));
  assert.deepEqual(Object.keys(byName).sort(),['LUT_TITLE_Q','UM_ROLE','UM_ROLE_I','UM_ROLE_USER_SEARCH_Q','UM_USER','UM_USER_ROLE']);
  assert.equal(byName.UM_ROLE_USER_SEARCH_Q.local,'sql/UM/procedure/UM_ROLE_USER_SEARCH_Q.sql');
  assert.equal(byName.UM_USER.local,'.agrimap-agent/knowledge/references/db-schema/um/tables/UM_USER.sql');
  assert.equal(byName.UM_USER.type,'table');assert.deepEqual(byName.UM_USER.via,['UM_ROLE_USER_SEARCH_Q']);
  assert.match(byName.UM_ROLE_I.usedBy[0],/^Src\/Repositories\/RoleRepository\.cs:\d+$/);
  assert.deepEqual(result.missing,['LUT_TITLE_Q','UM_ROLE','UM_ROLE_I','UM_USER_ROLE']);
  assert.deepEqual(result.includePatterns,['agrimap_app.LUT_TITLE_Q','agrimap_app.UM_ROLE','agrimap_app.UM_ROLE_I','agrimap_app.UM_USER_ROLE']);
  assert.match(result.note,/run check again/);
  assert.ok(result.scanned.ms<5000);
});

test('CLI prints the same JSON',async t=>{
  const h=await createHarness('agm-sqlscan-cli-');t.after(()=>h.cleanup());
  await writeFile(path.join(h.temp,'A.cs'),'CallProcedureAsync(ds, "ORDER_Q", p);');
  const out=JSON.parse(h.spawn(path.join(projectRoot,'skills/agrimap-agent-skills/scripts/sql-context-scan.mjs'),['--cwd',h.temp]).stdout);
  assert.deepEqual(out.missing,['ORDER_Q']);assert.equal(out.objects[0].type,'procedure');
});
