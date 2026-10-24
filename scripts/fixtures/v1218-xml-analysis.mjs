// Simulated browser IPC only; production source changes and namespace handling
// are separately tested against the Rust parser and exact installed executable.
import {fixtureXmlAnalysis} from './v1216-xml-analysis.mjs'
const enc=s=>new TextEncoder().encode(s),dec=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
export function fixtureXmlElementEdit({content,start,end,name,value='' },mode){
 if(!/^[A-Za-z_\u00C0-\uD7FF\uF900-\uFFFD][A-Za-z_0-9.\-\u00B7\u00C0-\uD7FF\uF900-\uFFFD]*$/u.test(name))throw Error('请输入有效的元素本地名称，不含冒号或空格；输入仍保留')
 const a=fixtureXmlAnalysis(content),e=a.outline.find(e=>e.start===start&&e.end===end);if(!a.valid||!e)throw Error('元素位置已变化')
 const b=enc(content),raw=dec(b.slice(start,end)),opening=raw.match(/^<[^\s!?/<>]+(?:[^<>"']|"[^"]*"|'[^']*')*>/)[0],empty=opening.endsWith('/>'),local=e.name.includes(':')?e.name.split(':')[0]+':'+name:name
 let from,to,insert,anchor=start
 if(mode==='rename'){
  insert=raw;if(!empty){const closing=insert.lastIndexOf('</');insert=insert.slice(0,closing+2)+local+insert.slice(closing+2+e.name.length)}
  insert=insert.slice(0,1)+local+insert.slice(1+e.name.length);from=start;to=end
 }else{
  const children=a.outline.filter(c=>c.depth===e.depth+1&&c.start>start&&c.end<end),close=empty?end:start+enc(raw.slice(0,raw.lastIndexOf('</'))).length
  let cursor=start+enc(opening).length;for(const c of children){if(!/^[ \r\n\t]*$/.test(dec(b.slice(cursor,c.start))))throw Error('父元素含正文、注释或处理指令，请在源码中确认新增位置；输入仍保留');cursor=c.end}
  if(!empty&&!/^[ \r\n\t]*$/.test(dec(b.slice(cursor,close))))throw Error('父元素含正文、注释或处理指令，请在源码中确认新增位置；输入仍保留')
  const escaped=value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\r','&#xD;'),literal=value?`<${name}>${escaped}</${name}>`:`<${name}/>`
  if(children.length){const last=children.at(-1),gap=dec(b.slice(children.at(-2)?.end??start+enc(opening).length,last.start)),sep=gap.includes('\n')?gap.slice(gap.lastIndexOf('\n')):gap;from=to=last.end;insert=sep+literal;anchor=from+enc(sep).length}
  else {const prefix=dec(b.slice(0,start)),indent=prefix.slice(prefix.lastIndexOf('\n')+1),body=empty?'':dec(b.slice(start+enc(opening).length,close)),multi=body.includes('\n')||(empty&&prefix.includes('\n')&&/^[ \t]*$/.test(indent)),sep=multi?'\n'+indent+(indent.includes('\t')?'\t':'  '):'';if(empty){from=end-2;to=end;insert='>'+sep+literal+(multi?'\n'+indent:'')+'</'+e.name+'>';anchor=from+1+enc(sep).length}else{from=to=start+enc(opening).length;insert=sep+literal;anchor=from+enc(sep).length}}
 }
 const target=dec(b.slice(0,from))+insert+dec(b.slice(to)),changed=fixtureXmlAnalysis(target).outline.find(c=>c.start===anchor)
 return{content:target,start:anchor,end:changed.end}
}
