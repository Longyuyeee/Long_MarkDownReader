// Limited simulated IPC for real Vue/CodeMirror state checks, not TOML parser proof.
export {fixtureTomlKeyAnalysis,fixtureTomlReplace,fixtureTomlRename,fixtureTomlFields,fixtureTomlArrayItems,fixtureTomlArrayChange} from './v1224-toml-analysis.mjs'
import {fixtureTomlArrayItems} from './v1224-toml-analysis.mjs'
export function fixtureTomlItemReplace(args){
 const items=fixtureTomlArrayItems(args),item=items.find(v=>v.start===args.itemStart&&v.end===args.itemEnd)
 if(!item||items.some(v=>!v.editable))throw Error('条目或集合无法可靠修改，请定位源码；输入与草稿仍保留')
 const value=args.replacement.trim(),string=/^'(?:[^'\r\n]*)'$/.test(value)||/^"(?:\\.|[^"\\\r\n])*"$/.test(value),boolean=/^(true|false)$/.test(value),date=/^\d{4}-\d\d-\d\d(?:T[^ ]+)?$/.test(value),number=/^[-+]?(?:0x[0-9a-f_]+|\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?)$/i.test(value)
 if(!value||/[\r\n]/.test(value)||/^('''|""")/.test(value)||!string&&!boolean&&!date&&!number)throw Error('请输入文本、数字、布尔或日期时间；字符串需要引号，输入仍保留')
 const bytes=new TextEncoder().encode(args.content),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),content=decode(bytes.slice(0,item.start))+value+decode(bytes.slice(item.end))
 return{content,start:item.start,end:item.start+new TextEncoder().encode(value).length,valueType:string?'文本':boolean?'布尔':date?'日期时间':'数字'}
}
