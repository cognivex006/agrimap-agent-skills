import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatGolden,formatTable,goldenType,parseYaml,MANAGED_HEADER_PREFIX} from '../../skills/agrimap-agent-skills/scripts/sql-golden-format.mjs';
import {scanRepository} from '../../skills/agrimap-agent-skills/scripts/sql-context-scan.mjs';
import {validateSqlArtifacts} from '../../skills/agrimap-agent-skills/scripts/validate-sql-artifacts.mjs';

// agm-sql golden format (owner decision 2026-10-15, 5.0.1). Fixtures are table_metadata
// YAML written by sql-context-pack 3.1.0 code (PyYAML safe_dump), so no database is needed.
const here=path.dirname(fileURLToPath(import.meta.url));
const exportRoot=path.join(here,'../fixtures/sql-context-3.1.0/export');
const fixture=name=>readFile(path.join(exportRoot,'demo/table_metadata',name),'utf8');
const codes=result=>result.deviations.map(item=>item.code);
const noFormat=()=>({ok:true,code:0});
const temp=()=>mkdtemp(path.join(os.tmpdir(),'agm-golden-'));

test('reads PyYAML table_metadata including Thai text, quotes and nested values',async()=>{
  const data=parseYaml(await fixture('dbo__ORDER_ITEM.yaml'));
  assert.equal(data.description,'รายการสินค้าในคำสั่งซื้อ');
  assert.deepEqual(data.columns[0].identity,{seed:'1',increment:'1'});
  assert.equal(data.columns.find(c=>c.name==='LINE_TOTAL').computed.persisted,true);
  assert.deepEqual(data.foreign_keys[1].source_columns,['ORDER_ID','ITEM_CODE']);
  assert.deepEqual(parseYaml("a: 'it''s'\nb: \"x\\ty\"\nc: []\nd: null\ne:\n- 1\n- two words\n  folded\n"),{a:"it's",b:'x\ty',c:[],d:null,e:[1,'two words folded']});
});

test('general table: golden layout, database truth and physical column order',async()=>{
  const result=formatTable(parseYaml(await fixture('agrimap_app__FARM_PLOT.yaml')));
  const sql=result.sql;
  assert.match(sql,/^SET ANSI_NULLS ON;\nGO\nSET QUOTED_IDENTIFIER ON;\nGO\nSET XACT_ABORT ON;\nGO/);
  assert.match(sql,/IF OBJECT_ID\(N'\[agrimap_app\]\.\[FARM_PLOT\]', N'U'\) IS NOT NULL\n    THROW 50000/);
  assert.match(sql,/BEGIN TRY\n    BEGIN TRANSACTION;[\s\S]*COMMIT TRANSACTION;\nEND TRY\nBEGIN CATCH/);
  assert.match(sql,/\[ID\] NUMERIC\(38, 0\) IDENTITY\(1, 1\) NOT NULL/);
  assert.match(sql,/\[PLOT_CODE\] NVARCHAR\(50\) NOT NULL/);
  assert.match(sql,/\[AREA_SQM\] AS \(\[AREA_RAI\]\*\(1600\)\),/);
  assert.doesNotMatch(sql,/\[(?:int|nvarchar|numeric)\]/);
  // Order is DATE_CREATED(5) then AREA_RAI(6): the group comment repeats, columns are not moved.
  const order=[...sql.matchAll(/^ {8}(-- [A-Za-z ]+|\[[A-Z_]+\])/gm)].map(m=>m[1]);
  assert.deepEqual(order,['-- Primary Key','[ID]','-- Public and Business Keys','[FARM_PLOT_ID]','[PLOT_CODE]','-- Business Data','[CROP_TYPE_ID]','-- Audit Columns','[DATE_CREATED]','-- Business Data','[AREA_RAI]','-- Audit Columns','[DATE_MODIFIED]','[USER_CREATED]','[USER_MODIFIED]','-- Soft Delete','[DEL_FLAG]','-- Business Data','[AREA_SQM]']);
  // Section order: CREATE TABLE → defaults → FKs → indexes → extended properties.
  const at=text=>sql.indexOf(text);
  assert.ok(at('CREATE TABLE')<at('ADD CONSTRAINT [DF_FARM_PLOT_FARM_PLOT_ID]'));
  assert.ok(at('DEFAULT ((0)) FOR [DEL_FLAG]')<at('WITH CHECK\n'));
  assert.ok(at('CHECK CONSTRAINT [FK_FARM_PLOT_LUT_CROP_TYPE]')<at('CREATE UNIQUE NONCLUSTERED INDEX'));
  assert.ok(at('CREATE UNIQUE NONCLUSTERED INDEX')<at('sp_addextendedproperty'));
  // System-named default keeps its real name.
  assert.match(sql,/ADD CONSTRAINT \[DF__FARM_PLOT__DEL_F__5EBF139D\]\n {8}DEFAULT \(\(0\)\) FOR \[DEL_FLAG\];/);
  assert.match(sql,/CONSTRAINT \[UQ_FARM_PLOT_FARM_PLOT_ID\] UNIQUE NONCLUSTERED \(\[FARM_PLOT_ID\] ASC\)/);
  assert.match(sql,/CONSTRAINT \[CK_FARM_PLOT_AREA\] CHECK \(\[AREA_RAI\]>=\(0\)\)/);
  assert.match(sql,/ON \[agrimap_app\]\.\[FARM_PLOT\] \(\[PLOT_CODE\] ASC\)\n {8}INCLUDE \(\[CROP_TYPE_ID\]\)\n {8}WHERE \(\[DEL_FLAG\]=\(0\)\);/);
  assert.match(sql,/@value = N'รหัสแปลง ''ภายใน''',/);
  assert.deepEqual(codes(result),['default_system_named','ms_description_missing']);
  assert.equal(result.gaps.length,0);
});

