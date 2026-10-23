// Explicit simulated IPC; production element deletion and ranges are Rust-owned.
import {fixtureXmlAnalysis} from './v1214-xml-analysis.mjs'
export {fixtureXmlAnalysis,fixtureXmlReplace,fixtureXmlTextReplace,fixtureXmlCopy,fixtureXmlMove} from './v1214-xml-analysis.mjs'
export function fixtureXmlDelete({content,start,end}){
 const a=fixtureXmlAnalysis(content),e=a.outline.find(e=>e.start===start&&e.end===end)
 if(!e?.copy||!e?.order)throw Error(e?.depth===0?'根元素不能删除':'同级内容含正文、注释或处理指令')
 const bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),cut=e.copy.separatorStart,removed=end-cut
 const anchor=e.order.next?e.order.next.start-removed:e.order.previous?e.order.previous.start:a.outline.filter(p=>p.start<start&&p.end>end).sort((x,y)=>y.depth-x.depth)[0].start
 return{content:decode(bytes.slice(0,cut))+decode(bytes.slice(end)),anchor}
}
