import {parseAllDocuments,isMap,isSeq,isScalar} from 'yaml'
// Simulated IPC for owned browser fixtures; Rust/native tests prove the parser.
export function fixtureYamlFieldCopy({content,start,end,name}){
 const docs=parseAllDocuments(content),byte=i=>new TextEncoder().encode(content.slice(0,i)).length
 if(!name||new TextEncoder().encode(name).length>4096||/[\r\n]/.test(name)||name==='<<')throw Error('请输入单行字段名；名称与草稿仍保留')
 let parent,pair
 const visit=(n,blocked=false)=>{blocked||=!!(n?.anchor||n?.tag);if(isMap(n)){blocked||=n.items.some(p=>!isScalar(p.key)||typeof p.key.value!=='string'||p.key.value==='<<');for(const p of n.items){if(!blocked&&p.key?.range&&byte(p.key.range[0])===start&&byte(p.key.range[1])===end){parent=n;pair=p}visit(p.value,blocked)}}else if(isSeq(n))n.items.forEach(v=>visit(v,blocked))}
 docs.forEach(d=>visit(d.contents))
 if(docs.length!==1||docs.some(d=>d.errors.length)||!parent||!pair||!isScalar(pair.value)||pair.value.anchor||pair.value.tag||/BLOCK/.test(pair.value.type)||content.slice(pair.key.range[0],pair.value.range[1]).includes('\n'))throw Error('此字段的结构或注释无法准确复制，请定位源码；名称与草稿仍保留')
 if(parent.items.some(p=>p.key.value===name))throw Error('同一层级已有这个字段名；名称与草稿仍保留')
 const key=pair.key.type==='QUOTE_SINGLE'?"'"+name.replaceAll("'","''")+"'":pair.key.type==='PLAIN'&&/^[A-Za-z_]\w*$/.test(name)&&!['true','false','null'].includes(name)?name:JSON.stringify(name),a=pair.key.range[0],b=pair.key.range[1],v=pair.value.range[1],field=key+content.slice(b,v)
 let at,insert,offset
 if(parent.flow){at=v;insert=', '+field;offset=2}
 else{const line=content.lastIndexOf('\n',a-1)+1,indent=' '.repeat(a-line),newline=content.indexOf('\n',v),tail=content.slice(v,newline<0?content.length:newline).replace(/\r$/,'');at=newline<0?content.length:newline+1;const eol=content.includes('\r\n')?'\r\n':'\n',prefix=newline<0?eol:'';insert=prefix+indent+field+tail+(newline<0?'':eol);offset=prefix.length+indent.length}
 const result=content.slice(0,at)+insert+content.slice(at),p=at+offset
 const point=new TextEncoder().encode(result.slice(0,p)).length
 return{content:result,start:point,end:point+new TextEncoder().encode(key).length}
}
