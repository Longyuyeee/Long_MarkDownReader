// Browser-only transform simulation for real Vue state/interaction checks.
// Production parser tests and installed file bytes independently prove TOML.
import {fixtureTomlArrayMultilineItems} from './v1239-toml-array-multiline-analysis.mjs'
const bytes=s=>new TextEncoder().encode(s),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),byte=s=>bytes(s).length
const independent=raw=>!raw.includes('#')?/^\s*$/.test(raw):/^\s*\n/.test(raw)&&/\n\s*\n\s*$/.test(raw)&&raw.split('\n').every(s=>!s.trim()||s.trimStart().startsWith('#'))
export function fixtureTomlBlockArray(args){
 const {content,direction}=args,all=fixtureTomlArrayMultilineItems(args),index=all.findIndex(e=>e.start===args.itemStart&&e.end===args.itemEnd)
 if(index<0||all.some(e=>!e.editable))throw Error('复杂数组项请定位源码；草稿仍保留')
 const offset=n=>decode(bytes(content).slice(0,n)).length,items=all.map(e=>({...e,start:offset(e.start),end:offset(e.end)})),range=[offset(args.start),offset(args.end)],selected=items[index]
 let cursor=range[0]+1,comments=false
 for(const e of items){comments ||=content.slice(cursor,e.start).includes('#');cursor=e.end}comments ||=content.slice(cursor,range[1]-1).includes('#')
 const lines=items.map(e=>{const start=content.lastIndexOf('\n',e.start-1)+1,n=content.indexOf('\n',e.end),finish=n<0?content.length:n+1,body=n<0?content.length:n-(content[n-1]==='\r'?1:0),tail=content.slice(e.end,body),m=tail.match(/^([ \t]*,)?([ \t]*(?:#.*)?)$/);return{start,finish,body,separator:m?.[1]||'',comment:m?.[2]||'',valid:!!m&&/^[ \t]*$/.test(content.slice(start,e.start))}})
 let from=range[0]+1,physical=true
 for(const l of lines){physical &&=l.valid&&from<=l.start&&independent(content.slice(from,l.start));from=l.finish}physical &&=from<=range[1]-1&&independent(content.slice(from,range[1]-1))
 if(comments&&!physical)throw Error('注释归属无法确认，请定位源码；草稿仍保留')
 let result,next
 if(direction){
  const neighbor=direction==='up'?index-1:index+1;if(neighbor<0||neighbor>=items.length)throw Error('已经是第一项或最后一项')
  const left=Math.min(index,neighbor),a=items[left],b=items[left+1],la=lines[left],lb=lines[left+1],endA=comments?la.body:a.end,endB=comments?lb.body:b.end,ra=content.slice(b.start,b.end)+(comments?la.separator+lb.comment:''),rb=content.slice(a.start,a.end)+(comments?lb.separator+la.comment:'')
  result=content.slice(0,a.start)+ra+content.slice(endA,b.start)+rb+content.slice(endB);next=neighbor
 }else{
  const raw=content.slice(selected.start,selected.end),line=lines[index]
  if(physical){const clone=content.slice(line.start,selected.start)+raw+line.separator+line.comment+content.slice(line.body,line.finish);result=content.slice(0,line.finish)+clone+content.slice(line.finish);if(!line.separator)result=result.slice(0,selected.end)+','+result.slice(selected.end)}else result=content.slice(0,selected.end)+', '+raw+content.slice(selected.end)
  next=index+1
 }
 const nextEnd=args.end+byte(result)-byte(content),span=fixtureTomlArrayMultilineItems({content:result,start:args.start,end:nextEnd})[next]
 return{content:result,start:span.start,end:span.end}
}
