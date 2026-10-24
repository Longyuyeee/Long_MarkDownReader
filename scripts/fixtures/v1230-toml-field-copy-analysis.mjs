import {fixtureTomlKeyAnalysis} from './v1225-toml-analysis.mjs'
// Owned browser-only simulated IPC. Rust/native flows prove parser semantics.
export function fixtureTomlFieldCopy({content,start,end,name}){
 const entries=fixtureTomlKeyAnalysis(content).outline,e=entries.find(e=>e.field?.start===start&&e.field.end===end),bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),byte=s=>new TextEncoder().encode(s).length
 if(!name||byte(name)>4096||/[\x00-\x1f\x7f]/.test(name))throw Error('请输入单行字段名；名称与草稿仍保留')
 if(!e||e.field.renameUnavailableReason||/^(?:\[|\{|'''|""")/.test(e.preview))throw Error('此字段的结构无法准确复制，请定位源码；名称与草稿仍保留')
 if(entries.some(v=>v.parent===e.parent&&v.field?.name===name))throw Error('同一层级已有这个字段名；名称与草稿仍保留')
 const a=decode(bytes.slice(0,start)).length,b=decode(bytes.slice(0,end)).length,v=decode(bytes.slice(0,e.end)).length,line=content.lastIndexOf('\n',a-1)+1,n=content.indexOf('\n',v),at=n<0?content.length:n+1,eol=content.includes('\r\n')?'\r\n':'\n',prefix=n<0?eol:'',key=/^[A-Za-z0-9_-]+$/.test(name)?name:JSON.stringify(name),insert=prefix+content.slice(line,a)+key+content.slice(b,at),point=byte(content.slice(0,at)+prefix+content.slice(line,a))
 return{content:content.slice(0,at)+insert+content.slice(at),start:point,end:point+byte(key)}
}
