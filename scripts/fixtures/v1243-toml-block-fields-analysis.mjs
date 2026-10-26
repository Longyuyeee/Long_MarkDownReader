// Simulated transform IPC for Vue state tests only; Rust/native prove grammar.
import {fixtureTomlBasicAnalysis} from './v1237-toml-basic-analysis.mjs'
const encode=s=>new TextEncoder().encode(s),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),byte=s=>encode(s).length
export function fixtureTomlBlockField({content,start,end,name,direction}){
 const analysis=fixtureTomlBasicAnalysis(content),entry=analysis.outline.find(e=>e.field?.start===start&&e.field.end===end),char=n=>decode(encode(content).slice(0,n)).length
 if(!entry)throw Error('字段归属已变化；名称与草稿仍保留')
 const siblings=analysis.outline.filter(e=>e.kind==='value'&&e.parent===entry.parent),index=siblings.indexOf(entry)
 const unit=e=>{if(e.field.renameUnavailableReason||/^[\[{]/.test(e.preview))throw Error('复杂字段请定位源码；名称与草稿仍保留');const key=char(e.field.start),valueEnd=char(e.end),from=content.lastIndexOf('\n',key-1)+1,n=content.indexOf('\n',valueEnd),finish=n<0?content.length:n+1,to=n<0?content.length:n-(content[n-1]==='\r'?1:0);return{from,to,finish,key,block:!!e.literal||!!e.multilineBasic}}
 const clearBefore=u=>!content.slice(0,u.from).replace(/\n$/,'').split('\n').at(-1).trimStart().startsWith('#'),clearAfter=u=>!content.slice(u.finish).split('\n')[0].trimStart().startsWith('#')
 let result,selectedName
 if(direction){const neighbor=index+(direction==='up'?-1:1);if(neighbor<0||neighbor>=siblings.length)throw Error('已经是第一个或最后一个字段');const left=Math.min(index,neighbor),a=unit(siblings[left]),b=unit(siblings[left+1]),gap=content.slice(a.to,b.from),inner=gap.replace(/^\r?\n/,''),lines=inner.split('\n');if(!clearBefore(a)||(a.block||b.block)&&!clearAfter(b)||a.to>b.from||inner.trim()&&(lines[0].trim()||lines.at(-2)?.trim()||lines.some(l=>l.trim()&&!l.trimStart().startsWith('#'))))throw Error('注释归属不明确，请定位源码；草稿仍保留');result=content.slice(0,a.from)+content.slice(b.from,b.to)+gap+content.slice(a.from,a.to)+content.slice(b.to);selectedName=entry.field.name}
 else{if(!name||/[\r\n\u0000]/.test(name))throw Error('请输入单行字段名；名称与草稿仍保留');if(siblings.some(e=>e.field.name===name))throw Error('同一层级已有这个字段名；名称与草稿仍保留');const u=unit(entry);if(u.block&&(!clearBefore(u)||!clearAfter(u)))throw Error('注释归属不明确，请定位源码；名称与草稿仍保留');const key=/^[A-Za-z0-9_-]+$/.test(name)?name:JSON.stringify(name),raw=content.slice(u.from,u.key)+key+content.slice(char(entry.field.end),u.finish),separator=u.finish===content.length&&!content.endsWith('\n')?'\n':'';result=content.slice(0,u.finish)+separator+raw+content.slice(u.finish);selectedName=name}
 const selected=fixtureTomlBasicAnalysis(result).outline.find(e=>e.parent===entry.parent&&e.field?.name===selectedName);if(!selected)throw Error('无法确认修改后的字段');return{content:result,start:selected.field.start,end:selected.field.end}
}
