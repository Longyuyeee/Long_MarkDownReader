import {parseAllDocuments,isMap,isScalar,isSeq} from 'yaml'
export {fixtureYamlAnalysis,fixtureYamlReplace,fixtureYamlRename} from './v1219-yaml-analysis.mjs'
// Simulated IPC for Vue/CodeMirror ownership tests only. Native parsing,
// byte ranges, comments and references are independently verified in Rust.
export function fixtureYamlFields(args,remove=false){
 const {content,start,end}=args,docs=parseAllDocuments(content),byte=i=>new TextEncoder().encode(content.slice(0,i)).length
 let target,pair
 const visit=node=>{if(isMap(node)){
  if(args.inside&&byte(node.range[0])===start&&byte(node.range[1])===end)target=node
  for(const p of node.items){if(p.key?.range&&byte(p.key.range[0])===start&&byte(p.key.range[1])===end){target=node;pair=p}visit(p.value)}
 }else if(isSeq(node))node.items.forEach(visit)}
 docs.forEach(d=>visit(d.contents))
 const finish=(text,point,last=point,type)=>({content:text,start:bytePoint(text,point),end:bytePoint(text,last),valueType:type})
 const bytePoint=(text,point)=>new TextEncoder().encode(text.slice(0,point)).length
 if(!remove){
  const {name}=args,value=args.value.trim(),v=parseAllDocuments(value)
  if(!name||name==='<<'||/[\r\n]/.test(name))throw Error('请输入单行字段名')
  if(!value||/[\r\n]/.test(value)||v.length!==1||v[0].errors.length||!isScalar(v[0].contents)||v[0].contents.range[1]!==value.length)throw Error('请输入单行简单值')
  const sample=parseAllDocuments(name+': 0\n'),key=sample.length===1&&!sample[0].errors.length&&isMap(sample[0].contents)&&sample[0].contents.items.length===1&&sample[0].contents.items[0].key.value===name?name:JSON.stringify(name)
  const type=v[0].contents.value===null?'空值':typeof v[0].contents.value==='boolean'?'布尔':typeof v[0].contents.value==='number'?'数字':'文本'
  if(start===0&&end===0&&content.split('\n').every(l=>!l.trim()||l.trimStart().startsWith('#'))){const prefix=content&&!content.endsWith('\n')?'\n':'';return finish(content+prefix+key+': '+value+'\n',content.length+prefix.length,content.length+prefix.length+key.length,type)}
  if(!target)throw Error('映射位置已变化，请重新选择')
  if(target.items.some(p=>p.key.value===name))throw Error('同一层级已有这个字段名；输入与草稿仍保留')
  let at,insert,keyOffset
  if(target.flow){at=target.range[1]-1;const prefix=target.items.length?', ':'';insert=prefix+key+': '+value;keyOffset=prefix.length}
  else{at=target.range[1];const first=target.items[0].key.range[0],indent=' '.repeat(first-(content.lastIndexOf('\n',first-1)+1)),prefix=at&&!content.slice(0,at).endsWith('\n')?'\n':'';insert=prefix+indent+key+': '+value+'\n';keyOffset=prefix.length+indent.length}
  return finish(content.slice(0,at)+insert+content.slice(at),at+keyOffset,at+keyOffset+key.length,type)
 }
 if(!target||!pair||!isScalar(pair.value))throw Error('此字段请在源码中删除')
 const a=pair.key.range[0],b=pair.value.range[1],index=target.items.indexOf(pair)
 let text
 if(target.flow){let from=a,to=b;if(target.items.length>1){if(index<target.items.length-1)to=content.indexOf(',',b)+1;else from=content.lastIndexOf(',',a)}text=content.slice(0,from)+content.slice(to)}
 else if(target.items.length===1)text=content.slice(0,a)+'{}'+content.slice(b)
 else{const from=content.lastIndexOf('\n',a-1)+1,to=content.indexOf('\n',b);text=content.slice(0,from)+content.slice(to<0?content.length:to+1)}
 return finish(text,Math.min(a,text.length))
}
