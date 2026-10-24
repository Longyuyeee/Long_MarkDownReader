// Limited simulated IPC for actual Vue/CodeMirror ownership checks only.
// The Rust module and installed application separately verify real TOML parsing.
import {fixtureTomlFieldAnalysis} from './v1222-toml-analysis.mjs'
export {fixtureTomlReplace,fixtureTomlRename,fixtureTomlFields} from './v1222-toml-analysis.mjs'
const byte=s=>new TextEncoder().encode(s).length,decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
export function fixtureTomlKeyAnalysis(content){const r=fixtureTomlFieldAnalysis(content);for(const e of r.outline){e.array=e.kind==='value'&&e.preview.startsWith('[');if(e.array)e.childCount=tokens(e.preview).length}return r}
function tokens(raw){
 const result=[];let from=1,quote='',escape=false,depth=0
 for(let i=1;i<raw.length;i++){const c=raw[i];if(quote){if(escape)escape=false;else if(c==='\\'&&quote==='"')escape=true;else if(c===quote)quote='';continue}if(c==='"'||c==="'"){quote=c;continue}if(c==='['||c==='{'){depth++;continue}if(c==='}'||c===']'&&depth>0){depth--;continue}if((c===','||c===']')&&depth===0){const part=raw.slice(from,i),text=part.trim();if(text){const start=from+part.indexOf(text);result.push({start,end:start+text.length,preview:text,editable:!text.startsWith('[')&&!text.startsWith('{')})}from=i+1}}
 return result
}
function context(args){const e=fixtureTomlKeyAnalysis(args.content).outline.find(e=>e.array&&e.start===args.start&&e.end===args.end);if(!e)throw Error('数组位置已变化，请重新选择');const bytes=new TextEncoder().encode(args.content),offset=decode(bytes.slice(0,e.start)).length,raw=decode(bytes.slice(e.start,e.end)),items=tokens(raw);return{e,offset,raw,items}}
export function fixtureTomlArrayItems(args){const {offset,items}=context(args);return items.map((item,index)=>({...item,index,start:byte(args.content.slice(0,offset+item.start)),end:byte(args.content.slice(0,offset+item.end))}))}
export function fixtureTomlArrayChange(args,remove=false){
 const {content}=args,{offset,raw,items}=context(args),all=fixtureTomlArrayItems(args)
 if(items.some(v=>!v.editable))throw Error('嵌套数组和内联表请定位源码；输入与草稿仍保留')
 const index=remove?all.findIndex(v=>v.start===args.itemStart&&v.end===args.itemEnd):args.afterStart!==undefined?all.findIndex(v=>v.start===args.afterStart&&v.end===args.afterEnd):items.length
 if(index<0)throw Error('条目已变化，请重新选择')
 let text,point=offset,type
 if(!remove){const value=args.value.trim();if(!value||/[\r\n#]/.test(value)||!(/^'(?:[^']*)'$/.test(value)||/^"(?:\\.|[^"\\])*"$/.test(value)||/^(?:true|false|[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?|\d{4}-\d\d-\d\d(?:T[^ ]+)?)$/i.test(value)))throw Error('请输入单行 TOML 标量；字符串需要引号，输入仍保留');const n=args.afterStart!==undefined?index+1:index,at=items.length?items[n-1].end:raw.length-1,prefix=items.length?', ':'';text=content.slice(0,offset+at)+prefix+value+content.slice(offset+at);point=offset+at+prefix.length;type=/^['"]/.test(value)?'文本':/^(true|false)$/.test(value)?'布尔':/^\d{4}-/.test(value)?'日期时间':'数字';return{content:text,start:byte(text.slice(0,point)),end:byte(text.slice(0,point+value.length)),valueType:type}}
 const selected=items[index],cuts=[[offset+selected.start,offset+selected.end]];let comma
 if(items.length===1){comma=raw.indexOf(',',selected.end);if(comma>=0&&comma<raw.length-1)cuts.push([offset+comma,offset+comma+1])}
 else{comma=index+1<items.length?raw.indexOf(',',selected.end):raw.lastIndexOf(',',selected.start);cuts.push([offset+comma,offset+comma+1])}
 text=content;for(const[a,b]of cuts.sort((a,b)=>b[0]-a[0]))text=text.slice(0,a)+text.slice(b);return{content:text,start:byte(text.slice(0,point)),end:byte(text.slice(0,point))}
}
