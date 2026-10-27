import {parseDocument,isMap,isSeq,isScalar} from 'yaml'
import {fixtureYamlFields} from './v1223-yaml-analysis.mjs'
// Simulated browser IPC only. Production Saphyr ranges and actual file bytes
// are tested separately; this fixture is never native installation evidence.
export function fixtureYamlBlockFieldDelete(args){
 const {content,start,end}=args,byte=(s,n)=>new TextEncoder().encode(s.slice(0,n)).length,doc=parseDocument(content);let parent,index,route
 const visit=(n,path=[],blocked=false)=>{if(!n)return;blocked ||=!!n.anchor||!!n.tag;if(isMap(n)){blocked ||=n.items.some(p=>typeof p.key?.value!=='string'||p.key?.value==='<<');n.items.forEach((p,i)=>{if(!blocked&&byte(content,p.key.range[0])===start&&byte(content,p.key.range[1])===end){parent=n;index=i;route=path}visit(p.value,[...path,p.key?.value],blocked)})}else if(isSeq(n))n.items.forEach((v,i)=>visit(v,[...path,i],blocked))};visit(doc.contents)
 if(doc.errors.length||!parent)throw Error('字段归属不明确，请定位源码；草稿仍保留')
 const pair=parent.items[index],value=pair.value
 if(!['BLOCK_LITERAL','BLOCK_FOLDED'].includes(value?.type))return fixtureYamlFields(args,true)
 if(!isScalar(value)||value.anchor||value.tag)throw Error('字段结构无法准确删除，请定位源码；草稿仍保留')
 const from=content.lastIndexOf('\n',pair.key.range[0]-1)+1,indent=content.slice(from,pair.key.range[0])
 if(!/^ *$/.test(indent))throw Error('缩进归属不明确，请定位源码；草稿仍保留')
 let headerEnd=content.indexOf('\n',pair.key.range[1]);if(headerEnd<0)headerEnd=content.length
 const header=content.slice(pair.key.range[1],headerEnd).replace(/\r$/,''),marker=header.slice(1).trimStart();let finish=value.range[1]
 if(!marker.split(/[ \t#]/)[0].includes('+')&&headerEnd<content.length){while(finish>headerEnd+1){const previous=content.lastIndexOf('\n',finish-2)+1;if(content.slice(previous,finish).trim())break;finish=previous}}
 const comment=header.includes('#')?header.slice(header.indexOf('#')):'',eol=content.slice(0,finish).endsWith('\r\n')?'\r\n':content.slice(0,finish).endsWith('\n')?'\n':''
 const replacement=parent.items.length===1?indent+'{}'+(comment?' '+comment:'')+eol:comment?indent+comment+eol:''
 const result=content.slice(0,from)+replacement+content.slice(finish),expected=doc.toJS(),at=(root,path)=>path.reduce((n,k)=>n[k],root)
 delete at(expected,route)[pair.key.value]
 const after=parseDocument(result);if(after.errors.length||JSON.stringify(after.toJS())!==JSON.stringify(expected))throw Error('无法确认只删除当前字段，请定位源码；草稿仍保留')
 let mapping=after.contents;for(const key of route)mapping=isSeq(mapping)?mapping.items[key]:mapping.items.find(p=>p.key.value===key).value
 const selected=mapping.items[Math.min(index,mapping.items.length-1)]?.key||mapping
 return{content:result,start:byte(result,selected.range[0]),end:byte(result,selected.range[1])}
}
