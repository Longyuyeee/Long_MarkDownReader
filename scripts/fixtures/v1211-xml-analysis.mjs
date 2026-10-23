// Simulated browser IPC only. Production ranges use quick-xml in Rust.
export function fixtureXmlAnalysis(content){
 const doc=new DOMParser().parseFromString(content,'application/xml'),outline=[],byte=i=>new TextEncoder().encode(content.slice(0,i)).length
 if(doc.querySelector('parsererror'))return{valid:false,outline,diagnostics:[{code:'syntax-error',start:0,end:0,line:1,column:1,message:'XML 语法错误'}]}
 const raw=[...content.matchAll(/<([^\s!?/<>]+)((?:[^<>"']|"[^"]*"|'[^']*')*)\/?\s*>/g)],nodes=[...doc.getElementsByTagName('*')]
 const paths=new Map(),depths=new Map();let attributes=0,namespaces=0
 nodes.forEach((node,index)=>{
  const tag=raw[index];if(!tag||tag[1]!==node.tagName)throw Error('Fixture XML ranges mismatch')
  const siblings=node.parentElement?[...node.parentElement.children].filter(n=>n.tagName===node.tagName):[node],path=(paths.get(node.parentElement)||'')+'/'+node.tagName+'['+(siblings.indexOf(node)+1)+']',depth=depths.get(node.parentElement)===undefined?0:depths.get(node.parentElement)+1
  paths.set(node,path);depths.set(node,depth)
  const attrs=[...tag[0].matchAll(/([^\s=<>/]+)\s*=\s*(['"])(.*?)\2/gs)].map(a=>{
   const start=tag.index+a.index+a[0].indexOf(a[2])+1,end=start+a[3].length,name=a[1],editable=name!=='xmlns'&&!name.startsWith('xmlns:');if(!editable)namespaces++
   return{name,value:node.getAttribute(name),start:byte(start),end:byte(end),editable,editUnavailableReason:editable?undefined:'命名空间声明请在源码中修改'}
  });attributes+=attrs.length
  outline.push({path,name:node.tagName,depth,attributeCount:attrs.length,start:byte(tag.index),end:byte(tag.index+tag[0].length),line:content.slice(0,tag.index).split('\n').length,column:1,preview:attrs.map(a=>a.name+'="'+a.value+'"').join(' '),attributes:attrs,attributesTruncated:false})
 })
 return{valid:true,rootName:doc.documentElement.tagName,elementCount:outline.length,attributeCount:attributes,namespaceCount:namespaces,maxDepth:Math.max(0,...outline.map(n=>n.depth)),commentCount:1,cdataCount:0,processingInstructionCount:0,doctypeCount:0,outline,outlineTruncated:false,diagnostics:[]}
}
export function fixtureXmlReplace({content,start,end,replacement}){
 const entry=fixtureXmlAnalysis(content).outline.flatMap(n=>n.attributes).find(a=>a.start===start&&a.end===end)
 if(!entry?.editable)throw Error('此属性请在源码中修改')
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(replacement))throw Error('属性值含 XML 不支持的字符')
 if(replacement===entry.value)return content
 const bytes=new TextEncoder().encode(content),quote=String.fromCharCode(bytes[start-1]),decode=b=>new TextDecoder().decode(b)
 const escaped=[...replacement].map(c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\t':'&#x9;','\n':'&#xA;','\r':'&#xD;'}[c]||(c===quote?(quote==='"'?'&quot;':'&apos;'):c))).join('')
 return decode(bytes.slice(0,start))+escaped+decode(bytes.slice(end))
}
