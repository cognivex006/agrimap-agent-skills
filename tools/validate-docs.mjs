import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

async function markdownFiles(dir) {
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) files.push(...await markdownFiles(file));
    else if(entry.name.endsWith('.md')) files.push(file);
  }
  return files;
}
const exists=file=>stat(file).then(()=>true,()=>false);
const withoutFences=text=>text.replace(/```[\s\S]*?```/g,'');
function anchors(text) {
  return new Set([
    ...[...text.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]),
    ...[...withoutFences(text).matchAll(/^#{1,6}\s+(.+)$/gm)].map(m=>m[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-')),
  ]);
}
// Relative links and #anchors in the given Markdown files (6.3.0: also the
// quality/security references, not only beginner docs).
export async function checkLinks(root,files) {
  const errors=[];
  for(const file of files) {
    const text=await readFile(file,'utf8');
    for(const match of withoutFences(text).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const link=match[1];
      if(/^[a-z]+:/i.test(link))continue;
      const [relative,fragment]=link.split('#');
      const target=relative?path.resolve(path.dirname(file),decodeURIComponent(relative)):file;
      if(!await exists(target)) errors.push(`${path.relative(root,file).split(path.sep).join('/')}: missing link ${link}`);
      else if(fragment&&target.endsWith('.md')&&!anchors(await readFile(target,'utf8')).has(decodeURIComponent(fragment))) errors.push(`${path.relative(root,file).split(path.sep).join('/')}: missing anchor ${link}`);
    }
  }
  return errors;
}
export {markdownFiles};
export async function validateDocumentation(root,{mirrors=true}={}) {
  const errors=[];
  const files=[path.join(root,'README.md'),...await markdownFiles(path.join(root,'docs')),...await markdownFiles(path.join(root,'examples'))];
  const config=JSON.parse(await readFile(path.join(root,'config/operations.json'),'utf8'));
  const aliases=new Map(config.operations.map(o=>[o.name,o]));
  for(const file of files) {
    const text=await readFile(file,'utf8');
    for(const match of withoutFences(text).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link=match[1];
      if(/^[a-z]+:/i.test(link))continue;
      const [relative,fragment]=link.split('#');
      const target=relative?path.resolve(path.dirname(file),decodeURIComponent(relative)):file;
      if(!await exists(target)) errors.push(`${path.relative(root,file)}: missing link ${link}`);
      else if(fragment&&target.endsWith('.md')&&!anchors(await readFile(target,'utf8')).has(decodeURIComponent(fragment))) errors.push(`${path.relative(root,file)}: missing anchor ${link}`);
    }
    for(const fence of text.matchAll(/```text\r?\n([\s\S]*?)```/g)) {
      for(const match of fence[1].matchAll(/(?:\$|\/(?:agrimap-agent-skills:)?)(agm-[a-z-]+)(?:\s+action=([a-z]+))?/g)) {
        const operation=aliases.get(match[1]);
        if(!operation) errors.push(`${path.relative(root,file)}: unknown example alias ${match[1]}`);
        else if(match[2]&&!operation.actions?.some(a=>a.name===match[2])) errors.push(`${path.relative(root,file)}: unsupported action ${match[1]}/${match[2]}`);
      }
    }
    if(mirrors) {
      const relative=path.relative(root,file);
      const copy=path.join(root,'plugins/agrimap-agent-skills',relative);
      if(!await exists(copy)||!(await readFile(file)).equals(await readFile(copy))) errors.push(`stale documentation mirror: ${relative}`);
    }
  }
  const usage=await readFile(path.join(root,'docs/USAGE.md'),'utf8');
  for(const alias of aliases.keys())if(!usage.includes('`'+alias+'`'))errors.push(`USAGE missing operation: ${alias}`);
  return {ok:errors.length===0,files:files.length,errors};
}
if(path.resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)) {
  const result=await validateDocumentation(process.cwd());
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}
