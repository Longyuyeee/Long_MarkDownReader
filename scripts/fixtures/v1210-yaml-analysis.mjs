import {parseAllDocuments,isMap,isSeq,isScalar,isAlias} from 'yaml'
// Browser-only simulated IPC. Production positions and edits use Saphyr in Rust.
const fallback='锚点、别名、标签、多行值或没有原文字面量的空值请在源码中修改'
export function fixtureYamlAnalysis(content){
 const docs=parseAllDocuments(content),outline=[],byte=i=>new TextEncoder().encode(content.slice(0,i)).length
 let maxDepth=0
 const visit=(node,path,label,depth,documentIndex,blocked=false)=>{
  if(!node)return
  const start=node.range?.[0]??0,end=node.range?.[1]??start,raw=content.slice(start,end),kind=isMap(node)?'mapping':isSeq(node)?'sequence':isAlias(node)?'alias':'scalar'
  blocked ||= !!node.anchor||!!node.tag
  const editable=docs.length===1&&!blocked&&isScalar(node)&&!['BLOCK_LITERAL','BLOCK_FOLDED'].includes(node.type)&&end>start&&!/[\r\n]/.test(raw)
  maxDepth=Math.max(maxDepth,depth);outline.push({documentIndex,path,label,kind,depth,childCount:node.items?.length??0,start:byte(start),end:byte(end),line:content.slice(0,start).split('\n').length,column:start-(content.lastIndexOf('\n',start-1)+1)+1,preview:raw,editable,editUnavailableReason:editable?undefined:fallback})
  if(isMap(node)){
   const merged=node.items.some(p=>p.key?.value==='<<')
   for(const pair of node.items){const key=String(pair.key?.value??'复杂键'),child=/^[_\p{L}][_\p{L}\p{N}]*$/u.test(key)?path+'.'+key:path+'['+JSON.stringify(key)+']';visit(pair.value,child,key,depth+1,documentIndex,blocked||merged||!isScalar(pair.key)||typeof pair.key.value!=='string')}
  }else if(isSeq(node))node.items.forEach((child,i)=>visit(child,path+'['+i+']','['+i+']',depth+1,documentIndex,blocked))
 }
 docs.forEach((doc,i)=>visit(doc.contents,'$','文档 '+(i+1),0,i))
 return{valid:docs.every(d=>!d.errors.length),documentCount:docs.length,nodeCount:outline.length,maxDepth,anchorCount:0,aliasCount:0,taggedNodeCount:0,blockScalarCount:1,outline,outlineTruncated:false,diagnostics:[]}
}
export function fixtureYamlReplace(args){
 const v=args.replacement.trim(),docs=parseAllDocuments(v),node=docs[0]?.contents
 if(docs.length!==1||docs[0].errors.length||!isScalar(node)||node.anchor||node.tag||node.range[0]!==0||node.range[1]!==v.length||/[\r\n]/.test(v))throw Error('请输入合法的单行 YAML 值')
 const bytes=new TextEncoder().encode(args.content),decode=b=>new TextDecoder().decode(b),prior=decode(bytes.slice(args.start,args.end)),old=parseAllDocuments(prior)[0]?.contents
 if(typeof old?.value==='string'&&typeof node.value!=='string')throw Error('当前字段是字符串，请用引号保留字符串类型')
 return decode(bytes.slice(0,args.start))+v+decode(bytes.slice(args.end))
}
