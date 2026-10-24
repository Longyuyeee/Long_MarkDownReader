// Limited browser IPC simulation for the owned ordering fixtures, not parser
// proof. The Rust suite and installed application separately verify real TOML.
const byte=s=>new TextEncoder().encode(s).length,decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
function spans(raw){
 const out=[];let from=-1,last=-1,depth=0,quote='',escape=false
 const finish=()=>{if(from>=0){const preview=raw.slice(from,last+1);out.push({start:from,end:last+1,preview,editable:!/^[[{]|^'''|^"""/.test(preview)});from=last=-1}}
 for(let i=1;i<raw.length;i++){
  const c=raw[i]
  if(quote){last=i;if(escape)escape=false;else if(c==='\\'&&quote==='"')escape=true;else if(c===quote)quote='';continue}
  if(c==='#'){while(i<raw.length&&raw[i]!=='\n')i++;continue}
  if((c===','||c===']')&&depth===0){finish();if(c===']')break;continue}
  if(/\s/.test(c))continue
  if(from<0)from=i
  last=i
  if(c==='"'||c==="'")quote=c
  else if(c==='['||c==='{')depth++
  else if(c===']'||c==='}')depth--
 }
 return out
}
function arrayEnd(content,start){
 let depth=0,quote='',escape=false
 for(let i=start;i<content.length;i++){
  const c=content[i]
  if(quote){if(escape)escape=false;else if(c==='\\'&&quote==='"')escape=true;else if(c===quote)quote='';continue}
  if(c==='#'){while(i<content.length&&content[i]!=='\n')i++;continue}
  if(c==='"'||c==="'")quote=c
  else if(c==='[')depth++
  else if(c===']'&&--depth===0)return i+1
 }
 throw Error('Incomplete owned fixture array')
}
export function fixtureTomlKeyAnalysis(content){
 const outline=[];let consumed=0
 for(const m of content.matchAll(/^([A-Za-z_][\w-]*|"[^"\r\n]+")\s*=\s*/gm)){
  if(m.index<consumed)continue
  const start=m.index+m[0].length,array=content[start]==='[',finish=array?arrayEnd(content,start):(content.indexOf('\n',start)<0?content.length:content.indexOf('\n',start))
  const raw=content.slice(start,finish).trimEnd(),end=start+raw.length,name=m[1].startsWith('"')?JSON.parse(m[1]):m[1],path=m[1].startsWith('"')?'['+JSON.stringify(name)+']':name
  consumed=finish
  outline.push({path,label:name,kind:'value',depth:0,preview:raw,array,childCount:array?spans(raw).length:0,start:byte(content.slice(0,start)),end:byte(content.slice(0,end)),editable:!array,field:{name,start:byte(content.slice(0,m.index)),end:byte(content.slice(0,m.index+m[1].length))}})
 }
 return{valid:true,nodeCount:outline.length,tableCount:0,arrayOfTablesCount:0,valueCount:outline.length,maxDepth:2,outline,outlineTruncated:false,diagnostics:[]}
}
function context(args){
 const e=fixtureTomlKeyAnalysis(args.content).outline.find(e=>e.array&&e.start===args.start&&e.end===args.end)
 if(!e)throw Error('数组位置已变化，请定位源码；草稿仍保留')
 const offset=decode(new TextEncoder().encode(args.content).slice(0,e.start)).length,raw=decode(new TextEncoder().encode(args.content).slice(e.start,e.end))
 return{offset,raw,items:spans(raw)}
}
export function fixtureTomlArrayItems(args){const {offset,items}=context(args);return items.map((v,index)=>({...v,index,start:byte(args.content.slice(0,offset+v.start)),end:byte(args.content.slice(0,offset+v.end))}))}
export function fixtureTomlCopy(args){
 const {offset,items}=context(args),all=fixtureTomlArrayItems(args),index=all.findIndex(v=>v.start===args.itemStart&&v.end===args.itemEnd)
 if(index<0||items.some(v=>!v.editable))throw Error('复杂数组请定位源码；草稿仍保留')
 const at=offset+items[index].end,value=items[index].preview,text=args.content.slice(0,at)+', '+value+args.content.slice(at),start=byte(text.slice(0,at+2))
 return{content:text,start,end:start+byte(value)}
}
const independent=raw=>!raw.includes('#')?/^\s*$/.test(raw):raw.split('\n').slice(0,-1).every(s=>/^\s*(?:#.*)?$/.test(s))&&/^\s*\n/.test(raw)&&/\n\s*\n\s*$/.test(raw)
export function fixtureTomlMove(args){
 const {content,direction}=args,{offset,items,raw}=context(args),all=fixtureTomlArrayItems(args),index=all.findIndex(v=>v.start===args.itemStart&&v.end===args.itemEnd),neighbor=direction==='up'?index-1:index+1
 if(index<0||neighbor<0||neighbor>=items.length||items.some(v=>!v.editable))throw Error('此结构请定位源码；草稿仍保留')
 const left=Math.min(index,neighbor),a=items[left],b=items[left+1];let ua=[offset+a.start,offset+a.end],ub=[offset+b.start,offset+b.end],ra=b.preview,rb=a.preview,cursor=1,comments=false
 for(const v of items){comments ||=raw.slice(cursor,v.start).includes('#');cursor=v.end}comments ||=raw.slice(cursor,-1).includes('#')
 if(comments){
  const lines=items.map(v=>{const p=offset+v.start,e=offset+v.end,start=content.lastIndexOf('\n',p-1)+1,n=content.indexOf('\n',e),finish=n<0?content.length:n+1,body=n<0?content.length:n-(content[n-1]==='\r'?1:0),tail=content.slice(e,body),m=tail.match(/^(\s*,)?(\s*(?:#.*)?)$/)
   if(!/^\s*$/.test(content.slice(start,p))||!m)throw Error('注释归属无法确认，请定位源码；草稿仍保留')
   return{start,finish,body,separator:m[1]||'',comment:m[2]||''}
  });let from=offset+1
  for(const line of lines){if(from>line.start||!independent(content.slice(from,line.start)))throw Error('注释归属无法确认，请定位源码；草稿仍保留');from=line.finish}
  if(!independent(content.slice(from,offset+raw.length-1)))throw Error('注释归属无法确认，请定位源码；草稿仍保留')
  const la=lines[left],lb=lines[left+1];ua[1]=la.body;ub[1]=lb.body;ra=b.preview+la.separator+lb.comment;rb=a.preview+lb.separator+la.comment
 }
 const middle=content.slice(ua[1],ub[0]),text=content.slice(0,ua[0])+ra+middle+rb+content.slice(ub[1]),point=direction==='up'?ua[0]:ua[0]+ra.length+middle.length,start=byte(text.slice(0,point))
 return{content:text,start,end:start+byte(items[index].preview)}
}
