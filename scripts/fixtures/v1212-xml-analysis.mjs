// Explicit simulated IPC for browser interaction tests; Rust owns production ranges.
export function fixtureXmlAnalysis(content){
 const doc=new DOMParser().parseFromString(content,'application/xml'),nodes=[...doc.getElementsByTagName('*')]
 const a={valid:!doc.querySelector('parsererror'),outline:[],diagnostics:[],elementCount:0,attributeCount:0,namespaceCount:0,maxDepth:0,commentCount:0,cdataCount:0,processingInstructionCount:0,doctypeCount:0,outlineTruncated:false}
 if(!a.valid){a.diagnostics=[{code:'syntax-error',start:0,end:0,line:1,column:1,message:'XML 语法错误'}];return a}
 a.rootName=doc.documentElement.tagName
 const byte=i=>new TextEncoder().encode(content.slice(0,i)).length,stack=[];let next=0
 for(const m of content.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/[^>]+>|<[^\s!?/<>]+(?:[^<>"']|"[^"]*"|'[^']*')*\/?\s*>|[^<]+/g)){
  const raw=m[0],at=m.index,f=stack.at(-1)
  if(raw.startsWith('<!--')||raw.startsWith('<?'))continue
  if(raw.startsWith('</')){
   const f=stack.pop();if(!f)continue
   f.entry.end=byte(at+raw.length)
   if(f.children)f.entry.textEditUnavailableReason='此元素包含子元素，请在源码中修改文字'
   else if(f.segments.length>1)f.entry.textEditUnavailableReason='此元素含多段或混合文字，请在源码中修改'
   else{const t=f.segments[0]||{kind:'text',value:'',start:byte(at),end:byte(at)};f.entry.text=t;f.entry.textEditUnavailableReason=undefined}
   continue
  }
  if(raw.startsWith('<')&&!raw.startsWith('<![CDATA[')){
   if(f)f.children=true
   const dom=nodes[next++];if(!dom)throw Error('Fixture element mismatch')
   const siblings=dom.parentElement?[...dom.parentElement.children].filter(e=>e.tagName===dom.tagName):[dom]
   const path=(f?.entry.path||'')+'/'+dom.tagName+'['+(siblings.indexOf(dom)+1)+']'
   const attributes=[...raw.matchAll(/([^\s=<>/]+)\s*=\s*(['"])(.*?)\2/gs)].map(m=>{const start=at+m.index+m[0].indexOf(m[2])+1,name=m[1],editable=name!=='xmlns'&&!name.startsWith('xmlns:');return{name,value:dom.getAttribute(name),start:byte(start),end:byte(start+m[3].length),editable,editUnavailableReason:editable?undefined:'命名空间声明请在源码中修改'}})
   const entry={path,name:dom.tagName,depth:stack.length,attributeCount:attributes.length,start:byte(at),end:byte(at+raw.length),line:content.slice(0,at).split('\n').length,column:1,preview:'',attributes,attributesTruncated:false}
   a.outline.push(entry);a.elementCount++;a.attributeCount+=attributes.length;a.namespaceCount+=attributes.filter(v=>!v.editable).length;a.maxDepth=Math.max(a.maxDepth,entry.depth)
   entry.textEditUnavailableReason='自闭合元素请在源码中展开后修改文字'
   if(!raw.endsWith('/>'))stack.push({entry,children:false,segments:[]})
   continue
  }
  if(!f)continue
  const cdata=raw.startsWith('<![CDATA['),kind=cdata?'cdata':'text',from=at+(cdata?9:0),to=at+raw.length-(cdata?3:0)
  const value=cdata?raw.slice(9,-3).replaceAll('\r\n','\n').replaceAll('\r','\n'):new DOMParser().parseFromString('<r>'+raw+'</r>','application/xml').documentElement.textContent
  const previous=f.segments.at(-1)
  if(cdata&&previous?.kind==='cdata'&&previous.end+3===byte(at)){previous.value+=value;previous.end=byte(to)}
  else f.segments.push({kind,value,start:byte(from),end:byte(to)})
 }
 return a
}
export function fixtureXmlTextReplace({content,start,end,replacement}){
 const node=fixtureXmlAnalysis(content).outline.find(e=>e.text?.start===start&&e.text?.end===end),text=node?.text
 if(!text)throw Error('文字位置已过期或不能直接修改')
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(replacement))throw Error('文字含 XML 不支持的字符')
 if(replacement===text.value)return content
 const escaped=text.kind==='cdata'?replacement.replaceAll(']]>',']]]]><![CDATA[>'):replacement.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\r','&#xD;')
 const bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder().decode(b)
 return decode(bytes.slice(0,start))+escaped+decode(bytes.slice(end))
}
export function fixtureXmlReplace({content,start,end,replacement}){
 const a=fixtureXmlAnalysis(content).outline.flatMap(e=>e.attributes).find(v=>v.start===start&&v.end===end)
 if(!a?.editable)throw Error('属性位置已过期')
 const bytes=new TextEncoder().encode(content),quote=String.fromCharCode(bytes[start-1]),decode=b=>new TextDecoder().decode(b)
 const escaped=[...replacement].map(c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\t':'&#x9;','\n':'&#xA;','\r':'&#xD;'}[c]||(c===quote?(quote==='"'?'&quot;':'&apos;'):c))).join('')
 return decode(bytes.slice(0,start))+escaped+decode(bytes.slice(end))
}
