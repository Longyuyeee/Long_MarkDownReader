// Explicit simulated IPC. Production element ranges and changes are owned by Rust.
import {fixtureXmlAnalysis as baseAnalysis} from './v1212-xml-analysis.mjs'
export {fixtureXmlReplace,fixtureXmlTextReplace} from './v1212-xml-analysis.mjs'
export function fixtureXmlAnalysis(content){
 const a=baseAnalysis(content),bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder().decode(b)
 for(const e of a.outline){e.copy=null;e.copyUnavailableReason=e.depth===0?'根元素不能在同一文档中复制，请在源码中编辑':'父元素结构无法完整确认，请在源码中复制'}
 for(const parent of a.outline){
  const children=a.outline.filter(e=>e.depth===parent.depth+1&&e.start>parent.start&&e.end<parent.end)
  if(!children.length)continue
  const raw=decode(bytes.slice(parent.start,parent.end)),opening=raw.match(/^<[^\s!?/<>]+(?:[^<>"']|"[^"]*"|'[^']*')*>/)[0]
  let previous=parent.start+new TextEncoder().encode(opening).length
  const closing=parent.start+new TextEncoder().encode(raw.slice(0,raw.lastIndexOf('</'))).length,separators=[]
  for(const child of children){if(!/^[ \t\r\n]*$/.test(decode(bytes.slice(previous,child.start))))break;separators.push([previous,child.start]);previous=child.end}
  const ok=separators.length===children.length&&/^[ \t\r\n]*$/.test(decode(bytes.slice(previous,closing)))
  for(const[i,child]of children.entries()){if(ok){child.copy={separatorStart:separators[i][0],separatorEnd:separators[i][1]};child.copyUnavailableReason=null}else child.copyUnavailableReason='同级内容含正文、注释或处理指令，请在源码中确认要复制的范围'}
 }
 return a
}
export function fixtureXmlCopy({content,start,end}){
 const entry=fixtureXmlAnalysis(content).outline.find(e=>e.start===start&&e.end===end)
 if(!entry?.copy)throw Error(entry?.copyUnavailableReason||'元素位置已过期')
 const bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder().decode(b)
 return decode(bytes.slice(0,end))+decode(bytes.slice(entry.copy.separatorStart,entry.copy.separatorEnd))+decode(bytes.slice(start,end))+decode(bytes.slice(end))
}
