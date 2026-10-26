// Simulated IPC only; the production parser and installed app prove TOML ownership.
import {fixtureTomlBasicAnalysis} from './v1237-toml-basic-analysis.mjs'
const encode=s=>new TextEncoder().encode(s),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
export function fixtureTomlBlockFieldDelete({content,start,end}){
 const before=fixtureTomlBasicAnalysis(content),entry=before.outline.find(e=>e.field?.start===start&&e.field.end===end),char=n=>decode(encode(content).slice(0,n)).length
 if(!entry||entry.field.renameUnavailableReason)throw Error('字段归属不明确，请定位源码；草稿仍保留')
 const value=content.slice(char(entry.start),char(entry.end))
 if((/[\r\n]/.test(value)&&!entry.literal&&!entry.multilineBasic)||entry.array&&!value.trimEnd().endsWith(']'))throw Error('复杂多行字段请定位源码删除；草稿仍保留')
 const key=char(start),from=Math.max(content.lastIndexOf('\n',key-1)+1,content.startsWith('\uFEFF')?1:0),at=char(entry.end),newline=content.indexOf('\n',at),to=newline<0?content.length:newline+1,tail=content.slice(at,to),comment=tail.trimStart().startsWith('#')?content.slice(from,key)+tail.trimStart():''
 const result=content.slice(0,from)+comment+content.slice(to),after=fixtureTomlBasicAnalysis(result),siblings=before.outline.filter(e=>e.kind==='value'&&e.parent===entry.parent),index=siblings.indexOf(entry),next=siblings[index+1]||siblings[index-1],selected=next?after.outline.find(e=>e.parent===entry.parent&&e.field?.name===next.field.name):after.outline.find(e=>e.kind==='table'&&e.path===entry.parent)
 const root=result.startsWith('\uFEFF')?3:0
 return{content:result,start:selected?.field?.start??selected?.start??root,end:selected?.field?.end??selected?.end??root}
}
