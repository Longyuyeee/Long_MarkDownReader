import {parseDocument,isSeq,isMap,isScalar} from 'yaml'
export function fixtureYamlMove({content,start,end,direction}) {
 const bytes=new TextEncoder().encode(content),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),offset=n=>decode(bytes.slice(0,n)).length
 start=offset(start);end=offset(end);const doc=parseDocument(content);let parent,index
 const visit=node=>{if(isSeq(node)){const i=node.items.findIndex(v=>v?.range?.[0]===start&&v?.range?.[1]===end);if(i>=0){parent=node;index=i}else node.items.forEach(visit)}else if(isMap(node))node.items.forEach(p=>visit(p.value))};visit(doc.contents)
 if(!parent||parent.items.some(v=>!isScalar(v)||content.slice(v.range[0],v.range[1]).includes('\n')))throw Error('复杂列表请定位源码；草稿仍保留')
 const next=index+(direction==='up'?-1:1);if(next<0||next>=parent.items.length)throw Error('已经是第一项或最后一项')
 const left=Math.min(index,next),a=parent.items[left].range,b=parent.items[left+1].range;let ua=a.slice(0,2),ub=b.slice(0,2)
 if(parent.flow){let prev=parent.range[0];for(const item of parent.items){if(content.slice(prev,item.range[0]).includes('#'))throw Error('注释归属不明确，请定位源码');prev=item.range[1]}if(content.slice(prev,parent.range[1]).includes('#'))throw Error('注释归属不明确，请定位源码')}
 else{const body=r=>{const from=content.lastIndexOf('\n',r[0]-1)+1;let to=content.indexOf('\n',r[1]);if(to<0)to=content.length;if(content[to-1]==='\r')to--;return[from,to]};ua=body(a);ub=body(b);const gap=content.slice(ua[1],ub[0]).replace(/^\r?\n/,'');if(gap.includes('#')){const lines=gap.replace(/\r?\n$/,'').split(/\r?\n/);if(lines[0].trim()||lines.at(-1).trim())throw Error('注释归属不明确，请定位源码')}}
 const ra=content.slice(...ua),rb=content.slice(...ub),gap=content.slice(ua[1],ub[0]),result=content.slice(0,ua[0])+rb+gap+ra+content.slice(ub[1]);let point=direction==='up'?ua[0]+b[0]-ub[0]:ua[0]+rb.length+gap.length+a[0]-ua[0]
 return{content:result,start:new TextEncoder().encode(result.slice(0,point)).length,end:new TextEncoder().encode(result.slice(0,point+end-start)).length}
}
