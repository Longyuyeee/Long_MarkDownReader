// Browser fixture only: native IPC is simulated. Production parsing stays in Rust.
import {fixtureJsonAnalysis} from './v127-json-analysis.mjs'
export function fixtureCopy(args){
 const {content,start,end,newKey}=args,a=fixtureJsonAnalysis(content),entry=a.paths.find(p=>p.start===start&&p.end===end)
 if(!entry)throw Error('目标节点已经过期')
 const parent=a.paths.find(p=>p.depth===entry.depth-1&&p.start<start&&p.end>end),siblings=a.paths.filter(p=>p.depth===entry.depth&&p.start>parent.start&&p.end<parent.end),index=siblings.indexOf(entry),b=new TextEncoder().encode(content),decode=(s,e)=>new TextDecoder().decode(b.slice(s,e)),property=newKey!==null
 if(property&&siblings.some(p=>p.label===newKey))throw Error('同级已存在这个字段名，请换一个名称；原字段未被覆盖')
 const nodeStart=property?entry.keyStart:start,before=decode(index?siblings[index-1].end:parent.start+1,nodeStart),after=decode(end,siblings[index+1]?(siblings[index+1].keyStart??siblings[index+1].start):parent.end-1)
 if((before+after).replace(/[\s,]/g,''))throw Error('节点旁存在归属不明的注释，可在源码中复制；当前内容未变')
 const whitespace=before.split(',').pop(),encoded=property?JSON.stringify(newKey):'',raw=property?encoded+decode(entry.keyEnd,end):decode(start,end),insert=','+whitespace+raw,offset=property?new TextEncoder().encode(encoded).length+start-entry.keyEnd:0,copyStart=end+new TextEncoder().encode(','+whitespace).length+offset
 return{content:decode(0,end)+insert+decode(end),start:copyStart,end:copyStart+end-start}
}
