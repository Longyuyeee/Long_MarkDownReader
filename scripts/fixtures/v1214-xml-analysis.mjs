// Explicit simulated IPC for real Vue/CodeMirror; production analysis is Rust-owned.
import {fixtureXmlAnalysis as baseAnalysis} from './v1213-xml-analysis.mjs'
export {fixtureXmlReplace,fixtureXmlTextReplace,fixtureXmlCopy} from './v1213-xml-analysis.mjs'
export function fixtureXmlAnalysis(content){
 const a=baseAnalysis(content)
 for(const e of a.outline){e.order=null;e.moveUnavailableReason=e.depth===0?'根元素没有同级元素，请在源码中调整':'同级内容含正文、注释或处理指令，请在源码中确认要移动的范围'}
 for(const parent of a.outline){
  const children=a.outline.filter(e=>e.depth===parent.depth+1&&e.start>parent.start&&e.end<parent.end),range=e=>e?{start:e.start,end:e.end}:null
  for(const[i,e]of children.entries())if(e.copy){e.order={previous:range(children[i-1]),next:range(children[i+1])};e.moveUnavailableReason=null}
 }
 return a
}
export function fixtureXmlMove({content,start,end,direction}){
 const entry=fixtureXmlAnalysis(content).outline.find(e=>e.start===start&&e.end===end)
 if(!entry?.order)throw Error(entry?.moveUnavailableReason||'元素位置已过期')
 const neighbor=entry.order[direction==='up'?'previous':'next'];if(!neighbor)throw Error('已在首尾')
 const bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder().decode(b),left=direction==='up'?neighbor:entry,right=direction==='up'?entry:neighbor
 const gap=decode(bytes.slice(left.end,right.start)),raw=decode(bytes.slice(start,end)),rightRaw=decode(bytes.slice(right.start,right.end)),leftRaw=decode(bytes.slice(left.start,left.end))
 const result=decode(bytes.slice(0,left.start))+rightRaw+gap+leftRaw+decode(bytes.slice(right.end)),position=direction==='up'?left.start:left.start+new TextEncoder().encode(rightRaw+gap).length
 return{content:result,start:position,end:position+new TextEncoder().encode(raw).length}
}
