// Simulated IPC for real Vue/CodeMirror interaction checks. Rust owns production XML edits.
import {fixtureXmlAnalysis} from './v1215-xml-analysis.mjs'
export {fixtureXmlAnalysis,fixtureXmlReplace,fixtureXmlTextReplace,fixtureXmlCopy,fixtureXmlMove,fixtureXmlDelete} from './v1215-xml-analysis.mjs'
const bytes=s=>new TextEncoder().encode(s),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
function layout({content,start,end}){
 const a=fixtureXmlAnalysis(content),entry=a.outline.find(e=>e.start===start&&e.end===end)
 if(!a.valid||!entry)throw Error('元素位置已变化')
 const text=decode(bytes(content).slice(start,end)),tag=text.match(/^<[^\s!?/<>]+(?:[^<>"']|"[^"]*"|'[^']*')*>/)[0],attrs=[...tag.matchAll(/([^\s=<>/]+)\s*=\s*(['"])(.*?)\2/gs)]
 let cursor=tag.match(/^<[^\s/<>]+/)[0].length
 const fields=attrs.map(m=>{const result={name:m[1],start:cursor,end:m.index+m[0].length,separator:tag.slice(cursor,m.index),quote:m[2]};cursor=result.end;return result})
 return{entry,fields,cursor,start,text}
}
export function fixtureXmlAddAttribute(args){
 const {content,name,value}=args,l=layout(args)
 if(name==='xmlns'||name.includes(':'))throw Error('命名空间声明及带前缀属性请在源码中新增')
 if(!/^[A-Za-z_\u00C0-\uD7FF\uF900-\uFFFD\u{10000}-\u{EFFFF}][A-Za-z_0-9.\-\u00B7\u00C0-\uD7FF\uF900-\uFFFD\u{10000}-\u{EFFFF}]*$/u.test(name))throw Error('请输入有效的 XML 属性名')
 if(l.fields.some(a=>a.name===name))throw Error('此元素已有同名属性')
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value))throw Error('属性值含 XML 不支持的字符')
 const last=l.fields.at(-1),separator=last?.separator||' ',quote=last?.quote||'"',escaped=[...value].map(c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\t':'&#x9;','\n':'&#xA;','\r':'&#xD;'}[c]||(c===quote?(quote==='"'?'&quot;':'&apos;'):c))).join('')
 const position=args.start+bytes(l.text.slice(0,l.cursor)).length,buffer=bytes(content),literal=separator+name+'='+quote+escaped+quote
 return{content:decode(buffer.slice(0,position))+literal+decode(buffer.slice(position)),anchor:position+bytes(separator).length}
}
export function fixtureXmlRemoveAttribute(args){
 const {content,name,start}=args,l=layout(args)
 if(name==='xmlns'||name.includes(':'))throw Error('命名空间声明及带前缀属性请在源码中移除')
 const a=l.fields.find(a=>a.name===name);if(!a)throw Error('此属性已变化')
 const buffer=bytes(content),from=start+bytes(l.text.slice(0,a.start)).length,to=start+bytes(l.text.slice(0,a.end)).length
 return{content:decode(buffer.slice(0,from))+decode(buffer.slice(to)),anchor:start}
}
