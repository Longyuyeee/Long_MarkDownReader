// Limited browser-only grammar for ownership/UI checks. Real TOML spans and
// source preservation are tested separately by Rust and the installed app.
import {fixtureTomlKeyAnalysis as baseAnalysis} from './v1220-toml-analysis.mjs'
export {fixtureTomlReplace,fixtureTomlRename} from './v1220-toml-analysis.mjs'
const byte=s=>new TextEncoder().encode(s).length
const decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
export function fixtureTomlFieldAnalysis(content){
 const analysis=baseAnalysis(content);let offset=0
 for(const line of content.split('\n')){const m=line.match(/^\[([^\]]+)\]/);if(m)analysis.outline.push({kind:'table',path:m[1],label:m[1],depth:0,preview:'',start:byte(content.slice(0,offset)),end:byte(content.slice(0,offset+m[0].length)),parent:m[1]});offset+=line.length+1}
 analysis.outline.sort((a,b)=>a.start-b.start);return analysis
}
export {fixtureTomlFieldAnalysis as fixtureTomlKeyAnalysis}
export function fixtureTomlFields(args,remove=false){
 const {content,start,end}=args,entries=fixtureTomlFieldAnalysis(content).outline,bytes=new TextEncoder().encode(content)
 const entry=entries.find(e=>args.inside?e.kind==='table'&&e.start===start&&e.end===end:e.field?.start===start&&e.field.end===end),parent=args.inside&&start===0&&end===0?'':entry?.parent
 if(parent===undefined)throw Error('字段归属已变化，请重新选择')
 const finish=(s,a,b=a,type)=>({content:s,start:a,end:b,valueType:type})
 if(remove){if(!entry?.field)throw Error('请定位源码删除');const a=decode(bytes.slice(0,start)).lastIndexOf('\n')+1,b=content.indexOf('\n',decode(bytes.slice(0,entry.end)).length);return finish(content.slice(0,a)+content.slice(b<0?content.length:b+1),byte(content.slice(0,a)))}
 const name=args.name,value=args.value.trim();if(!name||/[\r\n]/.test(name))throw Error('请输入单行字段名')
 if(entries.some(e=>e.kind==='value'&&e.parent===parent&&e.field.name===name))throw Error('字段名已存在；输入与草稿仍保留')
 if(!value||/[\r\n#]/.test(value))throw Error('请输入合法单行 TOML 值')
 const key=/^[A-Za-z0-9_-]+$/.test(name)?name:JSON.stringify(name),siblings=entries.filter(e=>e.kind==='value'&&e.parent===parent)
 let at=parent?entries.find(e=>e.kind==='table'&&e.path===parent)?.end:0
 for(const e of siblings)at=Math.max(at,e.end)
 at=decode(bytes.slice(0,at)).length;at=at===0?0:(content.indexOf('\n',at)<0?content.length:content.indexOf('\n',at)+1)
 const prefix=at&&!content.slice(0,at).endsWith('\n')?'\n':'',text=prefix+key+' = '+value+'\n',point=byte(content.slice(0,at)+prefix),type=/^(true|false)$/.test(value)?'布尔':/^['"]/.test(value)?'文本':/^\[/.test(value)?'数组':'数字'
 return finish(content.slice(0,at)+text+content.slice(at),point,point+byte(key),type)
}
