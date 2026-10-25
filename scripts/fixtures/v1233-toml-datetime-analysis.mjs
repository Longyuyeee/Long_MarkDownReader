// UI-only IPC simulation. Rust and installed tests validate real TOML grammar/bytes.
import {fixtureTomlKeyAnalysis as prior,fixtureTomlReplace as replacePrimitive} from './v1225-toml-analysis.mjs'
export function fixtureTomlDatetimeAnalysis(content){
 const a=prior(content)
 for(const e of a.outline)if(/^\d{4}-\d{2}-\d{2}/.test(e.preview)){e.editable=true;e.editUnavailableReason=undefined}
 return a
}
export function fixtureTomlDatetimeReplace(args){
 const value=args.replacement.trim(),date=/^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))?)?$/.exec(value),time=/^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value)
 if(!date&&!time)return replacePrimitive(args)
 if(date&&(Number(date[2])<1||Number(date[2])>12||Number(date[3])<1||Number(date[3])>31||date[4]&&Number(date[4])>23||date[5]&&Number(date[5])>59||date[6]&&Number(date[6])>60||date[7]&&Number(date[7])>23||date[8]&&Number(date[8])>59)||time&&(Number(time[1])>23||Number(time[2])>59||Number(time[3])>60))throw Error('日期或时间无效；输入与草稿已保留')
 const e=fixtureTomlDatetimeAnalysis(args.content).outline.find(e=>e.start===args.start&&e.end===args.end&&e.editable);if(!e)throw Error('字段已变化，草稿仍保留')
 const bytes=new TextEncoder().encode(args.content),decode=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)
 return decode(bytes.slice(0,args.start))+value+decode(bytes.slice(args.end))
}
