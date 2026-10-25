import {parseAllDocuments,isMap,isSeq,isScalar} from 'yaml'
// Owned browser-only simulated IPC. Rust and native flows prove actual parsing.
export function fixtureYamlFieldMove({content,start,end,direction}){
 const docs=parseAllDocuments(content),byte=n=>new TextEncoder().encode(content.slice(0,n)).length;let parent,index
 const visit=(node,blocked=false)=>{blocked||=!!(node?.anchor||node?.tag);if(isMap(node)){blocked||=node.items.some(p=>!isScalar(p.key)||typeof p.key.value!=='string'||p.key.value==='<<');node.items.forEach((p,i)=>{if(!blocked&&p.key?.range&&byte(p.key.range[0])===start&&byte(p.key.range[1])===end){parent=node;index=i}visit(p.value,blocked)})}else if(isSeq(node))node.items.forEach(n=>visit(n,blocked))};docs.forEach(d=>visit(d.contents))
 if(!['up','down'].includes(direction)||docs.length!==1||docs.some(d=>d.errors.length)||!parent)throw Error('字段归属不明确，请定位源码；草稿仍保留')
 const neighbor=index+(direction==='up'?-1:1);if(neighbor<0||neighbor>=parent.items.length)throw Error('已经是第一个或最后一个字段')
 const left=Math.min(index,neighbor),a=parent.items[left],b=parent.items[left+1]
 for(const p of [a,b])if(!isScalar(p.value)||p.value.anchor||p.value.tag||/BLOCK/.test(p.value.type)||content.slice(p.key.range[0],p.value.range[1]).includes('\n'))throw Error('字段结构无法准确移动，请定位源码；草稿仍保留')
 let ua=[a.key.range[0],a.value.range[1]],ub=[b.key.range[0],b.value.range[1]]
 if(parent.flow){let prev=parent.range[0];for(const p of parent.items){if(content.slice(prev,p.key.range[0]).includes('#'))throw Error('注释归属不明确，请定位源码');prev=p.value.range[1]}if(content.slice(prev,parent.range[1]).includes('#'))throw Error('注释归属不明确，请定位源码')}
 else{const body=p=>{const from=content.lastIndexOf('\n',p.key.range[0]-1)+1;let to=content.indexOf('\n',p.value.range[1]);if(to<0)to=content.length;if(content[to-1]==='\r')to--;if(!/^ *$/.test(content.slice(from,p.key.range[0])))throw Error('缩进无法准确移动，请定位源码');return[from,to]};ua=body(a);ub=body(b);const gap=content.slice(ua[1],ub[0]).replace(/^\r?\n/,''),lines=gap.split(/\r?\n/);if(gap.trim()&&!(lines[0].trim()===''&&lines.at(-2)?.trim()===''&&lines.every(s=>!s.trim()||s.trimStart().startsWith('#'))))throw Error('注释归属不明确，请定位源码');if(content.slice(0,ua[0]).replace(/\n$/,'').split('\n').at(-1).trimStart().startsWith('#'))throw Error('注释归属不明确，请定位源码')}
 const rawA=content.slice(...ua),rawB=content.slice(...ub),gap=content.slice(ua[1],ub[0]),result=content.slice(0,ua[0])+rawB+gap+rawA+content.slice(ub[1]),point=direction==='up'?ua[0]+b.key.range[0]-ub[0]:ua[0]+rawB.length+gap.length+a.key.range[0]-ua[0],length=(direction==='up'?b:a).key.range[1]-(direction==='up'?b:a).key.range[0]
 return{content:result,start:new TextEncoder().encode(result.slice(0,point)).length,end:new TextEncoder().encode(result.slice(0,point+length)).length}
}