test('legacy table: every golden difference is a deviation, nothing is rewritten',async()=>{
  const result=formatTable(parseYaml(await fixture('dbo__ORDER_ITEM.yaml')));
  const sql=result.sql;
  assert.match(sql,/\[ORDER_ITEM_ID\] BIGINT IDENTITY\(1, 1\) NOT NULL/);
  assert.match(sql,/\[ITEM_CODE\] NVARCHAR\(50\) COLLATE Thai_CI_AS NOT NULL/);
  assert.match(sql,/\[NOTE\] NVARCHAR\(MAX\) NULL/);
  assert.match(sql,/\[LINE_TOTAL\] AS \(\[QTY\]\*\[UNIT_PRICE\]\) PERSISTED,/);
  assert.match(sql,/UNIQUE NONCLUSTERED \(\[ORDER_ID\] ASC, \[ITEM_CODE\] DESC\)/);
  assert.match(sql,/REFERENCES \[dbo\]\.\[ORDER_HEAD\] \(\[ORDER_ID\]\)\n {8}ON DELETE CASCADE;/);
  assert.match(sql,/ALTER TABLE \[dbo\]\.\[ORDER_ITEM\] WITH NOCHECK\n {8}ADD CONSTRAINT \[FK_ORDER_ITEM_ITEM\]/);
  assert.match(sql,/-- not rendered: data_compression \(PK_ORDER_ITEM:PAGE\)/);
  assert.match(sql,/DF__ORDER_ITE__QTY__1A2B3C/);
  assert.deepEqual(codes(result),['schema_not_agrimap_app','primary_key_not_id','id_type_nonstandard','audit_baseline_missing','default_system_named','foreign_key_action','foreign_key_not_trusted','ms_description_missing']);
  assert.deepEqual(result.gaps.map(g=>[g.code,g.blocking]),[['not_rendered',false]]);
});

