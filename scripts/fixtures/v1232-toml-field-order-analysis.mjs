import {fixtureTomlKeyAnalysis} from './v1225-toml-analysis.mjs'
// Browser-only simulated IPC; Rust and actual installed workflows prove parsing.
export function fixtureTomlFieldMove({content,start,end,direction}){
 const all=fixtureTomlKeyAnalysis(content).outline,entry=all.find(e=>e.field?.start===start&&e.field.end===end)
 if(!entry||!['up','down'].includes(direction))throw Error('字段位置已变化，请定位源码')
 const siblings=all.filter(e=>e.kind==='value'&&e.parent===entry.parent),index=siblings.indexOf(entry),neighbor=index+(direction==='up'?-1:1)
 if(neighbor<0||neighbor>=siblings.length)throw Error('已经是第一个或最后一个字段')
 const left=Math.min(index,neighbor),bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),char=n=>decode(bytes.slice(0,n)).length
 const unit=e=>{
  if(e.field.renameUnavailableReason||/^[\[{]/.test(e.preview))throw Error('集合、点键或数组表请定位源码；草稿仍保留')
  const key=char(e.field.start),valueEnd=char(e.end),from=content.lastIndexOf('\n',key-1)+1;let to=content.indexOf('\n',valueEnd);if(to<0)to=content.length;if(content[to-1]==='\r')to--
  if(content.slice(key,valueEnd).includes('\n'))throw Error('多行字段请定位源码')
  return{from,to,key,length:char(e.field.end)-key}
 }
 const a=unit(siblings[left]),b=unit(siblings[left+1]),gap=content.slice(a.to,b.from),inner=gap.replace(/^\r?\n/,''),lines=inner.split(/\r?\n/)
 if(a.to>b.from||inner.trim()&&!(lines[0].trim()===''&&lines.at(-2)?.trim()===''&&lines.every(s=>!s.trim()||s.trimStart().startsWith('#'))))throw Error('注释归属不明确，请定位源码；草稿仍保留')
 if(content.slice(0,a.from).replace(/\n$/,'').split('\n').at(-1).trimStart().startsWith('#'))throw Error('注释归属不明确，请定位源码；草稿仍保留')
 const rawA=content.slice(a.from,a.to),rawB=content.slice(b.from,b.to),result=content.slice(0,a.from)+rawB+gap+rawA+content.slice(b.to),point=direction==='up'?a.from+b.key-b.from:a.from+rawB.length+gap.length+a.key-a.from,length=direction==='up'?b.length:a.length,byte=s=>new TextEncoder().encode(s).length
 return{content:result,start:byte(result.slice(0,point)),end:byte(result.slice(0,point+length))}
}
