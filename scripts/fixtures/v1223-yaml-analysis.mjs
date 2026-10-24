import {parseAllDocuments,isMap,isScalar,isSeq} from 'yaml'
export {fixtureYamlAnalysis,fixtureYamlReplace,fixtureYamlRename,fixtureYamlFields} from './v1221-yaml-analysis.mjs'
// Simulated transform IPC for actual Vue/CodeMirror ownership tests only.
export function fixtureYamlSequence(args,remove=false){
 const {content,start,end}=args,docs=parseAllDocuments(content),byte=i=>new TextEncoder().encode(content.slice(0,i)).length
 let target,index
 const visit=n=>{if(isSeq(n)){if(!args.after&&!remove&&byte(n.range[0])===start&&byte(n.range[1])===end)target=n;for(let i=0;i<n.items.length;i++){const v=n.items[i];if((args.after||remove)&&v?.range&&byte(v.range[0])===start&&byte(v.range[1])===end){target=n;index=i}visit(v)}}else if(isMap(n))n.items.forEach(p=>visit(p.value))};docs.forEach(d=>visit(d.contents))
 if(!target||target.anchor||target.tag||target.items.some(v=>!isScalar(v)||v.anchor||v.tag))throw Error('此列表的引用或集合请定位源码；输入与草稿仍保留')
 const finish=(text,p,n=0,type)=>({content:text,start:new TextEncoder().encode(text.slice(0,p)).length,end:new TextEncoder().encode(text.slice(0,p+n)).length,valueType:type})
 if(!remove){const value=args.value.trim(),parsed=parseAllDocuments(value),v=parsed[0]?.contents;if(!value||/[\r\n]/.test(value)||parsed.length!==1||parsed[0].errors.length||!isScalar(v)||v.anchor||v.tag||v.range[1]!==value.length)throw Error('请输入单行简单值；输入与草稿仍保留');const type=v.value===null?'空值':typeof v.value==='boolean'?'布尔':typeof v.value==='number'?'数字':'文本';const i=args.after?index+1:target.items.length;let at,insert,prefix
 if(target.flow){at=target.items.length?target.items[i-1].range[1]:target.range[1]-1;prefix=target.items.length?', ':'';insert=prefix+value}
 else{const prev=target.items[i-1],start=prev.range[0],end=prev.range[1],line=content.lastIndexOf('\n',start-1)+1,hyphen=content.indexOf('-',line),finish=content.indexOf('\n',end);at=finish<0?content.length:finish+1;prefix=(content.slice(0,at).endsWith('\n')?'':'\n')+' '.repeat(hyphen-line)+'- ';insert=prefix+value+'\n'}
 return finish(content.slice(0,at)+insert+content.slice(at),at+prefix.length,value.length,type)}
 const item=target.items[index],a=item.range[0],b=item.range[1];let text
 if(target.flow){const cuts=[[a,b]];if(target.items.length>1){const comma=index+1<target.items.length?content.indexOf(',',b):content.lastIndexOf(',',a);cuts.push([comma,comma+1])}else{const comma=content.indexOf(',',b);if(comma>=0&&comma<target.range[1]-1)cuts.push([comma,comma+1])}text=content;for(const [a,b]of cuts.sort((a,b)=>b[0]-a[0]))text=text.slice(0,a)+text.slice(b)}
 else{const line=content.lastIndexOf('\n',a-1)+1,hyphen=content.indexOf('-',line),end=content.indexOf('\n',b),finish=end<0?content.length:end+1,comment=content.slice(b,finish).indexOf('#');text=target.items.length===1?content.slice(0,hyphen)+'[]'+content.slice(b):comment>=0?content.slice(0,hyphen)+content.slice(b+comment):content.slice(0,line)+content.slice(finish)}return finish(text,Math.min(a,text.length))
}
