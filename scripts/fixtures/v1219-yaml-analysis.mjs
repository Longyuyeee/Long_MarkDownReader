import {parseAllDocuments,isMap,isScalar,isSeq} from 'yaml'
import {fixtureYamlAnalysis as baseAnalysis,fixtureYamlReplace} from './v1210-yaml-analysis.mjs'
export {fixtureYamlReplace}
// Explicitly simulated browser IPC. Real parser ranges and transforms are Rust.
export function fixtureYamlAnalysis(content){
 const result=baseAnalysis(content),docs=parseAllDocuments(content),byte=i=>new TextEncoder().encode(content.slice(0,i)).length
 const visit=(node,path,blocked=false)=>{
  if(isMap(node)){
   const merged=node.items.some(p=>p.key?.value==='<<')
   for(const pair of node.items){const key=String(pair.key?.value??'复杂键'),child=/^[_\p{L}][_\p{L}\p{N}]*$/u.test(key)?path+'.'+key:path+'['+JSON.stringify(key)+']',entry=result.outline.find(e=>e.path===child),keyNode=pair.key
    if(entry&&keyNode?.range)entry.field={name:key,start:byte(keyNode.range[0]),end:byte(keyNode.range[1]),renameUnavailableReason:docs.length!==1||blocked||merged||!isScalar(keyNode)||typeof keyNode.value!=='string'||keyNode.anchor||keyNode.tag?'复杂键、合并键或多文档请在源码中重命名':undefined}
    visit(pair.value,child,blocked||merged||typeof keyNode?.value!=='string')
   }
  }else if(isSeq(node))node.items.forEach((child,i)=>visit(child,path+'['+i+']',blocked))
 }
 docs.forEach(doc=>visit(doc.contents,'$'));return result
}
export function fixtureYamlRename({content,start,end,name}){
 const field=fixtureYamlAnalysis(content).outline.find(e=>e.field?.start===start&&e.field?.end===end)?.field
 if(!field||field.renameUnavailableReason)throw Error(field?.renameUnavailableReason||'字段位置过期')
 if(!name||name==='<<'||/[\r\n]/.test(name))throw Error('请输入单行字段名；当前草稿未变')
 const bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),raw=decode(bytes.slice(start,end))
 let literal=JSON.stringify(name)
 if(raw.startsWith("'"))literal="'"+name.replaceAll("'","''")+"'"
 else if(!raw.startsWith('"')&&[''+name+': 0\n','{'+name+': 0}'].every(s=>{const d=parseAllDocuments(s);return d.length===1&&!d[0].errors.length&&isMap(d[0].contents)&&d[0].contents.items.length===1&&d[0].contents.items[0].key.value===name}))literal=name
 const candidate=decode(bytes.slice(0,start))+literal+decode(bytes.slice(end)),docs=parseAllDocuments(candidate)
 if(docs.some(d=>d.errors.length))throw Error('同一层级已有这个字段名；当前输入与草稿仍保留')
 return{content:candidate,start,end:start+new TextEncoder().encode(literal).length}
}
