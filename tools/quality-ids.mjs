// Rule-ID integrity for the quality/security references (6.3.0). Read-only.
// ADV-* is defined in sonarqube-remediation.md, SEC-* in security-baseline.md,
// each at most once per table. A language or surface file may list one ID on
// several rows (one per Sonar key), but never the same ID + key twice in a
// table, and only IDs that are defined. Golden Lint binds to these IDs
// (decision 0001), so an undefined or doubled ID is drift.
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

const PREFIXES=['ADV','SEC'];

function tables(text){
  const blocks=[];let current=null;
  for(const line of text.split(/\r?\n/)){
    if(line.startsWith('|')){(current||=(blocks.push([]),blocks.at(-1))).push(line);}
    else current=null;
  }
  return blocks;
}
function idsOf(cell,prefix){
  const m=cell.replace(/\*/g,'').trim().match(new RegExp(`^${prefix}-\\d+(?:\\s*[,/]\\s*(?:${prefix}-)?\\d+)*`));
  return m?m[0].split(/\s*[,/]\s*/).map(x=>x.startsWith(`${prefix}-`)?x:`${prefix}-${x}`):[];
}
function rows(text,prefix){
  return tables(text).map(block=>block.map(line=>{
    const cells=line.split('|').slice(1,-1).map(c=>c.trim());
    const ids=idsOf(cells[0]||'',prefix);
    return ids.length?{ids,key:`${ids.join('/')}|${cells[1]||''}`}:null;
  }).filter(Boolean));
}
const dupes=list=>[...new Set(list.filter((x,i)=>list.indexOf(x)!==i))];

export function checkQualityIds(skillDir){
  const refs=path.join(skillDir,'references');
  const errors=[];
  const defined={};
  for(const [p,file] of [['ADV','sonarqube-remediation.md'],['SEC','patterns/security-baseline.md']]){
    const blocks=rows(readFileSync(path.join(refs,file),'utf8'),p);
    for(const block of blocks) for(const d of dupes(block.flatMap(r=>r.ids))) errors.push(`${file}: ${d} defined twice in one table`);
    defined[p]=new Set(blocks.flat().flatMap(r=>r.ids));
  }
  for(const dir of ['sonarqube','security']){
    for(const name of readdirSync(path.join(refs,'patterns',dir)).filter(n=>n.endsWith('.md')&&!n.startsWith('_'))){
      const text=readFileSync(path.join(refs,'patterns',dir,name),'utf8');
      for(const p of PREFIXES){
        const blocks=rows(text,p);
        // "verify", "team" and "—" are placeholders, not keys; they may repeat.
        for(const block of blocks) for(const d of dupes(block.map(r=>r.key).filter(k=>!/\|(?:verify|team|—|-)?$/.test(k)))) errors.push(`${dir}/${name}: row ${d.split('|')[0]} with key "${d.split('|')[1]}" repeated`);
        for(const id of new Set(blocks.flat().flatMap(r=>r.ids))) if(!defined[p].has(id)) errors.push(`${dir}/${name}: ${id} is not defined`);
      }
    }
  }
  return {defined:{ADV:defined.ADV.size,SEC:defined.SEC.size},errors};
}