test('missing facts are gaps, never guesses',async()=>{
  const data=parseYaml(await fixture('agrimap_app__FARM_PLOT.yaml'));
  const old=structuredClone(data);
  for(const column of old.columns) delete column.type_sql;
  const blocked=formatTable(old);
  assert.equal(blocked.sql,null);
  assert.equal(blocked.gaps[0].code,'metadata_pre_3_1_0');
  const noType=structuredClone(data);
  noType.columns[2].type_sql=null;
  assert.deepEqual(formatTable(noType).gaps.map(g=>g.code),['column_type_missing']);
  const unknownCluster=structuredClone(data);
  unknownCluster.constraints[0].clustered=null;
  const result=formatTable(unknownCluster);
  assert.match(result.sql,/CONSTRAINT \[PK_FARM_PLOT\] PRIMARY KEY \(\[ID\] ASC\)/);
  assert.equal(result.gaps[0].code,'clustered_unknown');
  assert.equal(goldenType('[agrimap_app].[PHONE]'),'[agrimap_app].[PHONE]');
  assert.equal(goldenType('varbinary(max)'),'VARBINARY(MAX)');
});

test('formatted output passes validate-sql-artifacts and never overwrites managed files',async()=>{
  const root=await temp();
  try{
    const report=await formatGolden({cwd:root,from:exportRoot,sqlfluff:true,format:noFormat});
    assert.equal(report.formatted,'2/2');
    assert.deepEqual(report.written,['.agrimap-agent/knowledge/references/db-schema/agm-golden/sql/AGRIMAP_APP/table/FARM_PLOT.sql','.agrimap-agent/knowledge/references/db-schema/agm-golden/sql/DBO/table/ORDER_ITEM.sql']);
    const golden=path.join(root,report.outRoot);
    const valid=await validateSqlArtifacts({cwd:golden,files:['sql/AGRIMAP_APP/table/FARM_PLOT.sql']});
    assert.deepEqual(valid.issues,[]);
    // Deterministic bytes.
    const first=await readFile(path.join(golden,'sql/AGRIMAP_APP/table/FARM_PLOT.sql'),'utf8');
    await formatGolden({cwd:root,from:exportRoot});
    assert.equal(await readFile(path.join(golden,'sql/AGRIMAP_APP/table/FARM_PLOT.sql'),'utf8'),first);
    // A sql-context-pack managed file at the target path is preserved.
    const managed=path.join(golden,'sql/DBO/table/ORDER_ITEM.sql');
    const content=`${MANAGED_HEADER_PREFIX}{"object_id":"table:dbo.ORDER_ITEM"}\nCREATE TABLE [dbo].[ORDER_ITEM] ([X] int);\n`;
    await writeFile(managed,content);
    const again=await formatGolden({cwd:root,from:exportRoot});
    assert.deepEqual(again.preserved,['.agrimap-agent/knowledge/references/db-schema/agm-golden/sql/DBO/table/ORDER_ITEM.sql']);
    assert.equal(await readFile(managed,'utf8'),content);
    // The golden folder may not overlap the export folder.
    const exportDir=path.join(root,'.agrimap-agent/knowledge/references/db-schema/export');
    await mkdir(exportDir,{recursive:true});
    const overlap=await formatGolden({cwd:root,from:exportDir,out:'.agrimap-agent/knowledge/references/db-schema/export/golden'});
    assert.equal(overlap.code,'GOLDEN_OUT_OVERLAPS_EXPORT');
    // context check resolves the table to the golden copy, not the raw export beside it.
    await writeFile(path.join(root,'.agrimap-agent/knowledge/references/db-schema/FARM_PLOT.sql'),'CREATE TABLE [agrimap_app].[FARM_PLOT] ([ID] int);\n');
    await writeFile(path.join(root,'Repo.cs'),'var raw = "[agrimap_app].[FARM_PLOT]";');
    const scan=await scanRepository(root);
    assert.equal(scan.objects.find(o=>o.name==='FARM_PLOT').local,'.agrimap-agent/knowledge/references/db-schema/agm-golden/sql/AGRIMAP_APP/table/FARM_PLOT.sql');
    const unreadable=await formatGolden({cwd:root,metadata:['missing.yaml']});
    assert.equal(unreadable.ok,false);
    assert.equal(unreadable.metadata_gap[0].code,'metadata_unreadable');
  }finally{await rm(root,{recursive:true,force:true});}
});
