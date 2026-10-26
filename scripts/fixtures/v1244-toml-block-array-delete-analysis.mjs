// Browser IPC simulation only. Actual parser ownership and file bytes are
// independently checked by production Rust and the installed application.
import {fixtureTomlArrayMultilineItems} from './v1239-toml-array-multiline-analysis.mjs'
const bytes=s=>new TextEncoder().encode(s),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
function comma(raw){let comment=false,found;for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='\n')comment=false;else if(!comment){if(c==='#')comment=true;else if(c===','&&found===undefined)found=i;else if(!/\s/.test(c))throw Error('分隔符无法确认；草稿仍保留')}}return found}
export function fixtureTomlBlockArrayDelete(args){
 const {content}=args,all=fixtureTomlArrayMultilineItems(args),index=all.findIndex(v=>v.start===args.itemStart&&v.end===args.itemEnd)
 if(index<0||all.some(v=>!v.editable))throw Error('复杂数组项请定位源码；草稿仍保留')
 const offset=n=>decode(bytes(content).slice(0,n)).length,items=all.map(v=>({...v,start:offset(v.start),end:offset(v.end)})),start=offset(args.start),end=offset(args.end),selected=items[index],multiline=all.some(v=>v.literal||v.multilineBasic)
 let cursor=start+1,comments=false
 for(const v of items){comma(content.slice(cursor,v.start));comments ||=content.slice(cursor,v.start).includes('#');cursor=v.end}comments ||=content.slice(cursor,end-1).includes('#')
 if(multiline&&comments){const from=content.lastIndexOf('\n',selected.start-1)+1,n=content.indexOf('\n',selected.end),body=n<0?content.length:n-(content[n-1]==='\r'?1:0);if(!/^[ \t]*$/.test(content.slice(from,selected.start))||!/^(?:[ \t]*,)?[ \t]*(?:#.*)?$/.test(content.slice(selected.end,body)))throw Error('共享行的注释无法可靠保留，请定位源码；草稿仍保留')}
 const next=items[index+1]?.start??end-1,following=comma(content.slice(selected.end,next));let at
 if(index+1<items.length||items.length===1||multiline&&following!==undefined){if(following!==undefined)at=selected.end+following}
 else{const previous=items[index-1].end;at=previous+comma(content.slice(previous,selected.start))}
 const cuts=[[selected.start,selected.end],...(at===undefined?[]:[[at,at+1]])].sort((a,b)=>b[0]-a[0]);let result=content
 for(const[a,b]of cuts)result=result.slice(0,a)+result.slice(b)
 const nextEnd=args.end+bytes(result).length-bytes(content).length
 const remaining=fixtureTomlArrayMultilineItems({content:result,start:args.start,end:nextEnd}),span=remaining[Math.min(index,remaining.length-1)]
 return{content:result,start:span?.start??args.start,end:span?.end??nextEnd}
}
